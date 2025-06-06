
'use server';

import type { ShopifyOrder, ShopifyOrderCacheItem, ShopifyOrderSyncState } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// GraphQL API Response Structures (simplified for brevity, ensure they match actual responses)
interface ShopifyGraphQLOrderNode {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  processedAt?: string | null;
  updatedAt: string;
  note?: string | null;
  tags: string[];
  poNumber?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  billingAddress?: any; // Define more strictly if needed
  shippingAddress?: any; // Define more strictly if needed
  currencyCode: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  subtotalPriceSet?: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalShippingPriceSet?: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalTaxSet?: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalDiscountsSet?: { shopMoney: { amount: string; currencyCode: string } } | null;
  totalRefundedSet?: { shopMoney: { amount: string; currencyCode: string } } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        variantTitle?: string | null;
        quantity: number;
        sku?: string | null;
        vendor?: string | null;
        originalTotalSet?: { shopMoney: { amount: string; currencyCode: string } };
        discountedTotalSet?: { shopMoney: { amount: string; currencyCode: string } };
      };
    }>;
    pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
    };
  };
  transactions?: {
    edges: Array<{
      node: {
        id: string;
        kind: string;
        status: string;
        amountSet: { shopMoney: { amount: string; currencyCode: string } };
        gateway?: string | null;
        processedAt?: string;
        errorCode?: string | null;
      };
    }>;
    pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
    };
  };
}

interface ShopifyGraphQLOrderEdge {
  node: ShopifyGraphQLOrderNode;
  cursor: string;
}

