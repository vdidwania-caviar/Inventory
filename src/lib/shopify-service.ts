
'use server';

import type { ShopifyVariantDetail, ShopifySyncState } from '@/lib/types';
import { getAdminDb } from '@/lib/firebase-admin'; // Corrected import
import { Timestamp } from 'firebase-admin/firestore';

// GraphQL API Response Structures
interface ShopifyGraphQLImageNode {
  id?: string;
  url: string;
  altText?: string | null;
}

interface ShopifyGraphQLImageEdge {
  node: ShopifyGraphQLImageNode;
}

interface ShopifyGraphQLMoneyV2 {
  amount: string;
  currencyCode: string;
}

interface ShopifyGraphQLInventoryItemNode {
  id: string;
  sku?: string | null;
  unitCost?: ShopifyGraphQLMoneyV2 | null;
}

interface ShopifyGraphQLSelectedOption {
    name: string;
    value: string;
}

interface ShopifyGraphQLVariantNode {
  id: string;
  sku?: string | null;
  price: string;
  inventoryQuantity?: number | null;
  updatedAt: string;
  image?: ShopifyGraphQLImageNode | null;
  selectedOptions: ShopifyGraphQLSelectedOption[];
  inventoryItem: ShopifyGraphQLInventoryItemNode;
}

interface ShopifyGraphQLVariantEdge {
  node: ShopifyGraphQLVariantNode;
}

interface ShopifyGraphQLProductNode {
  id: string;
  title: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  handle: string;
  createdAt: string;
  updatedAt: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  descriptionHtml?: string; // Added field
  images: {
    edges: ShopifyGraphQLImageEdge[];
  };
  variants: {
    edges: ShopifyGraphQLVariantEdge[];
    pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
    };
  };
}

interface ShopifyGraphQLProductEdge {
  node: ShopifyGraphQLProductNode;
}

