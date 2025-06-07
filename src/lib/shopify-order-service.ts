
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
  error?: string;
  details?: string[];
}> {
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
    details.push(`Warning: Could not fetch sync state: ${(error as Error).message}`);
    // proceed with full sync if error
  }

  let effectiveSyncType = forceFullSync || !syncState?.lastFullOrderSyncCompletionTimestamp ? 'full' : 'delta';
  let queryFilter: string | undefined = undefined;

  if (effectiveSyncType === 'delta' && syncState?.lastOrderSyncTimestamp) {
    queryFilter = `updated_at:>'${syncState.lastOrderSyncTimestamp}'`;
    details.push(`Performing delta sync. Fetching orders updated after: ${syncState.lastOrderSyncTimestamp}`);
  } else {
    effectiveSyncType = 'full'; 
    details.push(`Performing full sync. Reason: ${forceFullSync ? 'forced' : !syncState?.lastFullOrderSyncCompletionTimestamp ? 'no previous full sync' : 'delta conditions not met'}.`);
  }
  const currentSyncOperationStartedAt = new Date().toISOString();

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

      const remainingLimit = limit > 0 ? Math.max(limit - allFetchedOrders.length, 0) : DEFAULT_ORDERS_PER_PAGE;
      const fetchCount = limit > 0 && remainingLimit < DEFAULT_ORDERS_PER_PAGE ? remainingLimit : DEFAULT_ORDERS_PER_PAGE;

      if (limit > 0 && allFetchedOrders.length >= limit) {
        details.push(`Reached fetch limit of ${limit} orders.`);
        break;
      }

      details.push(`Fetching page ${pageCount} of orders. Cursor: ${currentCursor || 'N/A'}. Filter: ${queryFilter || 'None'}`);

      const variables = {
        first: fetchCount,
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

      details.push(`Page ${pageCount}: Fetched ${edges.length} orders. Total fetched so far: ${allFetchedOrders.length}.`);
      hasNextPage = pageInfo.hasNextPage;
      currentCursor = pageInfo.endCursor;
    }

    const cacheResult = await updateShopifyOrderCacheInFirestore(allFetchedOrders, effectiveSyncType === 'full');
    details.push(`Firestore cache: ${cacheResult.countAddedOrUpdated} orders added/updated, ${cacheResult.countDeleted} deleted.`);

    const newSyncStateUpdate: Partial<ShopifyOrderSyncState> = {
      lastOrderSyncTimestamp: currentSyncOperationStartedAt,
      lastOrderEndCursor: currentCursor,
    };
    if (effectiveSyncType === 'full' && !hasNextPage) {
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
    console.warn('Shopify Order Service: ERROR in fetchAndCacheShopifyOrders:', error);
    details.push(`Error: ${error.message || String(error)}`);
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
  const adminDb = getAdminDb();
  const cacheCollectionRef = adminDb.collection(SHOPIFY_ORDER_CACHE_COLLECTION);
  let countAddedOrUpdated = 0;
  let countDeleted = 0;
  const MAX_BATCH_OPERATIONS = 490;

  try {
    if (isFullSync) {
      const newOrderNumericIds = new Set<string>();
      orders.forEach(order => {
        const numericId = order.id.split('/').pop();
        if (numericId) newOrderNumericIds.add(numericId);
      });

      // Defensive: only proceed if there are cached docs
      const existingCacheSnapshot = await cacheCollectionRef.select().get();
      if (!existingCacheSnapshot.empty) {
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
    }

    for (let i = 0; i < orders.length; i += MAX_BATCH_OPERATIONS) {
      const batch = adminDb.batch();
      const chunk = orders.slice(i, i + MAX_BATCH_OPERATIONS);
      chunk.forEach(order => {
        const numericId = order.id.split('/').pop();
        if (numericId) {
          const docRef = cacheCollectionRef.doc(numericId);
          const orderDataForFirestore = JSON.parse(JSON.stringify(order)); // Deep clone to remove undefined
          batch.set(docRef, orderDataForFirestore);
          countAddedOrUpdated++;
        }
      });
      await batch.commit();
    }
    if(countAddedOrUpdated > 0) console.log(`Shopify Order Service: Committed ${countAddedOrUpdated} orders (added/updated) to Firestore cache.`);
  } catch (error) {
    console.warn("Shopify Order Service: Error updating Firestore cache:", error);
    throw error;
  }

  return { countAddedOrUpdated, countDeleted };
}

export async function getCachedShopifyOrders(): Promise<ShopifyOrderCacheItem[]> {
  const adminDb = getAdminDb();
  try {
    const snapshot = await adminDb
      .collection(SHOPIFY_ORDER_CACHE_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(250)
      .get();
    if (!snapshot.empty) {
      return snapshot.docs.map(doc => doc.data() as ShopifyOrderCacheItem);
    }
    return [];
  } catch (error) {
    console.warn("Shopify Order Service: Error fetching cached Shopify orders:", error);
    throw error;
  }
}
