'use client';

import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Loader2, AlertTriangle, FileSpreadsheet as FileSpreadsheetIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isValid } from 'date-fns';

function safeFormatDate(dateInput?: string | { seconds: number; nanoseconds: number }): string {
  if (!dateInput) return '';
  try {
    let dateToFormat: Date;
    if (typeof dateInput === 'string') {
      const parsed = parseISO(dateInput);
      if (!isValid(parsed)) return '';
      dateToFormat = parsed;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
      dateToFormat = new Date(dateInput.seconds * 1000);
    } else {
      return '';
    }
    if (!isValid(dateToFormat)) return '';
    return format(dateToFormat, 'PP');
  } catch (error) {
    return '';
  }
}
function parseNumeric(value: any): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoicesListTable() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GROUP SALES BY INVOICE
  function groupSalesByInvoice(sales: any[]) {
    const invoiceMap: { [key: string]: any } = {};
    sales.forEach(line => {
      const invNum = line.Invoice;
      if (!invNum) return;
      if (!invoiceMap[invNum]) {
        invoiceMap[invNum] = {
          invoiceNumber: invNum,
          customer: line.Customer,
          invoiceDate: line.Date,
          invoiceStatus: line.State, // or change to line.invoiceStatus if you have that field
          totalAmount: 0,
          lineCount: 0,
        };
      }
      // Use the latest (most recent) date
      if (line.Date && (!invoiceMap[invNum].invoiceDate || line.Date > invoiceMap[invNum].invoiceDate)) {
        invoiceMap[invNum].invoiceDate = line.Date;
      }
      // Overwrite customer if needed (shows the last for each invoice)
      if (line.Customer) invoiceMap[invNum].customer = line.Customer;

      // Add Price or Revenue (choose what you want for the total)
      invoiceMap[invNum].totalAmount += parseNumeric(line.Price) ?? 0;
      invoiceMap[invNum].lineCount++;
    });
    // Return sorted array (newest first)
    return Object.values(invoiceMap).sort((a: any, b: any) => {
      const aDate = a.invoiceDate ? new Date(a.invoiceDate) : new Date(0);
      const bDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date(0);
      return bDate.getTime() - aDate.getTime();
    });
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all sales line items
        const querySnapshot = await getDocs(collection(db, 'sales'));
        const salesLines: any[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        const groupedInvoices = groupSalesByInvoice(salesLines);
        setInvoices(groupedInvoices);
      } catch (err: any) {
        setError('Failed to load invoices. Check Firestore permissions, collection name ("sales"), and data structure.');
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredInvoices = invoices.filter(inv =>
    (inv.invoiceNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (inv.customer?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (inv.invoiceStatus?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading invoices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Invoices</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!loading && !error && invoices.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <FileSpreadsheetIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Invoices Found</h3>
        <p className="mt-1">No sales found in Firestore (sales collection).</p>
        <p>Check your Firestore collection name and permissions.</p>
      </div>
    );
  }

  const colSpanFull = 7;

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by Invoice #, Customer, Status..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-xl"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredInvoices.length > 0 ? filteredInvoices.map((inv) => (
            <TableRow key={inv.invoiceNumber}>
              <TableCell className="font-medium">
                <Link href={`/invoices/${inv.invoiceNumber}`} className="text-primary hover:underline">
                  {inv.invoiceNumber}
                </Link>
              </TableCell>
              <TableCell>{safeFormatDate(inv.invoiceDate)}</TableCell>
              <TableCell>{inv.customer || ''}</TableCell>
              <TableCell>
                <Badge variant={
                  inv.invoiceStatus === 'Paid' ? 'default' : 
                  inv.invoiceStatus === 'Void' || inv.invoiceStatus === 'Overdue' ? 'destructive' : 
                  'secondary'
                }>
                  {inv.invoiceStatus || ''}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatCurrency(inv.totalAmount)}</TableCell>
              <TableCell className="text-right">{inv.lineCount || 1}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href={`/invoices/${inv.invoiceNumber}`}>
                        <Eye className="mr-2 h-4 w-4" /> View Details
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={colSpanFull} className="text-center text-muted-foreground py-8">
                No invoices match your search criteria.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}