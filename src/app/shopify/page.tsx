
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
import { app, db } from '@/lib/firebase';
import { getAuth, type User as FirebaseAuthUser } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, Timestamp as ClientTimestamp } from 'firebase/firestore';
import { fetchShopifyProducts, updateShopifyProductCacheInFirestore } from '@/lib/shopify-service';
import { isValid } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

const SHOPIFY_CACHE_COLLECTION = 'shopifyProductCache';
const SYNC_STATE_DOC_ID = 'shopifyProductsSyncState';
const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2";

export default function ShopifyPage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const [isSyncingInventory, setIsSyncingInventory] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cachedProducts, setCachedProducts] = useState<ShopifyVariantDetail[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [lastCacheRefreshTime, setLastCacheRefreshTime] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  const { toast } = useToast();

  async function loadCachedProducts() {
    console.log("ShopifyPage: loadCachedProducts called by admin.");
    setIsLoadingCache(true);
    setSyncError(null);

    if (!user || user.uid !== ADMIN_UID) {
      console.warn("ShopifyPage: loadCachedProducts called, but user is not admin. Aborting.");
      setAccessDenied("Access Denied: Admin privileges required to load Shopify data.");
      setIsLoadingCache(false);
      setCachedProducts([]);
      setLastCacheRefreshTime(null);
      return;
    }

    const auth = getAuth(app);
    const currentUserForFirestore = auth.currentUser;

    if (!currentUserForFirestore || currentUserForFirestore.uid !== ADMIN_UID) {
        console.error(`ShopifyPage: CRITICAL AUTH MISMATCH - auth.currentUser.uid (${currentUserForFirestore?.uid}) !== ADMIN_UID (${ADMIN_UID}) or currentUser is null immediately before Firestore read!`);
        setSyncError("Critical auth mismatch during data load. Please refresh and try again.");
        setIsLoadingCache(false);
        setAccessDenied("Authentication state error. Please refresh.");
        return;
    }

    try {
      console.log(`ShopifyPage: Attempting to read '${SHOPIFY_CACHE_COLLECTION}' collection...`);
      const cacheSnapshot = await getDocs(collection(db, SHOPIFY_CACHE_COLLECTION));
      const products = cacheSnapshot.docs.map(docSnap => docSnap.data() as ShopifyVariantDetail);
      setCachedProducts(products);
      console.log(`ShopifyPage: Loaded ${products.length} products from cache.`);

      console.log(`ShopifyPage: Attempting to read 'syncState/${SYNC_STATE_DOC_ID}' document...`);
      const syncStateRef = doc(db, 'syncState', SYNC_STATE_DOC_ID);
      const syncStateSnap = await getDoc(syncStateRef);

      if (syncStateSnap.exists()) {
        const stateData = syncStateSnap.data() as ShopifySyncState;
        const rawTs = stateData.lastFullSyncCompletionTimestamp;
        console.log("ShopifyPage: Raw lastFullSyncCompletionTimestamp from Firestore:", rawTs);

        if (rawTs) {
          let dateToFormat: Date | null = null;
          if (rawTs instanceof ClientTimestamp) {
            dateToFormat = rawTs.toDate();
            console.log("ShopifyPage: Parsed as Firestore Client SDK Timestamp object");
          } else if (typeof rawTs === 'string') {
            dateToFormat = new Date(rawTs);
            console.log("ShopifyPage: Parsed as string");
            if (!isValid(dateToFormat)) {
                try { dateToFormat = new Date(Date.parse(rawTs)); console.log("ShopifyPage: Attempted ISO parse for string"); } catch {}
            }
          } else if (rawTs && typeof (rawTs as any).seconds === 'number' && typeof (rawTs as any).nanoseconds === 'number') {
             dateToFormat = new ClientTimestamp((rawTs as any).seconds, (rawTs as any).nanoseconds).toDate();
             console.log("ShopifyPage: Parsed as seconds/nanoseconds object into ClientTimestamp");
          } else if (typeof (rawTs as any).toDate === 'function') {
             dateToFormat = (rawTs as any).toDate();
             console.log("ShopifyPage: Parsed via generic toDate() method");
          }


          if (dateToFormat && isValid(dateToFormat)) {
            setLastCacheRefreshTime(dateToFormat.toLocaleString());
            console.log("ShopifyPage: Successfully set lastCacheRefreshTime to:", dateToFormat.toLocaleString());
          } else {
            setLastCacheRefreshTime('Invalid Date (parsing failed or null)');
            console.error("ShopifyPage: Failed to parse rawTs into a valid Date. RawTs:", rawTs, "Parsed Date Obj:", dateToFormat);
          }
        } else {
           setLastCacheRefreshTime(null);
           console.log("ShopifyPage: No lastFullSyncCompletionTimestamp found in syncState.");
        }
      } else {
         console.log("ShopifyPage: syncState document does not exist.");
         setLastCacheRefreshTime(null);
      }

    } catch (error: any) {
      console.error("ShopifyPage: Error in loadCachedProducts Firestore read attempt:", error);
      console.error("ShopifyPage: Firestore Error Code:", error.code);
      console.error("ShopifyPage: Firestore Error Message:", error.message);
      if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED' || (error.message && error.message.toLowerCase().includes('permission'))) {
        setSyncError("Firestore permission denied during data load. Ensure you are logged in as the administrator and Firestore rules allow access for your UID.");
        setAccessDenied("Firestore permission denied. Ensure you are logged in as the administrator and Firestore rules allow access for your UID.");
      } else {
        setSyncError(`Failed to load Shopify data from local cache/sync state: ${error.message} (Code: ${error.code || 'N/A'})`);
      }
      setCachedProducts([]);
      setLastCacheRefreshTime(null);
    }
    setIsLoadingCache(false);
  }

  useEffect(() => {
    console.log(`ShopifyPage: useEffect triggered. authIsLoading: ${authIsLoading}, user: ${user ? user.uid : 'null'}`);
    if (!authIsLoading) {
      console.log(`ShopifyPage: Auth resolved. User UID: ${user?.uid}, Admin UID: ${ADMIN_UID}`);
      if (user && user.uid === ADMIN_UID) {
        setAccessDenied(null);
        console.log("ShopifyPage: Admin user confirmed. Calling loadCachedProducts.");
        loadCachedProducts();
      } else if (user) {
        setAccessDenied("Access Denied: This page is for administrators only.");
        setIsLoadingCache(false);
        setCachedProducts([]);
        setLastCacheRefreshTime(null);
        console.log(`ShopifyPage: Access denied for user ${user.uid}. Required admin: ${ADMIN_UID}.`);
      } else {
        setAccessDenied("Access Denied: You must be logged in as an administrator.");
        setIsLoadingCache(false);
        setCachedProducts([]);
        setLastCacheRefreshTime(null);
        console.log(`ShopifyPage: No user logged in. Access denied.`);
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
      toast({ title: "Refreshing Shopify Data...", description: "Fetching all products from Shopify. This may take a moment." });
      
      const allShopifyProducts = await fetchShopifyProducts({ forceFullSync: true });
      fetchedProductsCount = allShopifyProducts.length;
      console.log(`ShopifyPage: Fetched ${fetchedProductsCount} products for cache refresh via server action.`);

      const updateResult = await updateShopifyProductCacheInFirestore(allShopifyProducts, true);
      console.log(`ShopifyPage: Firestore cache updated: ${updateResult.countAddedOrUpdated} products added/updated, ${updateResult.countDeleted} products deleted.`);
      
      if (!updateResult.success) {
        throw new Error(updateResult.error || "Failed to update Firestore cache via server action.");
      }
      
      await loadCachedProducts();

      toast({
        title: "Shopify Data Cache Refreshed",
        description: (
            <div>
                <p>Fetched from Shopify: {fetchedProductsCount} product variants.</p>
                <p>Local Shopify product data cache updated: {updateResult.countAddedOrUpdated} variants added/updated, {updateResult.countDeleted} variants removed as stale.</p>
                <p className="text-xs mt-1 italic">This process updates the local cache of Shopify products and does not directly alter your main inventory records or counts.</p>
            </div>
        ),
        duration: 10000,
      });
    } catch (err: any) {
      console.error("ShopifyPage: Cache Refresh Error (raw):", err);
      let errorMessage: string;
      if (err instanceof Error) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;
      else if (err && typeof err.message === 'string') errorMessage = err.message;
      else errorMessage = "An unknown error occurred during cache refresh. Check server logs for details.";
      
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
      toast({ title: "Syncing Inventory with Shopify...", description: "Fetching product changes and updating local inventory. This uses delta changes." });
      const summary = await syncShopifyToInventory();
      
      let descriptionContent: React.ReactNode = (
        <div>
          <p>Items Added to Main Inventory: {summary.itemsAdded}</p>
          <p>Items Updated in Main Inventory: {summary.itemsUpdated}</p>
          <p>Items Skipped (e.g., no SKU): {summary.itemsSkipped}</p>
        </div>
      );

      if (summary.detailedChanges && summary.detailedChanges.length > 0) {
        const maxChangesToShow = 5;
        const changesToShow = summary.detailedChanges.slice(0, maxChangesToShow);
        const moreChangesCount = summary.detailedChanges.length - maxChangesToShow;

        descriptionContent = (
          <div>
            <p>Items Added to Main Inventory: {summary.itemsAdded}</p>
            <p>Items Updated in Main Inventory: {summary.itemsUpdated}</p>
            <p>Items Skipped (e.g., no SKU): {summary.itemsSkipped}</p>
            <p className="font-semibold mt-2">Key Changes to Main Inventory:</p>
            <ul className="list-disc list-inside text-xs max-h-32 overflow-y-auto">
              {changesToShow.map((change, i) => <li key={i}>{change}</li>)}
            </ul>
            {moreChangesCount > 0 && (
              <p className="text-xs mt-1">...and {moreChangesCount} more changes. See console for full details.</p>
            )}
          </div>
        );
        console.log("ShopifyPage: Shopify Sync - Detailed Changes:", summary.detailedChanges);
      }
      
      if (summary.errors.length > 0) {
         descriptionContent = (
          <div>
            {descriptionContent}
            <div className="mt-2">
              <p className="font-semibold text-destructive">Errors ({summary.errors.length}):</p>
              <ul className="list-disc list-inside text-xs max-h-20 overflow-y-auto text-destructive-foreground bg-destructive p-2 rounded">
                {summary.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          </div>
        );
      }

      toast({
        title: summary.errors.length > 0 ? "Shopify to Main Inventory Sync Completed with Errors" : "Shopify to Main Inventory Sync Completed",
        description: descriptionContent,
        variant: summary.errors.length > 0 ? "destructive" : "default",
        duration: summary.errors.length > 0 || (summary.detailedChanges && summary.detailedChanges.length > 0) ? 15000 : 8000,
      });
      
      await loadCachedProducts();


    } catch (err: any) {
      console.error("ShopifyPage: Shopify Sync Error (UI):", err);
      let errorMessage: string;
      if (err instanceof Error) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;
      else if (err && typeof err.message === 'string') errorMessage = err.message;
      else errorMessage = "An unknown error occurred during Shopify sync. Check server logs for details.";
      
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

  if (accessDenied && !isLoadingCache) {
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
