

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShopifySalesTable } from '@/components/shopify/shopify-sales-table';
import { fetchAndCacheShopifyOrders, getCachedShopifyOrders, getShopifyOrderSyncState } from '@/lib/shopify-order-service'; // Added getShopifyOrderSyncState
import { getAdminAuth, admin } from '@/lib/firebase-admin'; // Use getAdminAuth
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RefreshCw, AlertTriangle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import type { ShopifyOrderCacheItem, ShopifyOrderSyncState } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';


const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2"; // Make sure this is your actual admin UID

export default async function ShopifySalesPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const cookiesList = await cookies();
  const sessionCookie = cookiesList.get('__session')?.value;

  let isAdminUser = false;
  try {
    if (sessionCookie) {
      const auth = getAdminAuth(); // Get auth instance
      const decodedToken = await auth.verifySessionCookie(sessionCookie, true);
      if (decodedToken.uid === ADMIN_UID) {
        isAdminUser = true;
      }
    }
  } catch (error) {
    console.warn("Shopify Sales Page: Admin check via session cookie failed or no cookie. User is not admin.", error);
  }

  if (!isAdminUser && process.env.NODE_ENV !== 'production') {
    console.warn("Shopify Sales Page: DEV MODE - Bypassing strict admin check for Shopify Sales page.");
    // Allow access in dev for easier testing if admin check fails, but show warning
    // isAdminUser = true; // Uncomment this line ONLY for temporary local testing if admin check is problematic
  }
  
  let actionResult: { success: boolean; message: string; details?: string[] } | null = null;
  let initialOrders: ShopifyOrderCacheItem[] = [];
  let initialError: string | null = null;
  let syncState: ShopifyOrderSyncState | null = null;

  // Read searchParams *after* initial async operations.
  const action =
    typeof searchParams?.action === 'string'
      ? searchParams.action
      : Array.isArray(searchParams?.action)
        ? searchParams.action[0]
        : undefined;

  if (!isAdminUser && process.env.NODE_ENV === 'production' && action === 'refresh_orders') {
    // If not admin in prod, and trying to refresh, block early
    actionResult = { success: false, message: "Admin privileges required to refresh orders." };
  } else if (!isAdminUser && process.env.NODE_ENV === 'production') {
    // If not admin in prod and just viewing page, show access denied (or redirect)
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


  if (action === 'refresh_orders' && (!actionResult || actionResult.success)) { // Proceed if not already blocked by admin check
    // Check admin privileges again, especially if dev mode bypass was active
    if (isAdminUser || (process.env.NODE_ENV !== 'production' && !isAdminUser /* implied dev bypass for action */)) {
        console.log("ShopifySalesPage: 'refresh_orders' action triggered. Calling fetchAndCacheShopifyOrders without forceFullSync.");
        const result = await fetchAndCacheShopifyOrders(); // Removed forceFullSync: true
        actionResult = {
            success: result.success,
            message: result.error || `Fetched ${result.fetchedCount}, Cached ${result.cachedCount}, Deleted ${result.deletedCount} orders. Sync type: ${result.syncTypeUsed || 'N/A'}.`,
            details: result.details
        };
    } else {
        // This case should ideally be caught by the earlier admin check for production
        actionResult = { success: false, message: "Admin privileges required for refresh (strict mode)." };
    }
  }

  try {
    initialOrders = await getCachedShopifyOrders();
    syncState = await getShopifyOrderSyncState();
  } catch (e: any) {
    initialError = e.message || "Failed to load initial Shopify orders from cache.";
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

