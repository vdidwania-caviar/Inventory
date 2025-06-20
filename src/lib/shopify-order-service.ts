
'use server';

import type { ShopifyOrder, ShopifyOrderCacheItem, ShopifyOrderSyncState, ShopifyTransaction, Invoice, InvoiceItem, Customer, Sale } from '@/lib/types';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// Interface for Shopify Order GraphQL API response (simplified)
interface ShopifyGraphQLOrdersResponse {
  data?: {
    orders: {
      edges: Array<{
        cursor: string;
        node: ShopifyOrder; // Using our defined ShopifyOrder type directly
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: Array<{ message: string; extensions?: any; path?: string[] }>;
}


const ORDER_SYNC_STATE_DOC_ID = 'shopifyOrdersSyncState';
const SHOPIFY_ORDER_CACHE_COLLECTION = 'shopifyOrderCache';
const DEFAULT_ORDERS_PER_PAGE = 25;
const MAX_BATCH_OPERATIONS = 450; // Shared constant for batch operations

export async function getShopifyOrderSyncState(): Promise<ShopifyOrderSyncState | null> {
  const adminDb = getAdminDb();
  try {
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const docSnap = await syncStateRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as ShopifyOrderSyncState;
      if (data.lastOrderSyncTimestamp && typeof data.lastOrderSyncTimestamp !== 'string') {
        data.lastOrderSyncTimestamp = (data.lastOrderSyncTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      if (data.lastFullOrderSyncCompletionTimestamp && typeof data.lastFullOrderSyncCompletionTimestamp !== 'string') {
        data.lastFullOrderSyncCompletionTimestamp = (data.lastFullOrderSyncCompletionTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      return data;
    }
    console.log("Shopify Order Service: Sync state document does not exist, initial sync will be full.");
    return null;
  } catch (error) {
    console.warn("Shopify Order Service: Error fetching sync state:", error);
    throw new Error(`Failed to fetch order sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function updateShopifyOrderSyncState(newState: Partial<ShopifyOrderSyncState>): Promise<void> {
  const adminDb = getAdminDb();
  try {
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const updateData: { [key: string]: any } = { ...newState };

    if (newState.lastOrderSyncTimestamp) {
      updateData.lastOrderSyncTimestamp = Timestamp.fromDate(new Date(newState.lastOrderSyncTimestamp));
    }
    if (newState.lastFullOrderSyncCompletionTimestamp) {
      updateData.lastFullOrderSyncCompletionTimestamp = Timestamp.fromDate(new Date(newState.lastFullOrderSyncCompletionTimestamp));
    }
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await syncStateRef.set(updateData, { merge: true });
    console.log("Shopify Order Service: Sync state updated:", newState);
  } catch (error) {
    console.warn("Shopify Order Service: Error updating sync state:", error);
    throw new Error(`Failed to update order sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface FetchAndCacheResult {
  success: boolean;
  fetchedCount: number;
  cachedCount: number;
  deletedCount: number;
  invoicesCreated: number;
  salesItemsCreated: number;
  syncTypeUsed?: 'full' | 'delta';
  error?: string;
  details?: string[];
  // Added for migration specific summary
  salesProcessed?: number;
  salesUpdatedWithInvoiceId?: number;
}

export async function fetchAndCacheShopifyOrders({
  forceFullSync = false,
  limit = 0, 
} = {}): Promise<FetchAndCacheResult> {
  const adminDb = getAdminDb();
  console.log(`Shopify Order Service: Starting fetchAndCacheShopifyOrders. ForceFullSync: ${forceFullSync}, Limit: ${limit}`);
  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';

  const resultSummary: FetchAndCacheResult = {
    success: false, fetchedCount: 0, cachedCount: 0, deletedCount: 0, invoicesCreated: 0, salesItemsCreated: 0, details: []
  };

  if (!storeDomain || !accessToken) {
    const errorMsg = 'Shopify store domain or access token is not configured.';
    console.warn(`Shopify Order Service: ${errorMsg}`);
    resultSummary.error = errorMsg;
    return resultSummary;
  }

  const graphqlApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
  const allFetchedOrders: ShopifyOrder[] = [];
  let currentCursor: string | null | undefined = null;
  let hasNextPage = true;
  let pageCount = 0;

  let syncState: ShopifyOrderSyncState | null = null;
  try {
    syncState = await getShopifyOrderSyncState();
  } catch (error) {
    const syncStateErrorMsg = `Warning: Could not fetch sync state: ${(error as Error).message}. Proceeding with full sync if forced or appropriate.`;
    resultSummary.details?.push(syncStateErrorMsg);
    console.warn(`Shopify Order Service: ${syncStateErrorMsg}`);
  }

  let effectiveSyncType = forceFullSync || !syncState?.lastFullOrderSyncCompletionTimestamp ? 'full' : 'delta';
  resultSummary.syncTypeUsed = effectiveSyncType;
  let queryFilter: string | undefined = undefined;
  const currentSyncOperationStartedAt = new Date().toISOString();

  if (effectiveSyncType === 'delta' && syncState?.lastOrderSyncTimestamp) {
    queryFilter = `updated_at:>'${syncState.lastOrderSyncTimestamp}'`;
    console.log(`Shopify Order Service: Determined DELTA SYNC. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
    resultSummary.details?.push(`Performing delta sync. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
  } else {
    const reason = effectiveSyncType === 'full' ? (forceFullSync ? 'forced by parameter' : !syncState?.lastFullOrderSyncCompletionTimestamp ? 'no previous full sync recorded' : 'delta conditions not met')
                   : 'Delta conditions not met (e.g., no lastOrderSyncTimestamp), falling back to full sync.';
    effectiveSyncType = 'full';
    resultSummary.syncTypeUsed = 'full';
    console.log(`Shopify Order Service: Determined FULL SYNC. Reason: ${reason}.`);
    resultSummary.details?.push(`Performing full sync. Reason: ${reason}.`);
  }

  const ordersQuery = `
    query GetOrders($first: Int!, $after: String, $sortKey: OrderSortKeys, $reverse: Boolean, $query: String) {
      orders(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, query: $query) {
        edges {
          cursor
          node {
            id name email phone createdAt processedAt updatedAt note tags poNumber displayFinancialStatus displayFulfillmentStatus
            customer { id firstName lastName email phone }
            currencyCode
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            lineItems(first: 50) {
              edges {
                node {
                  id title variantTitle quantity sku vendor
                  originalTotalSet { shopMoney { amount currencyCode } } 
                  discountedTotalSet { shopMoney { amount currencyCode } } 
                }
              }
            }
            transactions { 
              id kind status gateway processedAt errorCode
              amountSet { shopMoney { amount currencyCode } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  try {
    while (hasNextPage) {
      pageCount++;
      const ordersToFetchThisPage = limit > 0 ? Math.min(DEFAULT_ORDERS_PER_PAGE, limit - allFetchedOrders.length) : DEFAULT_ORDERS_PER_PAGE;

      if (limit > 0 && allFetchedOrders.length >= limit) {
        resultSummary.details?.push(`Reached fetch limit of ${limit} orders. Stopping pagination.`);
        console.log(`Shopify Order Service: Reached fetch limit of ${limit}. Fetched ${allFetchedOrders.length} orders.`);
        break;
      }
      if (limit > 0 && ordersToFetchThisPage <= 0) {
         resultSummary.details?.push(`Fetch limit met, no more orders to fetch this page.`);
         console.log(`Shopify Order Service: Fetch limit met, no more orders to fetch this page.`);
         break;
      }

      console.log(`Shopify Order Service: Fetching page ${pageCount}. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}. Orders to fetch: ${ordersToFetchThisPage}`);
      resultSummary.details?.push(`Fetching page ${pageCount} of orders. Orders per page: ${ordersToFetchThisPage}. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}`);

      const variables = { first: ordersToFetchThisPage, after: currentCursor, sortKey: "UPDATED_AT", reverse: false, query: queryFilter };
      const response = await fetch(graphqlApiUrl, {
        method: 'POST', headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ordersQuery, variables }), cache: 'no-store',
      });
      const responseBody: ShopifyGraphQLOrdersResponse = await response.json();

      if (!response.ok || (responseBody.errors && responseBody.errors.length > 0)) {
        const errorMessages = responseBody.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
        throw new Error(`Shopify Order GraphQL API request failed: ${errorMessages}`);
      }
      if (!responseBody.data?.orders) {
        resultSummary.details?.push('No order data in Shopify GraphQL response for current page.'); hasNextPage = false; continue;
      }
      const { edges, pageInfo } = responseBody.data.orders;
      if (!edges || edges.length === 0) {
        console.log(`Shopify Order Service: Page ${pageCount} returned no orders. Ending pagination.`);
        resultSummary.details?.push(`Page ${pageCount}: No orders returned.`); hasNextPage = false; continue;
      }
      edges.forEach(edge => allFetchedOrders.push(edge.node as ShopifyOrder));
      console.log(`Shopify Order Service: Page ${pageCount} fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}. Has next: ${pageInfo.hasNextPage}`);
      resultSummary.details?.push(`Page ${pageCount}: Fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}.`);
      hasNextPage = pageInfo.hasNextPage; currentCursor = pageInfo.endCursor;
    }
    resultSummary.fetchedCount = allFetchedOrders.length;

    console.log(`Shopify Order Service: Fetching complete. Total orders fetched: ${resultSummary.fetchedCount}. Updating cache using effective sync type: ${effectiveSyncType}...`);
    const cacheResult = await updateShopifyOrderCacheInFirestore(allFetchedOrders, effectiveSyncType === 'full');
    resultSummary.cachedCount = cacheResult.countAddedOrUpdated; resultSummary.deletedCount = cacheResult.countDeleted;
    resultSummary.details?.push(`Firestore cache: ${cacheResult.countAddedOrUpdated} orders added/updated, ${cacheResult.countDeleted} deleted.`);
    console.log(`Shopify Order Service: Cache update complete. Added/Updated: ${cacheResult.countAddedOrUpdated}, Deleted: ${cacheResult.countDeleted}`);

    let currentBatch = adminDb.batch();
    let operationsInBatch = 0;
    const invoicesCollectionRef = adminDb.collection('invoices');
    const customersCollectionRef = adminDb.collection('customers');
    const salesCollectionRef = adminDb.collection('sales');


    for (const shopifyOrder of allFetchedOrders) {
        if (!shopifyOrder.id || !shopifyOrder.name) {
            console.warn(`Shopify Order Service: Shopify order missing ID or name, skipping invoice creation. Data: ${JSON.stringify(shopifyOrder)}`);
            resultSummary.details?.push(`Skipped invoice creation for Shopify order due to missing ID/name.`);
            continue;
        }

        // Refined Invoice Number Formatting
        let tempOrderName = shopifyOrder.name;
        if (tempOrderName.toUpperCase().startsWith('SH-')) {
             tempOrderName = tempOrderName.substring(3);
        }
        tempOrderName = tempOrderName.replace(/^[0-9]+[.\-_ ]\s*|^#\s*/, '').trim();
        
        let coreOrderNumber = tempOrderName;
        if (/^2\d{4}$/.test(coreOrderNumber)) { // If it's a 5-digit number starting with 2 (e.g., "20175")
            coreOrderNumber = coreOrderNumber.substring(1); // Strip the leading '2' (e.g., "0175")
        }
        const formattedInvoiceNumber = `SH-${coreOrderNumber}`;


        const invoiceDocRef = invoicesCollectionRef.doc(formattedInvoiceNumber);
        const existingInvoiceSnap = await invoiceDocRef.get(); 

        if (existingInvoiceSnap.exists) {
            console.log(`Shopify Order Service: Invoice ${formattedInvoiceNumber} (from Shopify Order GID ${shopifyOrder.id}) already exists. Skipping.`);
            resultSummary.details?.push(`Invoice ${formattedInvoiceNumber} for Shopify Order ${shopifyOrder.name} already exists.`);
            continue;
        }

        let firestoreCustomerId: string | undefined;
        let firestoreCustomerName: string = shopifyOrder.customer?.email || shopifyOrder.email || 'Unknown Customer';

        if (shopifyOrder.customer?.id) { 
            const shopifyCustomerGid = shopifyOrder.customer.id;
            const customerQuery = customersCollectionRef.where('shopifyCustomerId', '==', shopifyCustomerGid).limit(1);
            const existingCustomerSnap = await customerQuery.get();

            if (!existingCustomerSnap.empty) {
                firestoreCustomerId = existingCustomerSnap.docs[0].id;
                firestoreCustomerName = existingCustomerSnap.docs[0].data().name || firestoreCustomerName;
            } else {
                const newCustomerRef = customersCollectionRef.doc();
                const newCustomerData: Partial<Customer> = {
                    name: `${shopifyOrder.customer.firstName || ''} ${shopifyOrder.customer.lastName || ''}`.trim() || shopifyOrder.email || 'Shopify Customer',
                    email: shopifyOrder.customer.email || undefined,
                    phone: shopifyOrder.customer.phone || undefined,
                    shopifyCustomerId: shopifyCustomerGid,
                    createdAt: FieldValue.serverTimestamp() as unknown as string,
                    updatedAt: FieldValue.serverTimestamp() as unknown as string,
                };
                currentBatch.set(newCustomerRef, newCustomerData); operationsInBatch++;
                firestoreCustomerId = newCustomerRef.id;
                firestoreCustomerName = newCustomerData.name!;
                resultSummary.details?.push(`Customer created for Shopify ID ${shopifyCustomerGid}: ${firestoreCustomerName}`);
            }
        } else if (shopifyOrder.customer) {
            firestoreCustomerName = `${shopifyOrder.customer.firstName || ''} ${shopifyOrder.customer.lastName || ''}`.trim() || shopifyOrder.email || 'Shopify Customer (no GID)';
        }

        const invoiceItems: InvoiceItem[] = shopifyOrder.lineItems.edges.map(edge => {
            const node = edge.node;
            const quantity = node.quantity || 0;
            const discountedTotal = parseFloat(node.discountedTotalSet?.shopMoney.amount || node.originalTotalSet.shopMoney.amount || '0');
            const pricePerUnit = quantity > 0 ? discountedTotal / quantity : 0;
            return {
                itemName: node.title,
                itemSku: node.sku || undefined,
                itemQuantity: quantity,
                itemPricePerUnit: parseFloat(pricePerUnit.toFixed(2)),
                lineItemTotal: parseFloat(discountedTotal.toFixed(2)),
            };
        });

        const totalAmount = parseFloat(shopifyOrder.totalPriceSet.shopMoney.amount);
        
        const newInvoiceData: Omit<Invoice, 'id'> = {
            invoiceNumber: formattedInvoiceNumber, // This is also the document ID
            shopifyOrderId: shopifyOrder.id,
            invoiceDate: shopifyOrder.processedAt || shopifyOrder.createdAt, 
            customerName: firestoreCustomerName,
            customerId: firestoreCustomerId,
            items: invoiceItems,
            subtotal: parseFloat(shopifyOrder.subtotalPriceSet?.shopMoney.amount || '0'),
            taxAmount: parseFloat(shopifyOrder.totalTaxSet?.shopMoney.amount || '0'),
            totalAmount: totalAmount,
            invoiceStatus: 'Paid', 
            totalAllocatedPayment: totalAmount, 
            totalBalance: 0,
            channel: 'Shopify',
            createdAt: FieldValue.serverTimestamp() as unknown as string,
            updatedAt: FieldValue.serverTimestamp() as unknown as string,
        };
        currentBatch.set(invoiceDocRef, newInvoiceData); operationsInBatch++; // Use invoiceDocRef (with custom ID)
        resultSummary.invoicesCreated++;
        resultSummary.details?.push(`Invoice ${newInvoiceData.invoiceNumber} created for Shopify Order ${shopifyOrder.name}.`);

        for (const item of newInvoiceData.items) {
            const newSaleRef = salesCollectionRef.doc();
            const saleData: Omit<Sale, 'id'|'items'|'totalAmount'> = { 
                invoiceId: invoiceDocRef.id, // This is now formattedInvoiceNumber
                Invoice: newInvoiceData.invoiceNumber,
                Customer: newInvoiceData.customerName,
                customerId: newInvoiceData.customerId,
                Date: newInvoiceData.invoiceDate, 
                Item: item.itemName,
                SKU: item.itemSku,
                Quantity: item.itemQuantity,
                Price: item.lineItemTotal, 
                Revenue: item.lineItemTotal, 
                channel: 'Shopify',
                allocated_payment: item.lineItemTotal, 
                Balance: 0,
                createdAt: FieldValue.serverTimestamp() as unknown as string,
                updatedAt: FieldValue.serverTimestamp() as unknown as string,
            };
            currentBatch.set(newSaleRef, saleData); operationsInBatch++;
            resultSummary.salesItemsCreated++;
        }

        if (operationsInBatch >= MAX_BATCH_OPERATIONS - 10) { 
            await currentBatch.commit();
            currentBatch = adminDb.batch();
            operationsInBatch = 0;
            console.log("Shopify Order Service: Committed batch during invoice/sales creation.");
        }
    }

    if (operationsInBatch > 0) {
        await currentBatch.commit();
        console.log("Shopify Order Service: Committed final batch for invoices/sales.");
    }

    const newSyncStateUpdate: Partial<ShopifyOrderSyncState> = { lastOrderSyncTimestamp: currentSyncOperationStartedAt };
    if (effectiveSyncType === 'full' && !hasNextPage) { 
      newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp = new Date().toISOString();
      newSyncStateUpdate.lastOrderEndCursor = null; 
      console.log(`Shopify Order Service: Full sync completed successfully. Resetting end cursor and updated lastFullOrderSyncCompletionTimestamp.`);
    } else if (effectiveSyncType === 'delta' || (effectiveSyncType === 'full' && hasNextPage)) {
      newSyncStateUpdate.lastOrderEndCursor = currentCursor || null;
    }
    await updateShopifyOrderSyncState(newSyncStateUpdate);
    resultSummary.details?.push(`Sync state updated. Last sync attempt started: ${newSyncStateUpdate.lastOrderSyncTimestamp}. Last full sync completed: ${newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp || syncState?.lastFullOrderSyncCompletionTimestamp || 'N/A'}`);
    
    resultSummary.success = true;

  } catch (error: any) {
    console.warn('Shopify Order Service: CRITICAL ERROR in fetchAndCacheShopifyOrders:', error);
    resultSummary.details?.push(`Error: ${error.message || String(error)}`);
    resultSummary.error = error.message || String(error);
    resultSummary.success = false; 
  }

  console.log("Shopify Order Service: Final Result Summary:", resultSummary);
  return resultSummary;
}

export async function updateShopifyOrderCacheInFirestore(
  orders: ShopifyOrderCacheItem[],
  isFullSync: boolean
): Promise<{ countAddedOrUpdated: number; countDeleted: number }> {
  const adminDb = getAdminDb();
  const cacheCollectionRef = adminDb.collection(SHOPIFY_ORDER_CACHE_COLLECTION);
  let countAddedOrUpdated = 0;
  let countDeleted = 0;

  try {
    if (isFullSync) {
      console.log("Shopify Order Service (updateShopifyOrderCacheInFirestore): Performing FULL sync cache update. Will delete stale entries.");
      const newOrderNumericIds = new Set<string>();
      orders.forEach(order => {
        const numericId = order.id.split('/').pop();
        if (numericId) newOrderNumericIds.add(numericId);
      });

      const existingCacheSnapshot = await cacheCollectionRef.select().get();
      if (!existingCacheSnapshot.empty) {
        const staleDocIds: string[] = [];
        let batch = adminDb.batch();
        let opsInBatch = 0;
        existingCacheSnapshot.forEach(doc => {
          if (!newOrderNumericIds.has(doc.id)) {
            batch.delete(cacheCollectionRef.doc(doc.id));
            opsInBatch++;
            countDeleted++;
            if (opsInBatch >= MAX_BATCH_OPERATIONS) {
              batch.commit().then(() => console.log(`Shopify Order Service: Committed batch of ${opsInBatch} deletions.`));
              batch = adminDb.batch();
              opsInBatch = 0;
            }
          }
        });
        if (opsInBatch > 0) {
           await batch.commit();
           console.log(`Shopify Order Service: Committed final batch of ${opsInBatch} deletions.`);
        }
        if(countDeleted > 0) console.log(`Shopify Order Service: Deleted ${countDeleted} stale orders from Firestore cache.`);

      } else {
        console.log("Shopify Order Service: Cache is empty, no stale orders to delete.");
      }
    } else {
        console.log("Shopify Order Service (updateShopifyOrderCacheInFirestore): Performing DELTA sync cache update. Will only add/update.");
    }

    if (orders.length > 0) {
      console.log(`Shopify Order Service: Preparing to add/update ${orders.length} orders in cache.`);
      let batch = adminDb.batch();
      let opsInBatch = 0;
      for (const order of orders) {
        const numericId = order.id.split('/').pop();
        if (numericId) {
          const docRef = cacheCollectionRef.doc(numericId);
          const orderDataForFirestore = JSON.parse(JSON.stringify(order, (key, value) => value === undefined ? FieldValue.delete() : value));
          batch.set(docRef, orderDataForFirestore, { merge: true });
          opsInBatch++;
          countAddedOrUpdated++;
          if (opsInBatch >= MAX_BATCH_OPERATIONS) {
            await batch.commit();
            console.log(`Shopify Order Service: Committed batch of ${opsInBatch} order adds/updates to cache.`);
            batch = adminDb.batch();
            opsInBatch = 0;
          }
        }
      }
      if (opsInBatch > 0) {
        await batch.commit();
        console.log(`Shopify Order Service: Committed final batch of ${opsInBatch} order adds/updates to cache.`);
      }
       console.log(`Shopify Order Service: Total ${countAddedOrUpdated} orders added/updated in Firestore cache.`);
    } else if (!isFullSync) {
        console.log("Shopify Order Service: No products provided for delta update. Cache not modified for additions/updates.");
    }

  } catch (error) {
    console.warn("Shopify Order Service: Error updating Firestore cache:", error);
    throw error; 
  }

  return { countAddedOrUpdated, countDeleted };
}

export async function getCachedShopifyOrders(): Promise<ShopifyOrderCacheItem[]> {
  const adminDb = getAdminDb();
  try {
    console.log("Shopify Order Service: Fetching cached Shopify orders from Firestore (limit 250, ordered by createdAt desc).");
    const snapshot = await adminDb
      .collection(SHOPIFY_ORDER_CACHE_COLLECTION)
      .orderBy('createdAt', 'desc') 
      .limit(250) 
      .get();
    if (!snapshot.empty) {
      const results = snapshot.docs.map(doc => doc.data() as ShopifyOrderCacheItem);
      console.log(`Shopify Order Service: Retrieved ${results.length} cached orders.`);
      return results;
    }
    console.log("Shopify Order Service: No cached orders found in Firestore.");
    return [];
  } catch (error) {
    console.warn("Shopify Order Service: Error fetching cached Shopify orders:", error);
    if (error instanceof Error && error.message.includes("indexes?create_composite")) {
        console.error("Firestore index missing for 'shopifyOrderCache' collection. Please create a composite index for 'createdAt' (descending). Check the Firestore console or the link in the error message.");
    }
    throw error; 
  }
}

// --- Retroactive Sales to Invoice Migration ---
export async function migrateExistingSalesToInvoices(): Promise<FetchAndCacheResult> {
  const adminDb = getAdminDb();
  const salesRef = adminDb.collection('sales');
  const invoicesRef = adminDb.collection('invoices');
  let batch = adminDb.batch();
  let operationsInBatch = 0;

  const summary: FetchAndCacheResult = {
    success: false,
    salesProcessed: 0,
    invoicesCreated: 0,
    salesUpdatedWithInvoiceId: 0,
    details: [],
    fetchedCount: 0,
    cachedCount: 0,
    deletedCount: 0,
  };

  try {
    summary.details?.push("Starting migration of existing 'sales' records to 'invoices'. Fetching ALL sales records to check linkage.");
    const salesSnapshot = await salesRef.orderBy('Invoice').get();
    
    const unlinkedSalesDocs = salesSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.invoiceId === null || data.invoiceId === undefined || data.invoiceId === "";
    });

    summary.salesProcessed = unlinkedSalesDocs.length;
    summary.details?.push(`Found ${salesSnapshot.docs.length} total sales records. After filtering, ${summary.salesProcessed} are considered unlinked and will be processed.`);

    if (unlinkedSalesDocs.length === 0) {
      summary.details?.push("No unlinked sales records found after filtering. Migration not needed or already complete.");
      summary.success = true; // Mark as success if nothing to do
      return summary;
    }

    const salesByOriginalInvoiceNum = new Map<string, Sale[]>();
    unlinkedSalesDocs.forEach(doc => {
      const sale = { id: doc.id, ...doc.data() } as Sale;
      const originalInvoiceNum = sale.Invoice; 
      if (originalInvoiceNum) {
        const salesGroup = salesByOriginalInvoiceNum.get(originalInvoiceNum) || [];
        salesGroup.push(sale);
        salesByOriginalInvoiceNum.set(originalInvoiceNum, salesGroup);
      } else {
        summary.details?.push(`Skipping unlinked sale ID ${sale.id} as it has no 'Invoice' (Shopify Order #) field for grouping.`);
      }
    });

    summary.details?.push(`Grouped ${summary.salesProcessed} unlinked sales into ${salesByOriginalInvoiceNum.size} potential invoices based on original Shopify Order #.`);

    for (const [originalShopifyOrderNum, salesGroup] of salesByOriginalInvoiceNum.entries()) {
      let tempOrderName = originalShopifyOrderNum;
      if (tempOrderName.toUpperCase().startsWith('SH-')) { tempOrderName = tempOrderName.substring(3); }
      tempOrderName = tempOrderName.replace(/^[0-9]+[.\-_ ]\s*|^#\s*/, '').trim();
      let coreOrderNumber = tempOrderName;
      if (/^2\d{4}$/.test(coreOrderNumber)) { coreOrderNumber = coreOrderNumber.substring(1); }
      const formattedFirestoreInvoiceId = `SH-${coreOrderNumber}`;

      const invoiceDocRef = invoicesRef.doc(formattedFirestoreInvoiceId);
      const existingInvoiceSnap = await invoiceDocRef.get();
      
      if (!existingInvoiceSnap.exists) {
        const firstSale = salesGroup[0];
        const invoiceItems: InvoiceItem[] = salesGroup.map(s => ({
          itemName: s.Item || 'Unknown Item from Sale',
          itemSku: s.SKU || undefined,
          itemQuantity: s.Quantity || 0,
          itemPricePerUnit: (s.Price && s.Quantity && s.Quantity > 0) ? parseFloat((s.Price / s.Quantity).toFixed(2)) : (s.Price || 0),
          lineItemTotal: s.Price || 0,
 itemNotes: s.notes || null,
        }));

        const subtotal = invoiceItems.reduce((acc, item) => acc + (item.lineItemTotal || 0), 0);
        const taxAmount = firstSale.Tax || 0; 
        const totalAmount = subtotal + taxAmount;
        const allocatedPayment = salesGroup.reduce((acc, s) => acc + (s.allocated_payment || 0), 0) || totalAmount; // Sum payments or default to total

        const newInvoiceData: Omit<Invoice, 'id'> = {
          invoiceNumber: formattedFirestoreInvoiceId,
 shopifyOrderId: firstSale.ID || null,
          invoiceDate: firstSale.Date || new Date().toISOString(), 
          customerName: firstSale.Customer || 'Unknown Customer',
          customerId: firstSale.customerId || firstSale.customer_ID || undefined,
          items: invoiceItems,
          subtotal: parseFloat(subtotal.toFixed(2)),
          taxAmount: parseFloat(taxAmount.toFixed(2)),
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          invoiceStatus: (totalAmount - allocatedPayment <= 0.001) ? 'Paid' : 'Partially Paid', 
          totalAllocatedPayment: parseFloat(allocatedPayment.toFixed(2)),
          totalBalance: parseFloat((totalAmount - allocatedPayment).toFixed(2)),
          channel: firstSale.channel || 'Shopify', 
          createdAt: firstSale.createdAt || FieldValue.serverTimestamp() as any,
          updatedAt: FieldValue.serverTimestamp() as any,
        };
        batch.set(invoiceDocRef, newInvoiceData);
        operationsInBatch++;
        summary.invoicesCreated++;
        summary.details?.push(`Staged new invoice ${formattedFirestoreInvoiceId} (from Shopify Order # ${originalShopifyOrderNum}).`);
      } else {
        summary.details?.push(`Invoice ${formattedFirestoreInvoiceId} (from Shopify Order # ${originalShopifyOrderNum}) already exists.`);
      }

      for (const sale of salesGroup) {
        if (sale.invoiceId !== formattedFirestoreInvoiceId) {
          batch.update(salesRef.doc(sale.id), { 
            invoiceId: formattedFirestoreInvoiceId, 
            updatedAt: FieldValue.serverTimestamp() 
          });
          operationsInBatch++;
          summary.salesUpdatedWithInvoiceId++;
          if (operationsInBatch >= MAX_BATCH_OPERATIONS) { 
            await batch.commit(); 
            batch = adminDb.batch(); 
            operationsInBatch = 0; 
            summary.details?.push("Committed intermediate batch during sales linking.");
          }
        }
      }
      if (operationsInBatch >= MAX_BATCH_OPERATIONS) {
         await batch.commit(); batch = adminDb.batch(); operationsInBatch = 0; 
         summary.details?.push("Committed intermediate batch after processing a sales group.");
      }
    }

    if (operationsInBatch > 0) {
      await batch.commit();
      summary.details?.push("Committed final batch of migration operations.");
    }
    summary.success = true;
    summary.details?.push("Migration process finished successfully.");

  } catch (error: any) {
    console.error("Error during sales to invoice migration:", error);
    summary.success = false;
    summary.error = error.message || "Unknown migration error";
    summary.details?.push(`Migration failed: ${summary.error}`);
    if (operationsInBatch > 0) {
      try {
        await batch.commit();
        summary.details?.push("Committed partial batch before error.");
      } catch (batchError: any) {
        summary.details?.push(`Failed to commit partial batch: ${batchError.message}`);
      }
    }
  }
  return summary;
}
