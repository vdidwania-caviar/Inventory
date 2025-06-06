'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Timestamp as AdminTimestamp, FieldValue } from 'firebase-admin/firestore';
import type { InventoryItem, ShopifyVariantDetail, SyncSummary } from '@/lib/types';

// Helper: Recursively remove all keys with value `undefined` (for Firestore compatibility)
function removeUndefinedFields<T extends Record<string, any>>(obj: T): T {
  return Object.entries(obj)
    .filter(([_, v]) => v !== undefined)
    .reduce((acc, [k, v]) => ({
      ...acc,
      [k]: v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
        ? removeUndefinedFields(v)
        : v
    }), {} as T);
}

function mapShopifyStatusToInventoryStatus(shopifyStatus?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'): InventoryItem['status'] {
  switch (shopifyStatus) {
    case 'ACTIVE':
      return 'Active';
    case 'ARCHIVED':
      return 'Archived';
    case 'DRAFT':
      return 'Draft';
    default:
      return 'Draft'; // Default to Draft if status is undefined or not recognized
  }
}

export async function syncShopifyToInventory(): Promise<SyncSummary> {
  const summary: SyncSummary = {
    itemsAdded: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    errors: [],
    detailedChanges: [],
  };

  console.log("Starting Shopify to Inventory sync process (using Admin SDK and data from 'shopifyProductCache')...");
  let batch = adminDb.batch();
  let operationsInBatch = 0;
  const MAX_OPERATIONS_PER_BATCH = 490; // Firestore limit is 500, keep a small margin

  try {
    const shopifyCacheCollectionRef = adminDb.collection('shopifyProductCache');
    const shopifyCacheSnap = await shopifyCacheCollectionRef.get();
    const shopifyVariants: ShopifyVariantDetail[] = shopifyCacheSnap.docs.map(docSnap => docSnap.data() as ShopifyVariantDetail);

    console.log(`Inventory Sync: Fetched ${shopifyVariants.length} variants from Firestore 'shopifyProductCache'.`);

    if (shopifyVariants.length === 0) {
        summary.detailedChanges?.push("No products found in the local Shopify product cache ('shopifyProductCache') to process for inventory sync.");
        console.log("Inventory Sync: No products in 'shopifyProductCache'. Nothing to sync to main inventory.");
        return summary; // Early return if nothing to process
    }

    const inventoryCollectionRef = adminDb.collection('inventory');
    const localInventorySnap = await inventoryCollectionRef.get();
    const localInventoryItems: InventoryItem[] = localInventorySnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as InventoryItem));
    console.log(`Inventory Sync: Fetched ${localInventoryItems.length} items from local 'inventory' collection for comparison.`);

    const localInventoryMapBySku = new Map<string, InventoryItem>();
    localInventoryItems.forEach(item => {
      if (item.sku) {
        localInventoryMapBySku.set(item.sku, item);
      }
    });

    for (const shopifyVariant of shopifyVariants) {
      if (!shopifyVariant.sku) {
        console.warn(`Inventory Sync: Shopify variant ID ${shopifyVariant.shopifyVariantId} (Product: ${shopifyVariant.productTitle}) from cache has no SKU. Skipping.`);
        summary.itemsSkipped++;
        summary.detailedChanges?.push(`Skipped: Shopify Variant ID ${shopifyVariant.shopifyVariantId} (Product: ${shopifyVariant.productTitle}) from cache - No SKU.`);
        continue;
      }

      const existingLocalItem = localInventoryMapBySku.get(shopifyVariant.sku);
      const currentFirestoreTimestamp = FieldValue.serverTimestamp(); 
      const shopifyItemLastUpdated = shopifyVariant.productUpdatedAt || shopifyVariant.variantUpdatedAt;

      let variantString = "";
      if (shopifyVariant.selectedOptions && shopifyVariant.selectedOptions.length > 0) {
        variantString = shopifyVariant.selectedOptions.map(opt => opt.value).join(' / ');
      }

      const shopifyDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || '';
      const shopifyProductUrl = shopifyDomain && shopifyVariant.productHandle
          ? `https://${shopifyDomain}/products/${shopifyVariant.productHandle}`
          : undefined;
      
      const shopifyDesc = shopifyVariant.productDescriptionHtml;

      if (existingLocalItem) {
        const itemChanges: string[] = [];
        const updateData: { [key: string]: any } = {
          updatedAt: currentFirestoreTimestamp,
          shopifyVariantId: shopifyVariant.shopifyVariantId,
          shopifyProductId: shopifyVariant.shopifyProductId,
          shopifyUpdatedAt: shopifyItemLastUpdated ? AdminTimestamp.fromDate(new Date(shopifyItemLastUpdated)) : FieldValue.delete(),
          productTitle: shopifyVariant.productTitle, 
          status: mapShopifyStatusToInventoryStatus(shopifyVariant.productStatus),
        };

        // Handle description
        if (shopifyDesc !== undefined) {
            if (shopifyDesc !== existingLocalItem.description) {
                updateData.description = shopifyDesc;
            }
        } else {
            if (existingLocalItem.description !== undefined) {
                updateData.description = FieldValue.delete();
            }
        }

        if (shopifyProductUrl && shopifyProductUrl !== existingLocalItem.productUrl) {
            updateData.productUrl = shopifyProductUrl;
        } else if (!shopifyProductUrl && existingLocalItem.productUrl) {
           updateData.productUrl = FieldValue.delete();
        } else if (shopifyProductUrl) {
             updateData.productUrl = shopifyProductUrl;
        }

        if (variantString && variantString !== existingLocalItem.variant) {
            updateData.variant = variantString;
        } else if (!variantString && existingLocalItem.variant) {
            updateData.variant = FieldValue.delete();
        } else if (variantString) {
            updateData.variant = variantString;
        }

        if (shopifyVariant.productVendor && shopifyVariant.productVendor !== existingLocalItem.vendor) {
            updateData.vendor = shopifyVariant.productVendor;
        } else if (!shopifyVariant.productVendor && existingLocalItem.vendor) {
            updateData.vendor = FieldValue.delete();
        } else if (shopifyVariant.productVendor) {
            updateData.vendor = shopifyVariant.productVendor;
        }

        if (shopifyVariant.productType && shopifyVariant.productType !== existingLocalItem.productType) {
            updateData.productType = shopifyVariant.productType;
        } else if (!shopifyVariant.productType && existingLocalItem.productType) {
            updateData.productType = FieldValue.delete();
        } else if (shopifyVariant.productType) {
            updateData.productType = shopifyVariant.productType;
        }

        if (shopifyVariant.productTags && shopifyVariant.productTags.length > 0) {
             const sortedShopifyTags = [...shopifyVariant.productTags].sort();
             const sortedLocalTags = existingLocalItem.tags ? [...existingLocalItem.tags].sort() : [];
            if (JSON.stringify(sortedShopifyTags) !== JSON.stringify(sortedLocalTags)) {
                 updateData.tags = shopifyVariant.productTags;
            }
        } else if ((!shopifyVariant.productTags || shopifyVariant.productTags.length === 0) && existingLocalItem.tags && existingLocalItem.tags.length > 0) {
           updateData.tags = FieldValue.delete();
        }

        let shopifyImageSrc: string | undefined = undefined;
        if (shopifyVariant.variantImage?.src) {
            shopifyImageSrc = shopifyVariant.variantImage.src;
        } else if (shopifyVariant.productImages && shopifyVariant.productImages.length > 0 && shopifyVariant.productImages[0].src) {
            shopifyImageSrc = shopifyVariant.productImages[0].src;
        }
        const newImagesArray = shopifyImageSrc ? [shopifyImageSrc] : [];
        const sortedNewImages = [...newImagesArray].sort();
        const sortedLocalImages = existingLocalItem.images ? [...existingLocalItem.images].sort() : [];

        if (JSON.stringify(sortedNewImages) !== JSON.stringify(sortedLocalImages)) {
            updateData.images = newImagesArray.length > 0 ? newImagesArray : FieldValue.delete();
        }

        let preserveLocalPriceAndQty = false;
        if (existingLocalItem.updatedAt && shopifyItemLastUpdated) {
          try {
            const localItemLastUpdatedTimestamp = existingLocalItem.updatedAt instanceof AdminTimestamp
                ? existingLocalItem.updatedAt
                : AdminTimestamp.fromDate(new Date(existingLocalItem.updatedAt as string)); 

            const shopifyItemLastUpdatedTimestamp = AdminTimestamp.fromDate(new Date(shopifyItemLastUpdated));

            if (localItemLastUpdatedTimestamp.toMillis() > shopifyItemLastUpdatedTimestamp.toMillis()) {
              preserveLocalPriceAndQty = true;
              itemChanges.push(`Local item updated more recently; preserving local price & quantity.`);
            }
          } catch (e) {
            console.warn("Could not parse date for timestamp comparison during update decision for item:", existingLocalItem.id, e);
          }
        }

        if (!preserveLocalPriceAndQty && typeof shopifyVariant.price === 'number' && shopifyVariant.price !== existingLocalItem.price) {
          updateData.price = shopifyVariant.price;
        }
        if (!preserveLocalPriceAndQty && typeof shopifyVariant.inventoryQuantity === 'number' && shopifyVariant.inventoryQuantity !== existingLocalItem.quantity) {
          updateData.quantity = shopifyVariant.inventoryQuantity;
        }

        if (existingLocalItem.cost === undefined && typeof shopifyVariant.cost === 'number') {
          updateData.cost = shopifyVariant.cost;
        } else if (existingLocalItem.cost !== undefined && typeof shopifyVariant.cost !== 'number') {
          updateData.cost = FieldValue.delete();
        } else if (typeof shopifyVariant.cost === 'number' && shopifyVariant.cost !== existingLocalItem.cost){
          updateData.cost = shopifyVariant.cost;
        }

        if (!existingLocalItem.dataAiHint && (shopifyVariant.productType || shopifyVariant.productTitle)) {
             const hintType = shopifyVariant.productType?.split(" ")[0] || "";
             const hintTitle = shopifyVariant.productTitle?.split(" ").slice(0, hintType ? 1:2).join(" ") || "";
             let generatedHint = (hintType ? hintType + (hintTitle && hintType.toLowerCase() !== hintTitle.split(" ")[0].toLowerCase() ? " " + hintTitle.split(" ")[0] : "") : hintTitle).trim();
             if (generatedHint.split(' ').length > 2) generatedHint = generatedHint.split(' ').slice(0,2).join(' ');
             updateData.dataAiHint = generatedHint.toLowerCase() || 'product';
        }

        let significantChange = false;
        for (const key of Object.keys(updateData)) {
            if (key === 'updatedAt') continue;
            const typedKey = key as keyof InventoryItem;
            const newValue = updateData[typedKey];
            const oldValue = existingLocalItem[typedKey];

            const oldValStr = oldValue === undefined ? 'undefined' : JSON.stringify(Array.isArray(oldValue) ? [...oldValue].sort() : oldValue);
            const newValStr = newValue === undefined ? 'undefined' : JSON.stringify(Array.isArray(newValue) ? [...newValue].sort() : newValue);

            if (oldValStr !== newValStr) {
                 significantChange = true;
                 itemChanges.push(`Updated ${typedKey}: from '${oldValue === undefined ? "N/A" : oldValStr}' to '${newValue === undefined ? "N/A" : newValStr}'.`);
            }
        }

        const shopifyMetaChanged = updateData.shopifyVariantId !== existingLocalItem.shopifyVariantId ||
                                 updateData.shopifyProductId !== existingLocalItem.shopifyProductId ||
                                 (updateData.shopifyUpdatedAt && existingLocalItem.shopifyUpdatedAt !== updateData.shopifyUpdatedAt?.toDate().toISOString());

        if (significantChange || shopifyMetaChanged) {
          try {
            const itemDocRef = adminDb.doc(`inventory/${existingLocalItem.id}`); 
            batch.update(itemDocRef, removeUndefinedFields(updateData)); // <-- CHANGED
            operationsInBatch++;
            summary.itemsUpdated++;
            summary.detailedChanges?.push(`SKU ${shopifyVariant.sku}: ${itemChanges.join('; ')}`);
          } catch (e: any) {
            console.error(`Error staging update for inventory item ${existingLocalItem.id} (SKU: ${shopifyVariant.sku}): ${e.message}`);
            summary.errors.push(`Stage Update SKU ${shopifyVariant.sku}: ${e.message}`);
          }
        } else {
            summary.itemsSkipped++;
        }

      } else { // New item
        let shopifyImageSrc: string | undefined = undefined;
        if (shopifyVariant.variantImage?.src) {
            shopifyImageSrc = shopifyVariant.variantImage.src;
        } else if (shopifyVariant.productImages && shopifyVariant.productImages.length > 0 && shopifyVariant.productImages[0].src) {
            shopifyImageSrc = shopifyVariant.productImages[0].src;
        }

        const hintType = shopifyVariant.productType?.split(" ")[0] || "";
        const hintTitle = shopifyVariant.productTitle?.split(" ").slice(0, hintType ? 1:2).join(" ") || "";
        let generatedHint = (hintType ? hintType + (hintTitle && hintType.toLowerCase() !== hintTitle.split(" ")[0].toLowerCase() ? " " + hintTitle.split(" ")[0] : "") : hintTitle).trim();
        if (generatedHint.split(' ').length > 2) generatedHint = generatedHint.split(' ').slice(0,2).join(' ');
        const dataAiHint = generatedHint.toLowerCase() || 'product';

        const newItemData: Omit<InventoryItem, 'id'> = {
          sku: shopifyVariant.sku!,
          productTitle: shopifyVariant.productTitle,
          description: shopifyVariant.productDescriptionHtml || undefined,
          variant: variantString || undefined,
          vendor: shopifyVariant.productVendor || undefined,
          productType: shopifyVariant.productType || undefined,
          tags: shopifyVariant.productTags || [],
          images: shopifyImageSrc ? [shopifyImageSrc] : [],
          price: shopifyVariant.price,
          cost: shopifyVariant.cost,
          quantity: shopifyVariant.inventoryQuantity ?? 0,
          status: mapShopifyStatusToInventoryStatus(shopifyVariant.productStatus),
          productUrl: shopifyProductUrl,
          shopifyVariantId: shopifyVariant.shopifyVariantId,
          shopifyProductId: shopifyVariant.shopifyProductId,
          shopifyUpdatedAt: shopifyItemLastUpdated ? AdminTimestamp.fromDate(new Date(shopifyItemLastUpdated)) : undefined,
          createdAt: currentFirestoreTimestamp as any, 
          updatedAt: currentFirestoreTimestamp as any, 
          consignment: false, 
          dataAiHint: dataAiHint,
        };
        
        try {
          const newItemRef = inventoryCollectionRef.doc(); // Auto-generate ID
          batch.set(newItemRef, removeUndefinedFields(newItemData)); // <-- CHANGED
          operationsInBatch++;
          summary.itemsAdded++;
          summary.detailedChanges?.push(`SKU ${shopifyVariant.sku}: Added new item '${shopifyVariant.productTitle}'.`);
        } catch (e: any) {
          console.error(`Error staging add for new inventory item (SKU: ${shopifyVariant.sku}): ${e.message}`);
          summary.errors.push(`Stage Add SKU ${shopifyVariant.sku}: ${e.message}`);
        }
      }

      if (operationsInBatch >= MAX_OPERATIONS_PER_BATCH) {
        console.log(`Committing batch with ${operationsInBatch} operations...`);
        await batch.commit();
        console.log("Batch committed.");
        batch = adminDb.batch(); // Start a new batch
        operationsInBatch = 0;
      }
    }

    if (operationsInBatch > 0) {
      console.log(`Committing final batch with ${operationsInBatch} operations...`);
      await batch.commit();
      console.log("Final batch committed.");
    }

  } catch (error: any) {
    console.error('Error during Shopify to Inventory sync:', error);
    summary.errors.push(`Overall sync failed: ${error.message}`);
  }

  console.log('Inventory Sync summary (Admin SDK, from local cache):', summary);
  return summary;
}