
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShopifySalesTable } from '@/components/shopify/shopify-sales-table';
import { fetchAndCacheShopifyOrders, getCachedShopifyOrders } from '@/lib/shopify-order-service';
import { getAdminDb } from '@/lib/firebase-admin'; // To check admin status maybe, or directly via auth context
import { auth } from 'firebase-admin'; // For type
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RefreshCw, AlertTriangle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Timestamp } from 'firebase-admin/firestore';
import type { ShopifyOrderCacheItem, ShopifyOrderSyncState } from '@/lib/types';

const ADMIN_UID = "xxF5GLpy4KYuOvHgt7Yx4Ra3Bju2"; // Define your admin UID
const ORDER_SYNC_STATE_DOC_ID = 'shopifyOrdersSyncState';

async function getOrderSyncState(): Promise<ShopifyOrderSyncState | null> {
  try {
    const adminDb = getAdminDb();
    const syncStateRef = adminDb.collection('syncState').doc(ORDER_SYNC_STATE_DOC_ID);
    const docSnap = await syncStateRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() as ShopifyOrderSyncState;
      // Convert Firestore Timestamps back to ISO strings
      if (data.lastOrderSyncTimestamp && typeof data.lastOrderSyncTimestamp !== 'string') {
        data.lastOrderSyncTimestamp = (data.lastOrderSyncTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      if (data.lastFullOrderSyncCompletionTimestamp && typeof data.lastFullOrderSyncCompletionTimestamp !== 'string') {
        data.lastFullOrderSyncCompletionTimestamp = (data.lastFullOrderSyncCompletionTimestamp as unknown as Timestamp).toDate().toISOString();
      }
      return data;
    }
    return null;
  } catch (error) {
    console.error("Shopify Sales Page: Error fetching order sync state:", error);
    return null; // Return null on error to allow page to render with a message
  }
}


export default async function ShopifySalesPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  // Admin Check (Example - adapt to your auth system if not using Firebase Admin SDK for user session)
  // This simple check is a placeholder. Robust auth is complex.
  // In a real app, you'd verify a session cookie or token.
  // For Firebase Studio, let's assume an admin UID check is sufficient for now.
  // This part needs to be adapted if you have a different auth mechanism for admins.
  
  // Placeholder for admin check. Replace with your actual admin auth logic.
  // const isAdmin = true; // For now, assume admin
  // A more robust check would involve verifying a user's session / roles.
  // For this example, we'll rely on a cookie or similar that can be checked server-side,
  // or just a hardcoded check for simplicity if you're the only admin user.
  // This is a very basic check and might need enhancement based on your actual auth.
  let isAdminUser = false;
  try {
      const sessionCookie = cookies().get('__session')?.value; // Example, adapt to your session cookie
      if (sessionCookie) {
          const decodedToken = await auth().verifySessionCookie(sessionCookie, true);
          if (decodedToken.uid === ADMIN_UID) {
              isAdminUser = true;
          }
      }
  } catch (error) {
      // If cookie verification fails, user is not admin or not logged in properly via this mechanism.
      console.warn("Shopify Sales Page: Admin check via session cookie failed or no cookie. User is not admin.", error);
  }

  if (!isAdminUser && process.env.NODE_ENV === 'production') { // More lenient in dev
      // If you have a login page:
      // redirect('/login?message=Admin access required'); 
      // Or show a generic access denied page:
      return (
        <div className="space-y-6 p-4">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>You do not have permission to view this page. Please log in as an administrator.</AlertDescription>
            </Alert>
             <Button asChild variant="link"><Link href="/login">Go to Login</Link></Button>
        </div>
      );
  }
  if (!isAdminUser && process.env.NODE_ENV !== 'production') {
    console.warn("Shopify Sales Page: DEV MODE - Bypassing strict admin check for Shopify Sales page.");
  }


  let actionResult: { success: boolean; message: string; details?: string[] } | null = null;
  let initialOrders: ShopifyOrderCacheItem[] = [];
  let initialError: string | null = null;
  let syncState: ShopifyOrderSyncState | null = null;

  if (searchParams?.action === 'refresh_orders') {
    if(!isAdminUser && process.env.NODE_ENV === 'production') {
        actionResult = {success: false, message: "Admin privileges required to refresh."};
    } else {
        const result = await fetchAndCacheShopifyOrders({ forceFullSync: true });
        actionResult = { success: result.success, message: result.error || `Fetched ${result.fetchedCount}, Cached ${result.cachedCount}, Deleted ${result.deletedCount} orders.`, details: result.details };
    }
  }

  try {
    initialOrders = await getCachedShopifyOrders();
    syncState = await getOrderSyncState();
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
        <form action="?/refresh_orders">
            <Button type="submit" name="action" value="refresh_orders">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Shopify Orders Cache
            </Button>
        </form>
      </div>

      {actionResult && (
        <Alert variant={actionResult.success ? "default" : "destructive"} className="mt-4">
          <AlertTriangle className={actionResult.success ? "hidden" : "h-4 w-4"} />
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
            isLoading={false} // Data is pre-loaded server-side or from action
            error={initialError && !actionResult ? initialError : null} // Show error if initial load failed and no action was taken
          />
        </CardContent>
      </Card>
    </div>
  );
}
