
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShopifySalesTable } from '@/components/shopify/shopify-sales-table';
import { fetchAndCacheShopifyOrders, getCachedShopifyOrders, getShopifyOrderSyncState } from '@/lib/shopify-order-service';
import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { RefreshCw, AlertTriangle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import type { ShopifyOrderCacheItem, ShopifyOrderSyncState, FetchAndCacheResult } from '@/lib/types';
import { MigrateSalesButton } from '@/components/shopify/migrate-sales-button'; // Import the new client component

const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2";

export default async function ShopifySalesPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const cookiesList = cookies();
  const sessionCookie = cookiesList.get('__session')?.value;

  let isAdminUser = true;
  let initialActionResult: FetchAndCacheResult | null = null; // Renamed to avoid conflict with client-side state

  try {
    if (sessionCookie) {
      const auth = getAdminAuth();
      const decodedToken = await auth.verifySessionCookie(sessionCookie, true);
      if (decodedToken.uid === ADMIN_UID) {
        isAdminUser = true;
      }
    }
  } catch (error) {
    console.warn("Shopify Sales Page: Admin check via session cookie failed or no cookie.", error);
  }

  if (!isAdminUser && process.env.NODE_ENV !== 'production') {
    console.warn("Shopify Sales Page: DEV MODE - Bypassing strict admin check for Shopify Sales page. USER IS NOT ADMIN.");
    // isAdminUser = true; // Uncomment for local testing ONLY IF admin check is problematic and understand implications
  }
  
  const action =
    typeof searchParams?.action === 'string'
      ? searchParams.action
      : Array.isArray(searchParams?.action)
        ? searchParams.action[0]
        : undefined;

  let initialOrders: ShopifyOrderCacheItem[] = [];
  let initialError: string | null = null;
  let syncState: ShopifyOrderSyncState | null = null;

  if (action === 'refresh_orders') {
    if (isAdminUser || (process.env.NODE_ENV !== 'production' /* && !isAdminUser - implicit */)) {
      console.log("ShopifySalesPage: 'refresh_orders' action triggered. Calling fetchAndCacheShopifyOrders.");
      try {
        const result = await fetchAndCacheShopifyOrders({ forceFullSync: false }); // Default to delta
        initialActionResult = result;
      } catch (e: any) {
        console.warn("ShopifySalesPage: Error during fetchAndCacheShopifyOrders action:", e);
        initialActionResult = { 
          success: false, 
          message: e.message || "Failed to refresh Shopify orders.", 
          details: e.details,
          // Initialize other FetchAndCacheResult fields to default/zero values
          fetchedCount: 0, cachedCount: 0, deletedCount: 0, 
          invoicesCreated: 0, salesItemsCreated: 0,
          error: e.message || "Failed to refresh Shopify orders.",
        };
        initialError = e.message || "Failed to refresh Shopify orders during action.";
      }
    } else if (!isAdminUser) {
      initialActionResult = { 
        success: false, 
        message: "Admin privileges required to refresh orders.",
        fetchedCount: 0, cachedCount: 0, deletedCount: 0, 
        invoicesCreated: 0, salesItemsCreated: 0,
      };
    }
  }

  if (!isAdminUser && process.env.NODE_ENV === 'production') {
    // This block denies access if not admin in prod, regardless of action,
    // UNLESS the action itself was already blocked by lack of admin rights.
    if (!initialActionResult || initialActionResult.success || !initialActionResult.message?.includes("Admin privileges required")) {
      return (
        <div className="space-y-6 p-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view this page. Please log in as an administrator.
            </AlertDescription>
          </Alert>
          <Button asChild variant="link">
            <Link href="/login">Go to Login</Link>
          </Button>
        </div>
      );
    }
  }
  
  try {
    initialOrders = await getCachedShopifyOrders();
    syncState = await getShopifyOrderSyncState();
  } catch (e: any) {
    console.warn("ShopifySalesPage: Error fetching initial Shopify orders or sync state:", e);
    if (!initialActionResult) {
        initialError = e.message || "Failed to load initial Shopify orders from cache or sync state.";
    }
  }
  
  const lastFullSyncTime = syncState?.lastFullOrderSyncCompletionTimestamp
    ? new Date(syncState.lastFullOrderSyncCompletionTimestamp).toLocaleString()
    : 'Never';
  const lastDeltaSyncTime = syncState?.lastOrderSyncTimestamp
    ? new Date(syncState.lastOrderSyncTimestamp).toLocaleString()
    : 'Never';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Shopify Sales Orders</h1>
        <form action="/shopify-sales" method="GET">
          <input type="hidden" name="action" value="refresh_orders" />
          <Button type="submit" disabled={!isAdminUser && process.env.NODE_ENV === 'production'}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Shopify Orders Cache
          </Button>
        </form>
      </div>

      {isAdminUser && <MigrateSalesButton />} {/* Conditionally render the client component */}

      {initialActionResult && (
        <Alert variant={initialActionResult.success ? "default" : "destructive"} className="mt-4">
          {!initialActionResult.success && <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{initialActionResult.success ? 'Action Successful' : 'Action Failed'}</AlertTitle>
          <AlertDescription>
            {initialActionResult.message || (initialActionResult.success ? 'Operation completed.' : 'Operation failed with an unknown error.')}
            {initialActionResult.details && initialActionResult.details.length > 0 && (
              <ul className="list-disc list-inside text-xs mt-2 max-h-40 overflow-y-auto">
                {initialActionResult.details.slice(0, 5).map((detail, i) => <li key={i}>{detail}</li>)}
                {initialActionResult.details.length > 5 && <li>...and {initialActionResult.details.length -5} more details in server logs.</li>}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {initialError && !initialActionResult && ( 
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Orders</AlertTitle>
          <AlertDescription>{initialError}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Cached Shopify Orders
          </CardTitle>
          <CardDescription className="text-xs">
            Displaying orders from the local Firestore cache.
            Last full cache refresh: {lastFullSyncTime}. Last delta sync attempt: {lastDeltaSyncTime}.
            Use 'Refresh Shopify Orders Cache' for the latest data from your Shopify store.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShopifySalesTable
            orders={initialOrders}
            isLoading={false} 
            error={initialError && !initialActionResult ? initialError : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

