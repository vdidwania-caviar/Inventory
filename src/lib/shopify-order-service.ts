
'use server';

import type { ShopifyOrder, ShopifyOrderCacheItem, ShopifyOrderSyncState, ShopifyTransaction } from '@/lib/types';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

interface ShopifyGraphQLImageNode { /* ... as before ... */ }
interface ShopifyGraphQLImageEdge { /* ... as before ... */ }
interface ShopifyGraphQLMoneyV2 { /* ... as before ... */ }
interface ShopifyGraphQLInventoryItemNode { /* ... as before ... */ }
interface ShopifyGraphQLSelectedOption { /* ... as before ... */ }
interface ShopifyGraphQLVariantNode { /* ... as before ... */ }
interface ShopifyGraphQLVariantEdge { /* ... as before ... */ }
// interface ShopifyGraphQLTransaction { /* ... as before ... */ } // Removed as ShopifyTransaction is imported
interface ShopifyGraphQLOrderNode { /* ... as before ... */ }
interface ShopifyGraphQLOrderEdge { /* ... as before ... */ }
interface ShopifyGraphQLOrdersResponse { /* ... as before ... */ }

const ORDER_SYNC_STATE_DOC_ID = 'shopifyOrdersSyncState';
const SHOPIFY_ORDER_CACHE_COLLECTION = 'shopifyOrderCache';
const DEFAULT_ORDERS_PER_PAGE = 25; 

