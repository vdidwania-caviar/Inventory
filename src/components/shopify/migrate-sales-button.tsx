
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { migrateExistingSalesToInvoices } from '@/lib/shopify-order-service'; // Server Action
import { Loader2, DatabaseZap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { FetchAndCacheResult } from '@/lib/types'; // Assuming this type is appropriate

export function MigrateSalesButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<FetchAndCacheResult | null>(null);
  const { toast } = useToast();

  const handleMigrate = async () => {
    setIsLoading(true);
    setMigrationResult(null);
    try {
      const result = await migrateExistingSalesToInvoices();
      setMigrationResult(result);
      if (result.success) {
        toast({
          title: 'Migration Successful',
          description: (
            <div>
              <p>Sales processed: {result.salesProcessed}</p>
              <p>Invoices created: {result.invoicesCreated}</p>
              <p>Sales updated: {result.salesUpdatedWithInvoiceId}</p>
              {result.details && result.details.length > 0 && (
                <ul className="list-disc list-inside text-xs mt-1 max-h-20 overflow-y-auto">
                  {result.details.slice(0, 5).map((detail, i) => <li key={i}>{detail}</li>)}
                  {result.details.length > 5 && <li>...and {result.details.length - 5} more details in server logs.</li>}
                </ul>
              )}
            </div>
          ),
          duration: 10000,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Migration Failed',
          description: result.error || 'An unknown error occurred during migration.',
          duration: 10000,
        });
      }
    } catch (error: any) {
      setMigrationResult({
        success: false,
        error: error.message || 'An unexpected error occurred.',
        salesProcessed: 0,
        invoicesCreated: 0,
        salesUpdatedWithInvoiceId: 0,
        details: [error.message || 'Client-side error during migration call.'],
        // Initialize other counts to 0 for FetchAndCacheResult compatibility
        fetchedCount: 0,
        cachedCount: 0,
        deletedCount: 0,
      });
      toast({
        variant: 'destructive',
        title: 'Migration Error',
        description: error.message || 'Failed to initiate migration.',
        duration: 10000,
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="my-4 space-y-3">
      <Button onClick={handleMigrate} disabled={isLoading} variant="destructive" size="sm">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <DatabaseZap className="mr-2 h-4 w-4" />
        )}
        Migrate Existing Sales to Invoices (One-Time)
      </Button>
      {migrationResult && (
        <Alert variant={migrationResult.success ? "default" : "destructive"} className="mt-2">
          <AlertTitle>{migrationResult.success ? 'Migration Process Completed' : 'Migration Process Failed'}</AlertTitle>
          <AlertDescription>
            <p>Sales Records Processed: {migrationResult.salesProcessed}</p>
            <p>Invoices Created/Found: {migrationResult.invoicesCreated}</p>
            <p>Sales Linked to Invoices: {migrationResult.salesUpdatedWithInvoiceId}</p>
            {migrationResult.error && <p className="font-semibold mt-1">Error: {migrationResult.error}</p>}
             {migrationResult.details && migrationResult.details.length > 0 && (
                <div className="mt-2 text-xs">
                    <p className="font-medium mb-1">Migration Log Highlights (first 5):</p>
                    <ul className="list-disc list-inside max-h-32 overflow-y-auto bg-muted/30 p-2 rounded">
                    {migrationResult.details.slice(0, 5).map((detail, i) => <li key={i}>{detail}</li>)}
                    {migrationResult.details.length > 5 && <li>...and {migrationResult.details.length - 5} more details available in server logs.</li>}
                    </ul>
                </div>
            )}
          </AlertDescription>
        </Alert>
      )}
       <Alert variant="default" className="mt-2 bg-amber-50 border-amber-300 text-amber-800 [&>svg]:text-amber-700">
            <DatabaseZap className="h-4 w-4" />
            <AlertTitle>Important Note</AlertTitle>
            <AlertDescription>
            This migration attempts to group existing 'sales' records into 'invoice' documents.
            It processes sales not yet linked to an invoice.
            If an invoice with the derived Shopify Order # (e.g., SH-XXXX) already exists, sales will be linked to it; otherwise, a new invoice is created.
            Backup your Firestore data before running. This button should be removed after successful migration.
            </AlertDescription>
        </Alert>
    </div>
  );
}
