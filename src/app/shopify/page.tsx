
'use client';

import { useState, useEffect } from 'react';
import { ShopifyProductsTable } from '@/components/shopify/shopify-products-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Store, Loader2, RefreshCw, AlertTriangle as AlertTriangleIconLucide } from 'lucide-react';
import { syncShopifyToInventory } from '@/lib/inventory-sync-service';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ShopifyVariantDetail, ShopifySyncState } from '@/lib/types';
import { app, db } from '@/lib/firebase'; // db is client sdk
import { getAuth, type User as FirebaseAuthUser } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, Timestamp as ClientTimestamp } from 'firebase/firestore'; // Use client SDK for reads
import { fetchShopifyProducts, updateShopifyProductCacheInFirestore } from '@/lib/shopify-service';
import { isValid } from 'date-fns';
import { useAuth } from '@/hooks/use-auth'; // Use your hook
// We will remove the server-side cookie check from here and rely on the useAuth hook.

const SHOPIFY_PRODUCT_CACHE_COLLECTION = 'shopifyProductCache';
const PRODUCT_SYNC_STATE_DOC_ID = 'shopifyProductsSyncState'; // Renamed from SYNC_STATE_DOC_ID to be specific
const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2";

export default function ShopifyProductsPage() { // Renamed component for clarity
  const { user, isLoading: authIsLoading } = useAuth();
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cachedProducts, setCachedProducts] = useState<ShopifyVariantDetail[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [lastCacheRefreshTime, setLastCacheRefreshTime] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  const { toast } = useToast();

  // Function to load cached products - uses client SDK for reads
  async function loadCachedProducts() {
    console.log("ShopifyProductsPage: loadCachedProducts called.");
    setIsLoadingCache(true);
    setSyncError(null);
    setAccessDenied(null);


    if (!user || user.uid !== ADMIN_UID) {
      console.warn("ShopifyProductsPage: User is not admin or not logged in. Aborting product cache load.");
      setAccessDenied("Access Denied: Admin privileges required to load Shopify product data.");
      setIsLoadingCache(false);
      setCachedProducts([]);
      setLastCacheRefreshTime(null);
      return;
    }
    
    try {
      console.log(`ShopifyProductsPage: Attempting to read '${SHOPIFY_PRODUCT_CACHE_COLLECTION}' collection...`);
      const cacheSnapshot = await getDocs(collection(db, SHOPIFY_PRODUCT_CACHE_COLLECTION));
      const products = cacheSnapshot.docs.map(docSnap => docSnap.data() as ShopifyVariantDetail);
      setCachedProducts(products);
      console.log(`ShopifyProductsPage: Loaded ${products.length} products from cache.`);

      const syncStateRef = doc(db, 'syncState', PRODUCT_SYNC_STATE_DOC_ID);
      const syncStateSnap = await getDoc(syncStateRef);

      if (syncStateSnap.exists()) {
        const stateData = syncStateSnap.data() as ShopifySyncState;
        const rawTs = stateData.lastFullSyncCompletionTimestamp;
        if (rawTs) {
          let dateToFormat: Date | null = null;
          if (rawTs instanceof ClientTimestamp) dateToFormat = rawTs.toDate();
          else if (typeof rawTs === 'string') dateToFormat = new Date(rawTs);
          else if (rawTs && typeof (rawTs as any).seconds === 'number') {
             dateToFormat = new ClientTimestamp((rawTs as any).seconds, (rawTs as any).nanoseconds || 0).toDate();
          }
          
          if (dateToFormat && isValid(dateToFormat)) {
            setLastCacheRefreshTime(dateToFormat.toLocaleString());
          } else {
            setLastCacheRefreshTime('Invalid Date');
          }
        } else {
           setLastCacheRefreshTime(null);
        }
      } else {
         setLastCacheRefreshTime(null);
      }

    } catch (error: any) {
      console.error("ShopifyProductsPage: Error loading cached products or sync state:", error);
      if (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission'))) {
        setSyncError("Firestore permission denied. Ensure Firestore rules allow reads for admin or the 'syncState' and 'shopifyProductCache' collections.");
        setAccessDenied("Firestore permission denied.");
      } else {
        setSyncError(`Failed to load Shopify product data from local cache/sync state: ${error.message}`);
      }
      setCachedProducts([]);
      setLastCacheRefreshTime(null);
    }
    setIsLoadingCache(false);
  }
  
  useEffect(() => {
    console.log(`ShopifyProductsPage: useEffect triggered. authIsLoading: ${authIsLoading}, user: ${user ? user.uid : 'null'}`);
    if (!authIsLoading) {
      if (user && user.uid === ADMIN_UID) {
        setAccessDenied(null);
        console.log("ShopifyProductsPage: Admin user confirmed. Calling loadCachedProducts.");
        loadCachedProducts();
      } else if (user) {
        setAccessDenied("Access Denied: This page is for administrators only.");
        setIsLoadingCache(false);
        setCachedProducts([]);
        setLastCacheRefreshTime(null);
      } else {
        setAccessDenied("Access Denied: You must be logged in as an administrator.");
        setIsLoadingCache(false);
        setCachedProducts([]);
        setLastCacheRefreshTime(null);
      }
    }
  }, [user, authIsLoading]);


  const handleRefreshCache = async () => {
    if (!user || user.uid !== ADMIN_UID) {
      toast({ variant: "destructive", title: "Access Denied", description: "Only administrators can refresh the cache." });
      return;
    }
    setIsRefreshingCache(true);
    setSyncError(null);
    let fetchedProductsCount = 0;

    try {
      toast({ title: "Refreshing Shopify Product Data...", description: "Fetching all products from Shopify. This may take a moment." });
      
      const allShopifyProducts = await fetchShopifyProducts({ forceFullSync: true }); // This is a server action
      fetchedProductsCount = allShopifyProducts.length;
      console.log(`ShopifyProductsPage: Fetched ${fetchedProductsCount} products for cache refresh via server action.`);

      const updateResult = await updateShopifyProductCacheInFirestore(allShopifyProducts, true); // This is a server action
      console.log(`ShopifyProductsPage: Firestore cache updated: ${updateResult.countAddedOrUpdated} products added/updated, ${updateResult.countDeleted} products deleted.`);
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || "Failed to update Firestore cache via server action.");
      }
      
      await loadCachedProducts(); // Reload client-side cache view

      toast({
        title: "Shopify Product Data Cache Refreshed",
        description: (
            <div>
                <p>Fetched from Shopify: {fetchedProductsCount} product variants.</p>
                <p>Local Shopify product data cache updated: {updateResult.countAddedOrUpdated} variants added/updated, {updateResult.countDeleted} variants removed as stale.</p>
            </div>
        ),
        duration: 10000,
      });
    } catch (err: any) {
      let errorMessage = err.message || "An unknown error occurred during cache refresh.";
      setSyncError(errorMessage);
      toast({ variant: "destructive", title: "Cache Refresh Failed", description: errorMessage, duration: 10000 });
    }
    setIsRefreshingCache(false);
  };

  const handleSyncInventory = async () => {
     if (!user || user.uid !== ADMIN_UID) {
      toast({ variant: "destructive", title: "Access Denied", description: "Only administrators can sync inventory." });
      return;
    }
    setIsSyncingInventory(true);
    setSyncError(null);
    try {
      toast({ title: "Syncing Shopify Products to Local Inventory...", description: "Updating local inventory based on Shopify data. This uses delta changes." });
      const summary = await syncShopifyToInventory(); // Server action
      
      let descriptionContent: React.ReactNode = (
        <div>
          <p>Items Added to Main Inventory: {summary.itemsAdded}</p>
          <p>Items Updated in Main Inventory: {summary.itemsUpdated}</p>
          <p>Items Skipped: {summary.itemsSkipped}</p>
        </div>
      );

      if (summary.detailedChanges && summary.detailedChanges.length > 0) {
        // ... (detailed changes rendering logic remains same)
      }
      
      if (summary.errors.length > 0) {
         // ... (error rendering logic remains same)
      }

      toast({
        title: summary.errors.length > 0 ? "Shopify to Inventory Sync Completed with Errors" : "Shopify to Inventory Sync Completed",
        description: descriptionContent,
        variant: summary.errors.length > 0 ? "destructive" : "default",
        duration: 15000,
      });
      
      await loadCachedProducts(); // Reload client-side view

    } catch (err: any) {
      let errorMessage = err.message || "An unknown error occurred during Shopify sync.";
      setSyncError(errorMessage);
      toast({ variant: "destructive", title: "Shopify Sync Failed", description: errorMessage, duration: 10000 });
    }
    setIsSyncingInventory(false);
  };

  if (authIsLoading) {
     return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Verifying authentication...</p>
      </div>
    );
  }

  if (accessDenied && !isLoadingCache) { // Show access denied only after auth check and if cache isn't loading
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Shopify Product Data</h1>
         <Alert variant="destructive">
          <AlertTriangleIconLucide className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>{accessDenied}</AlertDescription>
        </Alert>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Shopify Product Data</h1>
        <div className="flex gap-2">
          <Button onClick={handleRefreshCache} disabled={isRefreshingCache || isSyncingInventory || isLoadingCache || !!accessDenied} variant="outline">
            {isRefreshingCache ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing Cache...</>
            ) : (
              <><RefreshCw className="mr-2 h-4 w-4" /> Refresh Shopify Data</>
            )}
          </Button>
          <Button onClick={handleSyncInventory} disabled={isSyncingInventory || isRefreshingCache || isLoadingCache || !!accessDenied}>
            {isSyncingInventory ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing Inventory...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" /> Sync to Local Inventory</>
            )}
          </Button>
        </div>
      </div>

      {(syncError && !accessDenied) && (
        <Alert variant="destructive">
          <AlertTriangleIconLucide className="h-4 w-4" />
          <AlertTitle>Operation Error</AlertTitle>
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Cached Product Listings from Shopify
          </CardTitle>
          <CardDescription>
            Showing cached data from Shopify. Last cache refresh: {lastCacheRefreshTime || 'N/A'}.
            Use 'Refresh Shopify Data' for the latest, then 'Sync to Local Inventory' to update your app's inventory using delta changes.
            This page is accessible by administrators only.
          </CardDescription>
        </CardHeader>
        <CardContent>
           {isLoadingCache && !accessDenied ? (
             <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading Shopify product cache...</p>
              </div>
           ) : (
            <ShopifyProductsTable
              products={cachedProducts}
              isLoading={false} 
              error={syncError}
            />
           )}
        </CardContent>
      </Card>
    </div>
  );
}

    