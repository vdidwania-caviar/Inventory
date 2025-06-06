
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { SimplePurchase } from '@/lib/types';
import { Loader2, ArrowLeft, Edit, Trash2, DollarSign, Package, CalendarDays, Hash, FileText, User, Tag, Link as LinkIcon, Info, ShoppingCart } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function safeFormatDate(dateInput?: string | Timestamp | { seconds: number; nanoseconds: number }): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) {
        // Try parsing common non-ISO formats if ISO fails
        const commonFormatParsed = new Date(dateInput);
        if (!isValid(commonFormatParsed)) return 'Invalid Date String';
        dateToFormat = commonFormatParsed;
      } else {
        dateToFormat = parsedDate;
      }
    } else if (dateInput && typeof (dateInput as any).seconds === 'number' && typeof (dateInput as any).nanoseconds === 'number') {
        dateToFormat = new Timestamp((dateInput as any).seconds, (dateInput as any).nanoseconds).toDate();
    } else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'MMM d, yyyy');
  } catch {
    return 'Date Error';
  }
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return `$${amount.toFixed(2)}`;
}

function formatTagsForDisplay(tagsInput?: string[] | string): string {
  if (!tagsInput) return 'N/A';
  if (Array.isArray(tagsInput)) {
    return tagsInput.join(', ');
  }
  return String(tagsInput);
}


