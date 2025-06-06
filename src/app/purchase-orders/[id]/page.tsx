
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp, collection, query, where, getDocs as getFirestoreDocs, orderBy } from 'firebase/firestore';
import type { PurchaseOrder, PurchaseOrderItem, Payment } from '@/lib/types';
import { PoDetailLineItemsTable } from '@/components/purchase-orders/po-detail-line-items-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, ArrowLeft, Edit, FileText, Link as LinkIcon, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function safeFormatDate(dateInput?: string | Timestamp | { seconds: number; nanoseconds: number } ): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return 'Invalid Date String';
      dateToFormat = parsedDate;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
       dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds || 0).toDate();
    }
     else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'PPP p'); // e.g., Jul 20, 2024, 2:30 PM
  } catch (error) {
    console.error("safeFormatDate error:", error, "with input:", dateInput);
    return 'Date Error';
  }
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return `$${amount.toFixed(2)}`;
}

function safeFormatPaymentDate(dateInput?: string | Timestamp): string {
    if (!dateInput) return 'N/A';
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
        dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
        dateToFormat = parseISO(dateInput);
    } else {
        return 'Invalid Date';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date';
    return format(dateToFormat, 'PP'); // e.g. Jul 20, 2024
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const poId = typeof params.id === 'string' ? params.id : undefined;

  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [associatedPayments, setAssociatedPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!poId) {
      setError('Purchase Order ID is missing.');
      setLoading(false);
      return;
    }

    async function fetchPurchaseOrderAndPayments() {
      setLoading(true);
      setError(null);
      setLoadingPayments(true);
      setPaymentsError(null);

      try {
        const poDocRef = doc(db, 'purchaseOrders', poId);
        const poDocSnap = await getDoc(poDocRef);

        if (poDocSnap.exists()) {
          const data = poDocSnap.data();
          const purchaseDate = data.purchaseDate instanceof Timestamp ? data.purchaseDate.toDate().toISOString() : String(data.purchaseDate || '');
          const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : String(data.createdAt || '');
          const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt || '');
          
          const currentPO = {
            id: poDocSnap.id,
            poNumber: String(data.poNumber || ''),
            purchaseDate,
            vendorName: String(data.vendorName || ''),
            vendorId: String(data.vendorId || ''),
            items: Array.isArray(data.items) ? data.items.map((item: any) => ({
                itemName: String(item.itemName || ''),
                itemSku: String(item.itemSku || ''),
                itemQuantity: parseFloat(String(item.itemQuantity || '0')),
                itemCostPerUnit: parseFloat(String(item.itemCostPerUnit || '0')),
                lineItemTotal: parseFloat(String(item.lineItemTotal || '0')),
                itemAllocatedPayment: parseFloat(String(item.itemAllocatedPayment || '0')),
                itemBalance: parseFloat(String(item.itemBalance || '0')),
                itemPurchaseType: String(item.itemPurchaseType || 'Unknown') as PurchaseOrderItem['itemPurchaseType'],
                itemStatus: String(item.itemStatus || 'Pending') as PurchaseOrderItem['itemStatus'],
                itemNotes: String(item.itemNotes || ''),
            })) : [],
            totalOrderAmount: parseFloat(String(data.totalOrderAmount || '0')),
            totalAllocatedPayment: parseFloat(String(data.totalAllocatedPayment || '0')),
            totalOrderBalance: parseFloat(String(data.totalOrderBalance || '0')),
            poStatus: String(data.poStatus || 'Draft') as PurchaseOrder['poStatus'],
            notes: String(data.notes || ''),
            receiptUrls: Array.isArray(data.receiptUrls) ? data.receiptUrls.map(String) : (typeof data.receiptUrls === 'string' ? data.receiptUrls.split(',').map(s => s.trim()).filter(Boolean) : []),
            tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
            createdAt,
            updatedAt,
          };
          setPurchaseOrder(currentPO);

          // Fetch associated payments
          if (currentPO.poNumber) {
            const paymentsQuery = query(
              collection(db, 'payments'),
              where('invoiceNumber', '==', currentPO.poNumber),
              where('transactionType', '==', 'Purchase'),
              orderBy('paymentDate', 'desc')
            );
            const paymentsSnapshot = await getFirestoreDocs(paymentsQuery);
            const fetchedPayments: Payment[] = paymentsSnapshot.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data(),
              paymentDate: (docSnap.data().paymentDate as Timestamp).toDate().toISOString(),
              createdAt: (docSnap.data().createdAt as Timestamp).toDate().toISOString(),
              updatedAt: (docSnap.data().updatedAt as Timestamp).toDate().toISOString(),
            } as Payment));
            setAssociatedPayments(fetchedPayments);
          }

        } else {
          setError('Purchase Order not found.');
        }
      } catch (err: any) {
        console.error('Error fetching purchase order and/or payments:', err);
        setError(`Failed to load purchase order: ${err.message}`);
        setPaymentsError(`Failed to load associated payments: ${err.message}`);
      }
      setLoading(false);
      setLoadingPayments(false);
    }

    fetchPurchaseOrderAndPayments();
  }, [poId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading Purchase Order Details...</p>
      </div>
    );
  }

  if (error && !purchaseOrder) { // Only show main error if PO itself failed to load
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/purchase-orders')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Purchase Orders
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
       <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/purchase-orders')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Purchase Orders
        </Button>
        <p className="text-center text-muted-foreground py-10">Purchase Order not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
            <Button variant="outline" onClick={() => router.push('/purchase-orders')} className="mb-2 sm:mb-0">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
            </Button>
            <h1 className="text-3xl font-bold font-headline tracking-tight inline-block ml-0 sm:ml-4">
                PO Detail: {purchaseOrder.poNumber}
            </h1>
        </div>
        <Button variant="default" onClick={() => router.push(`/purchase-orders/${poId}/edit`)}>
          <Edit className="mr-2 h-4 w-4" /> Edit Purchase Order
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Purchase Order Summary</CardTitle>
          <CardDescription>Details for PO #{purchaseOrder.poNumber}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <div><strong>PO Number:</strong> {purchaseOrder.poNumber}</div>
          <div><strong>Vendor:</strong> {purchaseOrder.vendorName}</div>
          <div><strong>Purchase Date:</strong> {safeFormatDate(purchaseOrder.purchaseDate)}</div>
          <div>
            <strong>Status:</strong> <Badge variant={purchaseOrder.poStatus === 'Draft' ? 'secondary' : purchaseOrder.poStatus === 'Cancelled' ? 'destructive' : 'default'}>{purchaseOrder.poStatus}</Badge>
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <strong>Total Amount:</strong> {formatCurrency(purchaseOrder.totalOrderAmount)}
          </div>
           <div className="md:col-span-2 lg:col-span-1">
            <strong>Total Paid:</strong> {formatCurrency(purchaseOrder.totalAllocatedPayment)}
          </div>
           <div className="md:col-span-2 lg:col-span-1">
            <strong>Total Balance:</strong> {formatCurrency(purchaseOrder.totalOrderBalance)}
          </div>

          {purchaseOrder.notes && (
            <div className="md:col-span-full">
              <strong>Notes:</strong>
              <p className="text-muted-foreground whitespace-pre-wrap">{purchaseOrder.notes}</p>
            </div>
          )}

          {purchaseOrder.receiptUrls && purchaseOrder.receiptUrls.length > 0 && (
            <div className="md:col-span-full">
              <strong>Receipts:</strong>
              <ul className="list-disc list-inside ml-4">
                {purchaseOrder.receiptUrls.map((url, index) => (
                  <li key={index}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center">
                      <LinkIcon className="mr-1 h-4 w-4" /> Receipt Link {index + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
           {purchaseOrder.tags && purchaseOrder.tags.length > 0 && (
            <div className="md:col-span-full">
              <strong>Tags:</strong>
              <div className="flex flex-wrap gap-2 mt-1">
                {purchaseOrder.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="text-muted-foreground text-xs mt-2"><strong>Created:</strong> {safeFormatDate(purchaseOrder.createdAt)}</div>
          <div className="text-muted-foreground text-xs mt-2"><strong>Last Updated:</strong> {safeFormatDate(purchaseOrder.updatedAt)}</div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Line Items
          </CardTitle>
          <CardDescription>Items included in this purchase order.</CardDescription>
        </CardHeader>
        <CardContent>
          <PoDetailLineItemsTable items={purchaseOrder.items} />
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Associated Payments
          </CardTitle>
          <CardDescription>Payments recorded for this purchase order.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPayments && (
            <div className="flex justify-center items-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="ml-2">Loading payments...</p>
            </div>
          )}
          {paymentsError && !loadingPayments && (
             <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Payments</AlertTitle>
              <AlertDescription>{paymentsError}</AlertDescription>
            </Alert>
          )}
          {!loadingPayments && !paymentsError && associatedPayments.length === 0 && (
            <p className="text-muted-foreground text-center py-6">No payments found for this purchase order.</p>
          )}
          {!loadingPayments && !paymentsError && associatedPayments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reference SKU</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {associatedPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{safeFormatPaymentDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.method}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>{payment.referenceSku || 'N/A'}</TableCell>
                    <TableCell className="truncate max-w-xs">{payment.notes || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