export async function getShopifyOrderSyncState(): Promise<ShopifyOrderSyncState | null> {
  const adminDb = getAdminDb();
  try {
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const docSnap = await syncStateRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as ShopifyOrderSyncState;
      // Ensure timestamps are ISO strings if they are Firestore Timestamps
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

    // Convert ISO string dates back to Firestore Timestamps for storage
    if (newState.lastOrderSyncTimestamp) {
      updateData.lastOrderSyncTimestamp = Timestamp.fromDate(new Date(newState.lastOrderSyncTimestamp));
    }
    if (newState.lastFullOrderSyncCompletionTimestamp) {
      updateData.lastFullOrderSyncCompletionTimestamp = Timestamp.fromDate(new Date(newState.lastFullOrderSyncCompletionTimestamp));
    }
    
    await syncStateRef.set(updateData, { merge: true });
    console.log("Shopify Order Service: Sync state updated:", newState);
  } catch (error) {
    console.warn("Shopify Order Service: Error updating sync state:", error);
    throw new Error(`Failed to update order sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchAndCacheShopifyOrders({
  forceFullSync = false,
  limit = 0, 
}: {
  forceFullSync?: boolean;
  limit?: number; 
} = {}): Promise<{
  success: boolean;
  fetchedCount: number;
  cachedCount: number;
  deletedCount: number;
  syncTypeUsed?: 'full' | 'delta';
  error?: string;
  details?: string[];
}> {
  console.log(`Shopify Order Service: Starting fetchAndCacheShopifyOrders. ForceFullSync: ${forceFullSync}, Limit: ${limit}`);
  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';

  if (!storeDomain || !accessToken) {
    const errorMsg = 'Shopify store domain or access token is not configured.';
    console.warn(`Shopify Order Service: ${errorMsg}`);
    return { success: false, fetchedCount: 0, cachedCount: 0, deletedCount: 0, error: errorMsg, details: [] };
  }

  const graphqlApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
  const allFetchedOrders: ShopifyOrder[] = [];
  let currentCursor: string | null | undefined = null;
  let hasNextPage = true;
  let pageCount = 0;
  const details: string[] = [];

  let syncState: ShopifyOrderSyncState | null = null;
  try {
    syncState = await getShopifyOrderSyncState();
  } catch (error) {
    const syncStateErrorMsg = `Warning: Could not fetch sync state: ${(error as Error).message}. Proceeding with full sync.`;
    details.push(syncStateErrorMsg);
    console.warn(`Shopify Order Service: ${syncStateErrorMsg}`);
  }

  let effectiveSyncType = forceFullSync || !syncState?.lastFullOrderSyncCompletionTimestamp ? 'full' : 'delta';
  let queryFilter: string | undefined = undefined;
  const currentSyncOperationStartedAt = new Date().toISOString();

  if (effectiveSyncType === 'delta' && syncState?.lastOrderSyncTimestamp) {
    queryFilter = `updated_at:>'${syncState.lastOrderSyncTimestamp}'`;
    console.log(`Shopify Order Service: Determined DELTA SYNC. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
    details.push(`Performing delta sync. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
  } else {
    const reason = effectiveSyncType === 'full' ? (forceFullSync ? 'forced by parameter' : 'no previous full sync recorded')
                   : 'Delta conditions not met (e.g., no lastOrderSyncTimestamp), falling back to full sync.';
    effectiveSyncType = 'full'; // Ensure it's marked as full if delta conditions fail
    console.log(`Shopify Order Service: Determined FULL SYNC. Reason: ${reason}.`);
    details.push(`Performing full sync. Reason: ${reason}.`);
  }
  

  const ordersQuery = `
    query GetOrders($first: Int!, $after: String, $sortKey: OrderSortKeys, $reverse: Boolean, $query: String) {
      orders(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, query: $query) {
        edges {
          cursor
          node {
            id
            name
            email
            phone
            createdAt
            processedAt
            updatedAt
            note
            tags
            poNumber
            displayFinancialStatus
            displayFulfillmentStatus
            customer { id firstName lastName email phone }
            currencyCode
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            lineItems(first: 20) {
              edges {
                node {
                  id
                  title
                  variantTitle
                  quantity
                  sku
                  vendor
                  originalTotalSet { shopMoney { amount currencyCode } }
                  discountedTotalSet { shopMoney { amount currencyCode } }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
            transactions(first: 10) {
              id
              kind
              status
              amountSet { shopMoney { amount currencyCode } }
              gateway
              processedAt
              errorCode
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  try {
    while (hasNextPage) {
      pageCount++;
      const ordersToFetchThisPage = limit > 0 ? Math.min(DEFAULT_ORDERS_PER_PAGE, limit - allFetchedOrders.length) : DEFAULT_ORDERS_PER_PAGE;

      if (limit > 0 && allFetchedOrders.length >= limit) {
        details.push(`Reached fetch limit of ${limit} orders. Stopping pagination.`);
        console.log(`Shopify Order Service: Reached fetch limit of ${limit}. Fetched ${allFetchedOrders.length} orders.`);
        break;
      }
      if (limit > 0 && ordersToFetchThisPage <= 0) {
         details.push(`Fetch limit met, no more orders to fetch this page.`);
         console.log(`Shopify Order Service: Fetch limit met, no more orders to fetch this page.`);
         break;
      }

      console.log(`Shopify Order Service: Fetching page ${pageCount}. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}. Orders to fetch: ${ordersToFetchThisPage}`);
      details.push(`Fetching page ${pageCount} of orders. Orders per page: ${ordersToFetchThisPage}. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}`);

      const variables = {
        first: ordersToFetchThisPage,
        after: currentCursor,
        sortKey: "UPDATED_AT", 
        reverse: false,       
        query: queryFilter,
      };

      const response = await fetch(graphqlApiUrl, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ordersQuery, variables }),
        cache: 'no-store',
      });

      const responseBody: ShopifyGraphQLOrdersResponse = await response.json();

      if (!response.ok || (responseBody.errors && responseBody.errors.length > 0)) {
        const errorMessages = responseBody.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
        throw new Error(`Shopify Order GraphQL API request failed: ${errorMessages}`);
      }

      if (!responseBody.data?.orders) {
        details.push('No order data in Shopify GraphQL response for current page.');
        hasNextPage = false;
        continue;
      }

      const { edges, pageInfo } = responseBody.data.orders;
      if (!edges || edges.length === 0) {
        console.log(`Shopify Order Service: Page ${pageCount} returned no orders. Ending pagination.`);
        details.push(`Page ${pageCount}: No orders returned.`);
        hasNextPage = false;
        continue;
      }

      edges.forEach(edge => {
        const orderNode = edge.node;
        const shopifyOrder: ShopifyOrder = {
          ...orderNode,
          customer: orderNode.customer || undefined,
          billingAddress: orderNode.billingAddress || undefined, 
          shippingAddress: orderNode.shippingAddress || undefined, 
          lineItems: {
            edges: orderNode.lineItems.edges.map(liEdge => ({
              node: {
                ...liEdge.node,
                originalTotalSet: liEdge.node.originalTotalSet ? { shopMoney: liEdge.node.originalTotalSet.shopMoney } : undefined,
                discountedTotalSet: liEdge.node.discountedTotalSet ? { shopMoney: liEdge.node.discountedTotalSet.shopMoney } : undefined,
              }
            }))
          },
           transactions: orderNode.transactions as ShopifyTransaction[] || undefined,
        };
        allFetchedOrders.push(shopifyOrder);
      });

      console.log(`Shopify Order Service: Page ${pageCount} fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}. Has next: ${pageInfo.hasNextPage}`);
      details.push(`Page ${pageCount}: Fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}.`);
      hasNextPage = pageInfo.hasNextPage;
      currentCursor = pageInfo.endCursor;
    }

    console.log(`Shopify Order Service: Fetching complete. Total orders fetched: ${allFetchedOrders.length}. Updating cache using effective sync type: ${effectiveSyncType}...`);
    const cacheResult = await updateShopifyOrderCacheInFirestore(allFetchedOrders, effectiveSyncType === 'full');
    details.push(`Firestore cache: ${cacheResult.countAddedOrUpdated} orders added/updated, ${cacheResult.countDeleted} deleted.`);
    console.log(`Shopify Order Service: Cache update complete. Added/Updated: ${cacheResult.countAddedOrUpdated}, Deleted: ${cacheResult.countDeleted}`);

    const newSyncStateUpdate: Partial<ShopifyOrderSyncState> = {
      lastOrderSyncTimestamp: currentSyncOperationStartedAt,
      lastOrderEndCursor: currentCursor || undefined, // Use currentCursor from the loop
    };
    if (effectiveSyncType === 'full' && !hasNextPage) { 
      newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp = new Date().toISOString();
      console.log(`Shopify Order Service: Full sync completed successfully. Updated lastFullOrderSyncCompletionTimestamp.`);
    }
    await updateShopifyOrderSyncState(newSyncStateUpdate);
    details.push(`Sync state updated. Last sync attempt started: ${newSyncStateUpdate.lastOrderSyncTimestamp}. Last full sync completed: ${newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp || syncState?.lastFullOrderSyncCompletionTimestamp || 'N/A'}`);

    return {
      success: true,
      fetchedCount: allFetchedOrders.length,
      cachedCount: cacheResult.countAddedOrUpdated,
      deletedCount: cacheResult.countDeleted,
      syncTypeUsed: effectiveSyncType,
      details,
    };

  } catch (error: any) {
    console.warn('Shopify Order Service: CRITICAL ERROR in fetchAndCacheShopifyOrders:', error);
    details.push(`Error: ${error.message || String(error)}`);
    return {
      success: false,
      fetchedCount: allFetchedOrders.length, 
      cachedCount: 0, 
      deletedCount: 0,
      syncTypeUsed: effectiveSyncType,
      error: error.message || String(error),
      details,
    };
  }
}

export async function updateShopifyOrderCacheInFirestore(
  orders: ShopifyOrderCacheItem[],
  isFullSync: boolean
): Promise<{ countAddedOrUpdated: number; countDeleted: number }> {
  const adminDb = getAdminDb();
  const cacheCollectionRef = adminDb.collection(SHOPIFY_ORDER_CACHE_COLLECTION);
  let countAddedOrUpdated = 0;
  let countDeleted = 0;
  const MAX_BATCH_OPERATIONS = 490;

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
        existingCacheSnapshot.forEach(doc => {
          if (!newOrderNumericIds.has(doc.id)) {
            staleDocIds.push(doc.id);
          }
        });

        if (staleDocIds.length > 0) {
          console.log(`Shopify Order Service: Found ${staleDocIds.length} stale orders to delete from cache.`);
          for (let i = 0; i < staleDocIds.length; i += MAX_BATCH_OPERATIONS) {
            const batch = adminDb.batch();
            const chunk = staleDocIds.slice(i, i + MAX_BATCH_OPERATIONS);
            chunk.forEach(docId => batch.delete(cacheCollectionRef.doc(docId)));
            await batch.commit();
            countDeleted += chunk.length;
          }
          console.log(`Shopify Order Service: Deleted ${countDeleted} stale orders from Firestore cache.`);
        } else {
           console.log("Shopify Order Service: No stale orders found to delete during full sync.");
        }
      } else {
        console.log("Shopify Order Service: Cache is empty, no stale orders to delete.");
      }
    } else {
        console.log("Shopify Order Service (updateShopifyOrderCacheInFirestore): Performing DELTA sync cache update. Will only add/update.");
    }

    if (orders.length > 0) {
      console.log(`Shopify Order Service: Preparing to add/update ${orders.length} orders in cache.`);
      for (let i = 0; i < orders.length; i += MAX_BATCH_OPERATIONS) {
        const batch = adminDb.batch();
        const chunk = orders.slice(i, i + MAX_BATCH_OPERATIONS);
        chunk.forEach(order => {
          const numericId = order.id.split('/').pop();
          if (numericId) {
            const docRef = cacheCollectionRef.doc(numericId);
            const orderDataForFirestore = JSON.parse(JSON.stringify(order, (key, value) => value === undefined ? null : value));
            batch.set(docRef, orderDataForFirestore, { merge: true }); 
            countAddedOrUpdated++;
          }
        });
        await batch.commit();
        console.log(`Shopify Order Service: Committed batch of ${chunk.length} orders to Firestore cache. Total added/updated so far: ${countAddedOrUpdated}`);
      }
    } else {
        console.log("Shopify Order Service: No new/updated orders to commit to cache.");
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
    throw error; 
  }
}