interface ShopifyGraphQLProductsResponse {
  data?: {
    products: {
      edges: ShopifyGraphQLProductEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: Array<{ message: string; extensions?: any; path?: string[] }>;
}

const SYNC_STATE_DOC_ID = 'shopifyProductsSyncState';
const SHOPIFY_CACHE_COLLECTION = 'shopifyProductCache';

const adminDb = getAdminDb(); // Initialize adminDb by calling the imported function

async function getSyncState(): Promise<ShopifySyncState | null> {
  try {
    const syncStateRef = adminDb.collection('syncState').doc(SYNC_STATE_DOC_ID);
    const docSnap = await syncStateRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as ShopifySyncState;
      if (data.lastSyncTimestamp && typeof data.lastSyncTimestamp !== 'string') {
        data.lastSyncTimestamp = (data.lastSyncTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      if (data.lastFullSyncCompletionTimestamp && typeof data.lastFullSyncCompletionTimestamp !== 'string') {
        data.lastFullSyncCompletionTimestamp = (data.lastFullSyncCompletionTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      return data;
    }
    console.log("Shopify Service: Sync state document does not exist, will perform full sync.");
    return null;
  } catch (error) {
    console.error("Shopify Service: Error fetching sync state using Admin SDK:", error);
    // Propagate the error to be handled by the caller
    throw new Error(`Failed to fetch sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function updateSyncState(newState: Partial<ShopifySyncState>): Promise<void> {
  try {
    const syncStateRef = adminDb.collection('syncState').doc(SYNC_STATE_DOC_ID);
    const updateData: { [key: string]: any } = { ...newState };

    if (newState.lastSyncTimestamp) {
      updateData.lastSyncTimestamp = Timestamp.fromDate(new Date(newState.lastSyncTimestamp));
    }
    if (newState.lastFullSyncCompletionTimestamp) {
      updateData.lastFullSyncCompletionTimestamp = Timestamp.fromDate(new Date(newState.lastFullSyncCompletionTimestamp));
    }
    
    await syncStateRef.set(updateData, { merge: true });
    console.log("Shopify Service: Sync state updated using Admin SDK:", newState);
  } catch (error) {
    console.error("Shopify Service: Error updating sync state using Admin SDK:", error);
    throw new Error(`Failed to update sync state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface FetchShopifyProductsParams {
  syncType?: 'full' | 'delta';
  forceFullSync?: boolean;
}

export async function fetchShopifyProducts({ syncType = 'delta', forceFullSync = false }: FetchShopifyProductsParams = {}): Promise<ShopifyVariantDetail[]> {
  const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-07';

  if (!storeDomain || !accessToken) {
    console.error('Shopify Service: Shopify store domain or access token is not configured.');
    throw new Error('Shopify store domain or access token is not configured.');
  }

  const graphqlApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
  const allVariantDetails: ShopifyVariantDetail[] = [];
  let currentCursor: string | null | undefined = null;
  let hasNextPage = true;
  
  let syncState: ShopifySyncState | null = null;
  try {
    syncState = await getSyncState();
  } catch (e) {
     // Error already logged by getSyncState, rethrow to fail fast
     console.error("Shopify Service: Critical error getting sync state.", e)
     throw e;
  }

  let effectiveSyncType = syncType;
  let filterUpdatedAtMin: string | null = null;
  const currentSyncOperationStartedAt = new Date().toISOString();

  if (forceFullSync || !syncState?.lastFullSyncCompletionTimestamp) {
    effectiveSyncType = 'full';
    currentCursor = null; 
    console.log("Shopify Service: Forcing full sync due to 'forceFullSync' flag or no 'lastFullSyncCompletionTimestamp'.");
  } else if (effectiveSyncType === 'delta' && syncState?.lastSyncTimestamp) {
    filterUpdatedAtMin = syncState.lastSyncTimestamp; 
    currentCursor = null; 
    console.log(`Shopify Service: Performing delta sync. Fetching items updated after: ${filterUpdatedAtMin}`);
  }

  const baseQuery = `
    query GetProductsWithVariantsAndCost($first: Int!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean, $queryFilter: String) {
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, query: $queryFilter) {
        edges {
          node {
            id
            title
            vendor
            productType
            tags
            handle
            createdAt
            updatedAt
            status
            descriptionHtml # Added field
            images(first: 1) {
              edges { node { url altText } }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
                  updatedAt
                  image { url altText }
                  selectedOptions { name value }
                  inventoryItem {
                    id
                    sku
                    unitCost { amount currencyCode }
                  }
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
  
  console.log(`Shopify Service: Starting Shopify product fetch. Type: ${effectiveSyncType}. Initial cursor: ${currentCursor}. Update filter: ${filterUpdatedAtMin}`);
  let pageCount = 0;

  try { // Main try block for the fetching process
    while (hasNextPage) {
      pageCount++;
      const variables: { first: number; after?: string | null, sortKey: string, reverse: boolean, queryFilter?: string | null } = {
        first: 50,
        after: currentCursor,
        sortKey: "UPDATED_AT", 
        reverse: false,       
        queryFilter: null,
      };

      if (effectiveSyncType === 'delta' && filterUpdatedAtMin) {
        variables.queryFilter = `updated_at:>'${filterUpdatedAtMin}'`;
      }
      
      console.log(`Shopify Service: Fetching page ${pageCount} with variables: ${JSON.stringify(variables)}`);

      let responseBody: ShopifyGraphQLProductsResponse;
      try {
        const response = await fetch(graphqlApiUrl, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: baseQuery, variables }),
          cache: 'no-store',
        });

        responseBody = await response.json();

        if (!response.ok || (responseBody.errors && responseBody.errors.length > 0)) {
          const errorMessages = responseBody.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`;
          console.error('Shopify Service: Shopify GraphQL API Error:', errorMessages, responseBody);
          throw new Error(`Shopify GraphQL API request failed: ${errorMessages}`);
        }
      } catch (fetchError) {
        console.error(`Shopify Service: Error fetching page ${pageCount} from Shopify:`, fetchError);
        throw new Error(`Failed to fetch data from Shopify on page ${pageCount}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      }


      if (!responseBody.data?.products) {
        console.warn('Shopify Service: No product data in Shopify GraphQL response for current page.', responseBody);
        hasNextPage = false;
        continue;
      }

      const { edges, pageInfo } = responseBody.data.products;

      edges.forEach(productEdge => {
        const productNode = productEdge.node;
        const productLevelImages = productNode.images.edges.map(edge => edge.node)
                                    .filter(imgNode => imgNode.url)
                                    .map(imgNode => ({ src: imgNode.url, altText: imgNode.altText || undefined }));

        productNode.variants.edges.forEach(variantEdge => {
          const variantNode = variantEdge.node;
          const cost = variantNode.inventoryItem?.unitCost?.amount ? parseFloat(variantNode.inventoryItem.unitCost.amount) : undefined;
          const sku = variantNode.sku || variantNode.inventoryItem?.sku || undefined;

          allVariantDetails.push({
            shopifyVariantId: variantNode.id,
            sku: sku,
            price: variantNode.price ? parseFloat(variantNode.price) : undefined,
            inventoryQuantity: variantNode.inventoryQuantity ?? undefined,
            variantUpdatedAt: variantNode.updatedAt,
            variantImage: variantNode.image ? { src: variantNode.image.url, altText: variantNode.image.altText || undefined } : undefined,
            shopifyProductId: productNode.id,
            productTitle: productNode.title,
            productDescriptionHtml: productNode.descriptionHtml || undefined, // Added mapping
            productVendor: productNode.vendor || undefined,
            productType: productNode.productType || undefined,
            productTags: productNode.tags || [],
            productHandle: productNode.handle,
            productCreatedAt: productNode.createdAt,
            productUpdatedAt: productNode.updatedAt,
            productImages: productLevelImages,
            productStatus: productNode.status,
            cost: cost,
            selectedOptions: variantNode.selectedOptions || [],
          });
        });
      });

      hasNextPage = pageInfo.hasNextPage;
      currentCursor = pageInfo.endCursor; 
      console.log(`Shopify Service: Fetched page ${pageCount}. Variants on page: ${edges.reduce((sum, edge) => sum + edge.node.variants.edges.length, 0)}. Has next: ${hasNextPage}. New product cursor for next page: ${currentCursor}`);

      if (process.env.NODE_ENV === 'development' && allVariantDetails.length > 250 && pageCount > 5) { 
          console.warn("Shopify Service: DEV BREAK - Exceeded 250 variants or 5 pages, stopping pagination for dev.");
          hasNextPage = false;
      }
    } // End of while loop
    
    const newSyncStateUpdate: Partial<ShopifySyncState> = {
      lastSyncTimestamp: currentSyncOperationStartedAt,
    };

    if (effectiveSyncType === 'full') {
      newSyncStateUpdate.lastEndCursor = currentCursor; 
      newSyncStateUpdate.lastFullSyncCompletionTimestamp = new Date().toISOString();
    } else { 
      newSyncStateUpdate.lastEndCursor = currentCursor; 
    }

    await updateSyncState(newSyncStateUpdate);
    console.log(`Shopify Service: Shopify product fetch complete. Total variants fetched: ${allVariantDetails.length}. Sync state updated.`);
    return allVariantDetails;

  } catch (error) { // Catch for the main fetching process
    console.error('Shopify Service: CRITICAL ERROR in fetchShopifyProducts main process:', error);
    if (error instanceof Error) {
      throw error; // Re-throw the original error or a new one with more context
    }
    throw new Error('An critical unknown error occurred during the Shopify product fetching process.');
  }
}

export async function updateShopifyProductCacheInFirestore(
  products: ShopifyVariantDetail[],
  isFullSync: boolean = true // Assume full sync by default for cache refresh scenario
): Promise<{success: boolean, countAddedOrUpdated: number, countDeleted: number, error?: string}> {
  try {
    if (!adminDb) {
      console.error("Shopify Service: Firebase Admin SDK (adminDb) is not initialized. Cannot update cache.");
      throw new Error("Firebase Admin SDK is not initialized.");
    }

    const cacheCollectionRef = adminDb.collection(SHOPIFY_CACHE_COLLECTION);
    let countAddedOrUpdated = 0;
    let countDeleted = 0;

    const newProductNumericIds = new Set<string>();
    products.forEach(product => {
      const numericVariantId = product.shopifyVariantId.split('/').pop();
      if (numericVariantId) {
        newProductNumericIds.add(numericVariantId);
      }
    });

    if (isFullSync) {
      // In a full sync, delete products from cache that are not in the new product list
      const existingCacheSnapshot = await cacheCollectionRef.select().get(); // Select only IDs
      const staleDocIds: string[] = [];
      existingCacheSnapshot.forEach(doc => {
        if (!newProductNumericIds.has(doc.id)) {
          staleDocIds.push(doc.id);
        }
      });

      if (staleDocIds.length > 0) {
        const deleteBatch = adminDb.batch();
        staleDocIds.forEach(docId => {
          deleteBatch.delete(cacheCollectionRef.doc(docId));
        });
        await deleteBatch.commit();
        countDeleted = staleDocIds.length;
        console.log(`Shopify Service: Deleted ${countDeleted} stale products from Firestore cache.`);
      }
    }

    // Add or update products from the new list
    if (products.length > 0) {
        const updateBatch = adminDb.batch();
        products.forEach(product => {
          const numericVariantId = product.shopifyVariantId.split('/').pop();
          if (numericVariantId) {
            const docRef = cacheCollectionRef.doc(numericVariantId);
            updateBatch.set(docRef, product); // Overwrites if exists, creates if not
            countAddedOrUpdated++;
          } else {
            console.warn(`Shopify Service: Could not extract numeric ID from Shopify Variant GID: ${product.shopifyVariantId}. Skipping caching for this variant.`);
          }
        });
        await updateBatch.commit();
        console.log(`Shopify Service: Committed ${countAddedOrUpdated} products (added/updated) to Firestore cache.`);
    } else if (!isFullSync) {
        console.log("Shopify Service: No products provided for delta update. Cache not modified for additions/updates.");
    }


    return { success: true, countAddedOrUpdated, countDeleted };
  } catch (error: any) {
    console.error("Shopify Service: Error updating Firestore product cache:", error);
    return { success: false, countAddedOrUpdated: 0, countDeleted: 0, error: error.message || String(error) };
  }
}
