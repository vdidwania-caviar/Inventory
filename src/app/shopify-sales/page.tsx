
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShopifySalesTable } from '@/components/shopify/shopify-sales-table';
import { fetchAndCacheShopifyOrders, getCachedShopifyOrders, getShopifyOrderSyncState } from '@/lib/shopify-order-service';
import { getAdminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { RefreshCw, AlertTriangle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import type { ShopifyOrderCacheItem, ShopifyOrderSyncState } from '@/lib/types';

const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2";

export default async function ShopifySalesPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const cookiesList = cookies(); // Await cookies
  const sessionCookie = cookiesList.get('__session')?.value;

  let isAdminUser = false;
  try {
    if (sessionCookie) {
      const auth = getAdminAuth();
      const decodedToken = await auth.verifySessionCookie(sessionCookie, true); // First await
      if (decodedToken.uid === ADMIN_UID) {
        isAdminUser = true;
      }
    }
  } catch (error) {
    console.warn("Shopify Sales Page: Admin check via session cookie failed or no cookie. User is not admin.", error);
  }

  if (!isAdminUser && process.env.NODE_ENV !== 'production') {
    console.warn("Shopify Sales Page: DEV MODE - Bypassing strict admin check for Shopify Sales page.");
    // isAdminUser = true; // Uncomment for local testing ONLY IF admin check is problematic
  }

  // Now, after the first await (admin check), we can access searchParams
  const action =
    typeof searchParams?.action === 'string'
      ? searchParams.action
      : Array.isArray(searchParams?.action)
        ? searchParams.action[0]
        : undefined;

  let actionResult: { success: boolean; message: string; details?: string[] } | null = null;
  let initialOrders: ShopifyOrderCacheItem[] = [];
  let initialError: string | null = null;
  let syncState: ShopifyOrderSyncState | null = null;

  if (!isAdminUser && process.env.NODE_ENV === 'production') {
    if (action === 'refresh_orders') {
      actionResult = { success: false, message: "Admin privileges required to refresh orders." };
    } else {
      // If not admin in prod and not trying to refresh, deny access.
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

  // Process action if user is admin or in dev with bypass
  if (action === 'refresh_orders' && (!actionResult || actionResult.success)) {
    if (isAdminUser || (process.env.NODE_ENV !== 'production' && !isAdminUser)) {
      console.log("ShopifySalesPage: 'refresh_orders' action triggered. Calling fetchAndCacheShopifyOrders.");
      try {
        const result = await fetchAndCacheShopifyOrders(); // Second potential await
        actionResult = {
          success: result.success,
          message: result.error || `Fetched ${result.fetchedCount}, Cached ${result.cachedCount}, Deleted ${result.deletedCount} orders. Sync type: ${result.syncTypeUsed || 'N/A'}.`,
          details: result.details
        };
      } catch (e: any) {
        console.warn("ShopifySalesPage: Error during fetchAndCacheShopifyOrders action:", e);
        actionResult = { success: false, message: e.message || "Failed to refresh Shopify orders.", details: e.details };
        initialError = e.message || "Failed to refresh Shopify orders during action.";
      }
    } else if (!actionResult) { 
      actionResult = { success: false, message: "Admin privileges required for refresh (strict mode)." };
    }
  }

  // Fetch initial data if not already blocked by access denied for action
  if (!actionResult?.success && actionResult?.message.includes("Admin privileges required")) {
    // If action was blocked due to admin rights, don't proceed to fetch initial data.
    // The main access denied block for page view will handle non-admin viewing.
  } else {
    try {
      initialOrders = await getCachedShopifyOrders(); // Third potential await
      syncState = await getShopifyOrderSyncState();   // Fourth potential await
    } catch (e: any) {
      console.warn("ShopifySalesPage: Error fetching initial Shopify orders or sync state:", e);
      if (!actionResult) { // Only set initialError if not already set by a failed action
          initialError = e.message || "Failed to load initial Shopify orders from cache or sync state.";
      }
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
          <Button type="submit">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Shopify Orders Cache
          </Button>
        </form>
      </div>

      {actionResult && (
        <Alert variant={actionResult.success ? "default" : "destructive"} className="mt-4">
          {actionResult.success ? null : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{actionResult.success ? 'Action Successful' : 'Action Failed'}</AlertTitle>
          <AlertDescription>
            {actionResult.message}
            {actionResult.details && actionResult.details.length > 0 && (
              <ul className="list-disc list-inside text-xs mt-2 max-h-40 overflow-y-auto">
                {actionResult.details.map((detail, i) => <li key={i}>{detail}</li>)}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {initialError && !actionResult && ( 
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
            error={initialError && !actionResult ? initialError : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
