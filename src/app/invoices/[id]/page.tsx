'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp, collection, query, where, getDocs as getFirestoreDocs, orderBy } from 'firebase/firestore';
import type { Invoice, InvoiceItem, Payment } from '@/lib/types';
import { InvoiceDetailLineItemsTable } from '@/components/invoices/invoice-detail-line-items-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, ArrowLeft, Edit, FileText, Users, CalendarDays, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { format, parseISO, isValid } from 'date-fns';

function safeFormatDate(dateInput?: string | Timestamp | { seconds: number; nanoseconds: number }): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsed = parseISO(dateInput);
      if (!isValid(parsed)) return 'Invalid Date String';
      dateToFormat = parsed;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
      dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds || 0).toDate();
    } else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'PPP p'); // e.g., Jul 20, 2024, 2:30 PM
  } catch (error) {
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
  return format(dateToFormat, 'PP');
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = typeof params.id === 'string' ? params.id : undefined;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [associatedPayments, setAssociatedPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setError('Invoice ID is missing.');
      setLoading(false);
      return;
    }

    async function fetchInvoiceAndPayments() {
      setLoading(true);
      setError(null);
      setLoadingPayments(true);
      setPaymentsError(null);

      try {
        const invoiceDocRef = doc(db, 'invoices', invoiceId);
        const invoiceDocSnap = await getDoc(invoiceDocRef);

        if (invoiceDocSnap.exists()) {
          const data = invoiceDocSnap.data();
          const currentInvoice: Invoice = {
            id: invoiceDocSnap.id,
            invoiceNumber: String(data.invoiceNumber || ''),
            invoiceDate: data.invoiceDate instanceof Timestamp ? data.invoiceDate.toDate().toISOString() : String(data.invoiceDate || ''),
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : String(data.dueDate || undefined),
            customerId: String(data.customerId || ''),
            customerName: String(data.customerName || ''),
            items: Array.isArray(data.items)
              ? data.items.map((item: any) => ({
                  itemName: String(item.itemName || ''),
                  itemSku: String(item.itemSku || ''),
                  itemQuantity: parseFloat(String(item.itemQuantity || '0')),
                  itemPricePerUnit: parseFloat(String(item.itemPricePerUnit || '0')),
                  lineItemTotal: parseFloat(String(item.lineItemTotal || '0')),
                  itemNotes: String(item.itemNotes || ''),
                }))
              : [],
            subtotal: parseFloat(String(data.subtotal || '0')),
            taxAmount: parseFloat(String(data.taxAmount || '0')),
            totalAmount: parseFloat(String(data.totalAmount || '0')),
            totalAllocatedPayment: parseFloat(String(data.totalAllocatedPayment || '0')),
            totalBalance: parseFloat(String(data.totalBalance || '0')),
            invoiceStatus: String(data.invoiceStatus || 'Draft') as Invoice['invoiceStatus'],
            notes: String(data.notes || ''),
            terms: String(data.terms || ''),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : String(data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt || ''),
          };
          setInvoice(currentInvoice);

          // Fetch payments by invoiceNumber, not by doc id!
          if (currentInvoice.invoiceNumber) {
            const paymentsQuery = query(
              collection(db, 'payments'),
              where('invoiceNumber', '==', currentInvoice.invoiceNumber),
              where('transactionType', '==', 'Sale'),
              orderBy('paymentDate', 'desc')
            );
            const paymentsSnapshot = await getFirestoreDocs(paymentsQuery);
            const fetchedPayments: Payment[] = paymentsSnapshot.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data(),
              paymentDate: (docSnap.data().paymentDate as Timestamp)?.toDate().toISOString(),
              createdAt: (docSnap.data().createdAt as Timestamp)?.toDate().toISOString(),
              updatedAt: (docSnap.data().updatedAt as Timestamp)?.toDate().toISOString(),
            } as Payment));
            setAssociatedPayments(fetchedPayments);
          }

        } else {
          setError('Invoice not found.');
        }
      } catch (err: any) {
        setError(`Failed to load invoice: ${err.message}`);
        setPaymentsError(`Failed to load associated payments: ${err.message}`);
      }
      setLoading(false);
      setLoadingPayments(false);
    }

    fetchInvoiceAndPayments();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading Invoice Details...</p>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push('/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </Button>
        <p className="text-center text-muted-foreground py-10">Invoice not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <Button variant="outline" onClick={() => router.push('/invoices')} className="mb-2 sm:mb-0">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
          </Button>
          <h1 className="text-3xl font-bold font-headline tracking-tight inline-block ml-0 sm:ml-4">
            Invoice: {invoice.invoiceNumber}
          </h1>
        </div>
        <Button variant="default" onClick={() => router.push(`/invoices/${invoiceId}/edit`)}>
          <Edit className="mr-2 h-4 w-4" /> Edit Invoice
        </Button>
      </div>

      {/* Invoice summary */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Invoice Summary</CardTitle>
          <CardDescription>Details for Invoice #{invoice.invoiceNumber}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <div>
            <Users className="inline h-4 w-4 mr-1 text-primary" />
            <strong>Customer:</strong> {invoice.customerName}
          </div>
          <div>
            <CalendarDays className="inline h-4 w-4 mr-1 text-primary" />
            <strong>Invoice Date:</strong> {safeFormatDate(invoice.invoiceDate)}
          </div>
          <div>
            <CalendarDays className="inline h-4 w-4 mr-1 text-primary" />
            <strong>Due Date:</strong> {invoice.dueDate ? safeFormatDate(invoice.dueDate) : 'N/A'}
          </div>
          <div>
            <strong>Status:</strong>{' '}
            <Badge
              variant={
                invoice.invoiceStatus === 'Paid'
                  ? 'default'
                  : invoice.invoiceStatus === 'Void' || invoice.invoiceStatus === 'Overdue'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {invoice.invoiceStatus}
            </Badge>
          </div>
          <div>
            <strong>Subtotal:</strong> {formatCurrency(invoice.subtotal)}
          </div>
          <div>
            <strong>Tax:</strong> {formatCurrency(invoice.taxAmount)}
          </div>
          <div className="font-semibold">
            <strong>Total Amount:</strong> {formatCurrency(invoice.totalAmount)}
          </div>
          <div>
            <strong>Total Paid:</strong> {formatCurrency(invoice.totalAllocatedPayment)}
          </div>
          <div className="font-semibold">
            <strong>Balance Due:</strong> {formatCurrency(invoice.totalBalance)}
          </div>

          {invoice.notes && (
            <div className="md:col-span-full">
              <strong>Notes:</strong>
              <p className="text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div className="md:col-span-full">
              <strong>Terms:</strong>
              <p className="text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p>
            </div>
          )}
          <div className="text-muted-foreground text-xs mt-2">
            <strong>Created:</strong> {safeFormatDate(invoice.createdAt)}
          </div>
          <div className="text-muted-foreground text-xs mt-2">
            <strong>Last Updated:</strong> {safeFormatDate(invoice.updatedAt)}
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Line Items
          </CardTitle>
          <CardDescription>Items included in this invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceDetailLineItemsTable items={invoice.items} />
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Associated Payments
          </CardTitle>
          <CardDescription>Payments recorded for this invoice.</CardDescription>
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
            <p className="text-muted-foreground text-center py-6">No payments found for this invoice.</p>
          )}
          {!loadingPayments && !paymentsError && associatedPayments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Ref. SKU</TableHead>
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