interface ShopifyGraphQLOrdersResponse {
  data?: {
    orders: {
      edges: ShopifyGraphQLOrderEdge[];
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
const DEFAULT_ORDERS_PER_PAGE = 25; // Shopify allows up to 250, but smaller pages are safer for timeouts

async function getShopifyOrderSyncState(): Promise<ShopifyOrderSyncState | null> {
  try {
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const docSnap = await syncStateRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as ShopifyOrderSyncState;
      // Convert Firestore Timestamps back to ISO strings if they are objects
      if (data.lastOrderSyncTimestamp && typeof data.lastOrderSyncTimestamp !== 'string') {
        data.lastOrderSyncTimestamp = (data.lastOrderSyncTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      if (data.lastFullOrderSyncCompletionTimestamp && typeof data.lastFullOrderSyncCompletionTimestamp !== 'string') {
        data.lastFullOrderSyncCompletionTimestamp = (data.lastFullOrderSyncCompletionTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      return data;
    }
    console.log("Shopify Order Service: Sync state document does not exist, will perform full sync.");
    return null;
  } catch (error) {
    console.error("Shopify Order Service: Error fetching sync state:", error);
    throw new Error(`Failed to fetch order sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function updateShopifyOrderSyncState(newState: Partial<ShopifyOrderSyncState>): Promise<void> {
  try {
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const updateData: { [key: string]: any } = { ...newState };

    if (newState.lastOrderSyncTimestamp) {
      updateData.lastOrderSyncTimestamp = Timestamp.fromDate(new Date(newState.lastOrderSyncTimestamp));
    }
    if (newState.lastFullOrderSyncCompletionTimestamp) {
      updateData.lastFullOrderSyncCompletionTimestamp = Timestamp.fromDate(new Date(newState.lastFullOrderSyncCompletionTimestamp));
    }
    
    await syncStateRef.set(updateData, { merge: true });
    console.log("Shopify Order Service: Sync state updated:", newState);
  } catch (error) {
    console.error("Shopify Order Service: Error updating sync state:", error);
    throw new Error(`Failed to update order sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchAndCacheShopifyOrders({
  forceFullSync = false,
  limit = 0, // 0 means fetch all based on pagination
}: {
  forceFullSync?: boolean;
  limit?: number;
} = {}): Promise<{
  success: boolean;
  fetchedCount: number;
  cachedCount: number;
  deletedCount: number;
  error?: string;
  details?: string[];
}> {
  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';

  if (!storeDomain || !accessToken) {
    const errorMsg = 'Shopify store domain or access token is not configured.';
    console.error(`Shopify Order Service: ${errorMsg}`);
    return { success: false, fetchedCount: 0, cachedCount: 0, deletedCount: 0, error: errorMsg, details: [] };
  }

  const graphqlApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
  const allFetchedOrders: ShopifyOrder[] = [];
  let currentCursor: string | null | undefined = null;
  let hasNextPage = true;
  let pageCount = 0;
  const details: string[] = [];

  const syncState = await getShopifyOrderSyncState();
  let effectiveSyncType = forceFullSync || !syncState?.lastFullOrderSyncCompletionTimestamp ? 'full' : 'delta';
  let queryFilter: string | undefined = undefined;

  if (effectiveSyncType === 'delta' && syncState?.lastOrderSyncTimestamp) {
    queryFilter = `updated_at:>'${syncState.lastOrderSyncTimestamp}'`;
    details.push(`Performing delta sync. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
  } else {
    effectiveSyncType = 'full'; // Fallback to full sync if delta conditions aren't met
    details.push(`Performing full sync. Reason: ${forceFullSync ? 'forced' : !syncState?.lastFullOrderSyncCompletionTimestamp ? 'no previous full sync' : 'delta conditions not met'}.`);
  }
  const currentSyncOperationStartedAt = new Date().toISOString();

  // GraphQL query for orders (simplified, expand as needed)
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
            lineItems(first: 20) { # Fetch more line items
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
              pageInfo { hasNextPage endCursor } # For future per-order line item pagination
            }
            transactions(first: 5) { # Fetch some transactions
              edges {
                node {
                  id
                  kind
                  status
                  amountSet { shopMoney { amount currencyCode } }
                  gateway
                  processedAt
                  errorCode
                }
              }
               pageInfo { hasNextPage endCursor }
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
      const variables = {
        first: limit > 0 && limit < DEFAULT_ORDERS_PER_PAGE ? limit - allFetchedOrders.length : DEFAULT_ORDERS_PER_PAGE,
        after: currentCursor,
        sortKey: "UPDATED_AT",
        reverse: false, // Fetch oldest first to process chronologically for delta logic
        query: queryFilter,
      };

      if (limit > 0 && allFetchedOrders.length >= limit) {
        details.push(`Reached fetch limit of ${limit} orders.`);
        break;
      }

      details.push(`Fetching page ${pageCount} of orders. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}`);
      
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
      if (edges.length === 0) hasNextPage = false;

      edges.forEach(edge => {
        const orderNode = edge.node;
        // Transform ShopifyGraphQLOrderNode to ShopifyOrder
        const shopifyOrder: ShopifyOrder = {
          ...orderNode,
          customer: orderNode.customer || undefined,
          billingAddress: orderNode.billingAddress || undefined,
          shippingAddress: orderNode.shippingAddress || undefined,
          lineItems: { // Ensure lineItems is structured correctly
            edges: orderNode.lineItems.edges.map(liEdge => ({
              node: {
                ...liEdge.node,
                originalTotalSet: liEdge.node.originalTotalSet ? { shopMoney: liEdge.node.originalTotalSet.shopMoney } : undefined,
                discountedTotalSet: liEdge.node.discountedTotalSet ? { shopMoney: liEdge.node.discountedTotalSet.shopMoney } : undefined,
              }
            }))
          },
          transactions: orderNode.transactions ? { // Handle optional transactions
             edges: orderNode.transactions.edges.map(txEdge => ({ node: txEdge.node }))
          } : undefined,
        };
        allFetchedOrders.push(shopifyOrder);
      });
      
      details.push(`Page ${pageCount}: Fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}.`);
      hasNextPage = pageInfo.hasNextPage;
      currentCursor = pageInfo.endCursor;
    }

    // Update Firestore cache
    const cacheResult = await updateShopifyOrderCacheInFirestore(allFetchedOrders, effectiveSyncType === 'full');
    details.push(`Firestore cache: ${cacheResult.countAddedOrUpdated} orders added/updated, ${cacheResult.countDeleted} deleted.`);

    // Update sync state
    const newSyncStateUpdate: Partial<ShopifyOrderSyncState> = {
      lastOrderSyncTimestamp: currentSyncOperationStartedAt, // Timestamp of this sync operation start
      lastOrderEndCursor: currentCursor, // Store the last cursor reached
    };
    if (effectiveSyncType === 'full' && !hasNextPage) { // Only update full sync completion if all pages were fetched
      newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp = new Date().toISOString();
    }
    await updateShopifyOrderSyncState(newSyncStateUpdate);
    details.push(`Sync state updated. Last sync timestamp: ${newSyncStateUpdate.lastOrderSyncTimestamp}. Last full sync: ${newSyncStateUpdate.lastFullOrderSyncCompletionTimestamp || syncState?.lastFullOrderSyncCompletionTimestamp || 'N/A'}`);

    return {
      success: true,
      fetchedCount: allFetchedOrders.length,
      cachedCount: cacheResult.countAddedOrUpdated,
      deletedCount: cacheResult.countDeleted,
      details,
    };

  } catch (error: any) {
    console.error('Shopify Order Service: CRITICAL ERROR in fetchAndCacheShopifyOrders:', error);
    details.push(`Error: ${error.message}`);
    return {
      success: false,
      fetchedCount: allFetchedOrders.length,
      cachedCount: 0,
      deletedCount: 0,
      error: error.message || String(error),
      details,
    };
  }
}

export async function updateShopifyOrderCacheInFirestore(
  orders: ShopifyOrderCacheItem[],
  isFullSync: boolean
): Promise<{ countAddedOrUpdated: number; countDeleted: number }> {
  const cacheCollectionRef = adminDb.collection(SHOPIFY_ORDER_CACHE_COLLECTION);
  let countAddedOrUpdated = 0;
  let countDeleted = 0;
  const MAX_BATCH_OPERATIONS = 490;

  if (isFullSync) {
    const newOrderNumericIds = new Set<string>();
    orders.forEach(order => {
      const numericId = order.id.split('/').pop();
      if (numericId) newOrderNumericIds.add(numericId);
    });

    const existingCacheSnapshot = await cacheCollectionRef.select().get(); // Select only IDs
    const staleDocIds: string[] = [];
    existingCacheSnapshot.forEach(doc => {
      if (!newOrderNumericIds.has(doc.id)) {
        staleDocIds.push(doc.id);
      }
    });

    for (let i = 0; i < staleDocIds.length; i += MAX_BATCH_OPERATIONS) {
        const batch = adminDb.batch();
        const chunk = staleDocIds.slice(i, i + MAX_BATCH_OPERATIONS);
        chunk.forEach(docId => batch.delete(cacheCollectionRef.doc(docId)));
        await batch.commit();
        countDeleted += chunk.length;
    }
    if(countDeleted > 0) console.log(`Shopify Order Service: Deleted ${countDeleted} stale orders from Firestore cache.`);
  }

  for (let i = 0; i < orders.length; i += MAX_BATCH_OPERATIONS) {
    const batch = adminDb.batch();
    const chunk = orders.slice(i, i + MAX_BATCH_OPERATIONS);
    chunk.forEach(order => {
      const numericId = order.id.split('/').pop();
      if (numericId) {
        const docRef = cacheCollectionRef.doc(numericId);
        // Ensure all Timestamps are converted if they exist from a previous fetch that wasn't stringified
        const orderDataForFirestore = JSON.parse(JSON.stringify(order));
        batch.set(docRef, orderDataForFirestore);
        countAddedOrUpdated++;
      }
    });
    await batch.commit();
  }
  if(countAddedOrUpdated > 0) console.log(`Shopify Order Service: Committed ${countAddedOrUpdated} orders (added/updated) to Firestore cache.`);
  
  return { countAddedOrUpdated, countDeleted };
}

export async function getCachedShopifyOrders(): Promise<ShopifyOrderCacheItem[]> {
    try {
        const snapshot = await adminDb.collection(SHOPIFY_ORDER_CACHE_COLLECTION).orderBy('createdAt', 'desc').limit(250).get(); // Simple sort for now
        return snapshot.docs.map(doc => doc.data() as ShopifyOrderCacheItem);
    } catch (error) {
        console.error("Shopify Order Service: Error fetching cached Shopify orders:", error);
        return [];
    }
}