export default function PurchaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const purchaseId = typeof params.id === 'string' ? params.id : undefined;

  const [purchase, setPurchase] = useState<SimplePurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseId) {
      setError('Purchase ID is missing.');
      setLoading(false);
      return;
    }

    async function fetchPurchase() {
      setLoading(true);
      setError(null);
      try {
        const purchaseDocRef = doc(db, 'purchases', purchaseId);
        const purchaseDocSnap = await getDoc(purchaseDocRef);

        if (purchaseDocSnap.exists()) {
          const rawData = purchaseDocSnap.data();
          
          const convertTimestamp = (tsField: any): string | undefined => {
            if (!tsField) return undefined;
            if (tsField instanceof Timestamp) return tsField.toDate().toISOString();
            if (typeof tsField === 'string') {
                 try { 
                    const parsed = parseISO(tsField);
                    if (isValid(parsed)) return parsed.toISOString();
                 } catch {/* ignore */}
                 try {
                    const directParsed = new Date(tsField);
                    if (isValid(directParsed)) return directParsed.toISOString();
                 } catch {/* ignore */}
                 return tsField; 
            }
            if (tsField && typeof tsField.seconds === 'number' && typeof tsField.nanoseconds === 'number') {
                return new Timestamp(tsField.seconds, tsField.nanoseconds).toDate().toISOString();
            }
            return undefined;
          };

          const parseNumeric = (value: any): number | undefined => {
            if (value === undefined || value === null || String(value).trim() === '') return undefined;
            if (typeof value === 'number' && !isNaN(value)) return value;
            if (typeof value === 'string') {
              const cleanedValue = value.replace(/[^0-9.-]+/g, "");
              if (cleanedValue === '') return undefined;
              const parsed = parseFloat(cleanedValue);
              return isNaN(parsed) ? undefined : parsed;
            }
            return undefined;
          };

          setPurchase({
            id: purchaseDocSnap.id,
            itemName: String(rawData.itemName || rawData.name || rawData.Item || ''),
            itemSku: String(rawData.itemSku || rawData.sku || rawData.SKU || ''),
            itemCost: parseNumeric(rawData.itemCost || rawData.totalAmount || rawData.Cost || rawData.costPerUnit),
            vendorName: String(rawData.vendorName || rawData.Vendor || ''),
            purchaseDate: convertTimestamp(rawData.purchaseDate || rawData.Date),
            itemQuantity: parseNumeric(rawData.itemQuantity || rawData.quantity || rawData.Quantity),
            notes: String(rawData.notes || rawData.Notes || ''),
            tags: rawData.tags || rawData.Tags,
            productType: String(rawData.productType || rawData.Product_Type || ''),
            receiptUrl: String(rawData.receiptUrl || rawData.Receipt_URL || ''),
            person: String(rawData.person || rawData.Person || ''),
            balance: parseNumeric(rawData.balance || rawData.Balance),
            createdAt: convertTimestamp(rawData.createdAt),
            updatedAt: convertTimestamp(rawData.updatedAt),
          } as SimplePurchase);
        } else {
          setError('Purchase record not found.');
        }
      } catch (err: any) {
        console.error("Error fetching purchase:", err);
        setError(`Failed to load purchase details: ${err.message}`);
      }
      setLoading(false);
    }

    fetchPurchase();
  }, [purchaseId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-3 mt-3 text-lg text-muted-foreground">Loading Purchase Details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-background min-h-screen">
        <button
          onClick={() => router.push('/purchases')}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border hover:bg-muted transition mb-4"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-destructive shadow-md">
          <div className="font-semibold text-lg mb-2">Error</div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="p-8 bg-background min-h-screen">
        <button
          onClick={() => router.push('/purchases')}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border hover:bg-muted transition mb-4"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <p className="text-center text-muted-foreground py-16 text-lg">Purchase data could not be loaded.</p>
      </div>
    );
  }

  const detailsList = [
    { label: 'Item Name', value: purchase.itemName, icon: ShoppingCart },
    { label: 'SKU', value: purchase.itemSku, icon: Hash },
    { label: 'Quantity', value: purchase.itemQuantity?.toString(), icon: Package },
    { label: 'Item Cost', value: formatCurrency(purchase.itemCost), icon: DollarSign },
    { label: 'Balance', value: formatCurrency(purchase.balance), icon: DollarSign, highlight: purchase.balance && purchase.balance > 0 ? 'text-destructive' : undefined },
    { label: 'Vendor', value: purchase.vendorName, icon: Info },
    { label: 'Purchase Date', value: safeFormatDate(purchase.purchaseDate), icon: CalendarDays },
    { label: 'Product Type', value: purchase.productType, icon: Info },
    { label: 'Tags', value: formatTagsForDisplay(purchase.tags), icon: Tag },
    { label: 'Person/Buyer', value: purchase.person, icon: User },
    { label: 'Record Created', value: safeFormatDate(purchase.createdAt), icon: CalendarDays },
    { label: 'Last Updated', value: safeFormatDate(purchase.updatedAt), icon: CalendarDays },
  ];


  return (
    <div className="p-4 md:p-8 bg-background min-h-screen">
      <div className="flex items-center gap-3 md:gap-4 mb-6">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full border-border hover:bg-muted flex-shrink-0"
          onClick={() => router.push('/purchases')}
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
          <span className="sr-only">Back to Purchases</span>
        </Button>
        <h1 className="text-xl md:text-2xl font-semibold text-foreground flex-1 truncate min-w-0 break-words">
          Purchase: {purchase.itemName || purchase.itemSku || 'Details'}
        </h1>
        <Button
          variant="outline"
          className="rounded-full border-border hover:bg-muted text-foreground font-medium flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Edit purchase functionality to be implemented.')}
        >
          <Edit className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          className="rounded-full font-medium flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Delete purchase functionality to be implemented.')}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Delete
        </Button>
      </div>

      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Purchase Details</CardTitle>
          <CardDescription>Full information for this purchase record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            {detailsList.map(detail => (
              (detail.value && String(detail.value).trim() !== '' && String(detail.value).trim() !== 'N/A') ? (
                <div key={detail.label} className="flex items-start min-w-0">
                  <detail.icon className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                  <strong className="text-foreground font-medium whitespace-nowrap mr-1 flex-shrink-0">{detail.label}:&nbsp;</strong>
                  <span className={cn("text-muted-foreground break-words min-w-0 flex-1", detail.highlight)}>{String(detail.value)}</span>
                </div>
              ) : null
            ))}
          </div>
          
          {purchase.receiptUrl && (
            <>
              <Separator />
              <div className="flex items-center">
                <LinkIcon className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                <strong className="text-foreground font-medium whitespace-nowrap mr-1">Receipt:&nbsp;</strong>
                <Button variant="link" asChild className="p-0 h-auto text-sm">
                  <a href={purchase.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                     View Receipt
                  </a>
                </Button>
              </div>
            </>
          )}

          {purchase.notes && (
            <>
              <Separator />
              <div>
                <div className="flex items-center mb-1.5">
                    <FileText className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                    <strong className="text-foreground font-medium">Notes:</strong>
                </div>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {purchase.notes}
                </p>
              </div>
            </>
          )}

          <Separator />
           <div className="flex items-start min-w-0 text-sm">
            <Hash className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
            <strong className="text-foreground font-medium whitespace-nowrap mr-1">Record ID:&nbsp;</strong>
            <span className="text-muted-foreground break-all min-w-0">{purchase.id}</span>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

