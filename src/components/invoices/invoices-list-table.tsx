
'use client';

import { useEffect, useState } from 'react';
import type { Invoice } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Loader2, AlertTriangle, FileSpreadsheet as FileSpreadsheetIcon } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

function safeFormatDate(dateInput?: string | { seconds: number; nanoseconds: number } | Timestamp): string {
  if (!dateInput) return '';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return '';
      dateToFormat = parsedDate;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
      dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds || 0).toDate();
    } else {
      return '';
    }
    if (!isValid(dateToFormat)) return '';
    return format(dateToFormat, 'PP'); // Format as 'Jul 20, 2024'
  } catch (error) {
    return '';
  }
}

function formatCurrency(amount?: number): string {
    if (typeof amount !== 'number' || isNaN(amount)) return '';
    return `$${amount.toFixed(2)}`;
}

export function InvoicesListTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      const collectionName = 'invoices';
      try {
        const q = query(collection(db, collectionName), orderBy('invoiceDate', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const fetchedInvoices: Invoice[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            invoiceDate: data.invoiceDate instanceof Timestamp ? data.invoiceDate.toDate().toISOString() : String(data.invoiceDate || ''),
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : String(data.dueDate || undefined),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : String(data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt || ''),
          } as Invoice;
        });
        setInvoices(fetchedInvoices);
      } catch (err: any) {
        console.error("Error fetching invoices list:", err);
        let userErrorMessage = `Failed to load invoices. ${err.message}. Check collection name ('invoices'), field names, and data structure.`;
        if (err.code === 'failed-precondition' && err.message.includes('index')) {
          userErrorMessage += ` This might be due to a missing Firestore index for ordering on 'invoiceDate'. Check the browser console for a link to create it.`;
        }
        setError(userErrorMessage);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredInvoices = invoices.filter(inv =>
    (inv.invoiceNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (inv.customerName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
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
        <p className="mt-1">Your 'invoices' collection in Firestore is currently empty.</p>
        <p>You can add new invoices using the button above.</p>
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
            <TableHead>Invoice Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
            <TableHead className="text-right">Balance Due</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredInvoices.length > 0 ? filteredInvoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">
                <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">
                  {inv.invoiceNumber || ''}
                </Link>
              </TableCell>
              <TableCell>{safeFormatDate(inv.invoiceDate)}</TableCell>
              <TableCell>{inv.customerName || ''}</TableCell>
              <TableCell>
                <Badge variant={
                  inv.invoiceStatus === 'Paid' ? 'default' : 
                  inv.invoiceStatus === 'Void' || inv.invoiceStatus === 'Overdue' ? 'destructive' : 
                  'secondary'
                }>
                  {inv.invoiceStatus || ''}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(inv.totalAmount)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(inv.totalBalance)}
              </TableCell>
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
                       <Link href={`/invoices/${inv.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => alert(`Edit Invoice: ${inv.invoiceNumber} (to be implemented)`)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => alert(`Void Invoice: ${inv.invoiceNumber} (to be implemented)`)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Void Invoice
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
