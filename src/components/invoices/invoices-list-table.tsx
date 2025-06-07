'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Loader2, AlertTriangle, FileSpreadsheet as FileSpreadsheetIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isValid } from 'date-fns';

type SortDirection = 'asc' | 'desc';
type SortConfig = {
  key: string;
  direction: SortDirection;
} | null;


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
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'invoiceDate', direction: 'desc' });
  const router = useRouter();

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
    return Object.values(invoiceMap)
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

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv =>
      (inv.invoiceNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (inv.customer?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (inv.invoiceStatus?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [invoices, searchTerm]);
  
  const sortedInvoices = useMemo(() => {
    let sortableItems = [...filteredInvoices];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Specific date sorting
        if (sortConfig.key === 'invoiceDate') {
          const aDate = new Date(aValue);
          const bDate = new Date(bValue);
          if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        // General sorting
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredInvoices, sortConfig]);

  const requestSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key: string) => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
    }
    return null;
  };

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
          <TableHead>
              <Button variant="ghost" onClick={() => requestSort('invoiceNumber')} className="px-2 py-1">
                Invoice # {getSortIndicator('invoiceNumber')}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('invoiceDate')} className="px-2 py-1">
                Date {getSortIndicator('invoiceDate')}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('customer')} className="px-2 py-1">
                Customer {getSortIndicator('customer')}
              </Button>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedInvoices.length > 0 ? sortedInvoices.map((inv) => (
            <TableRow 
              key={inv.invoiceNumber} 
              onClick={() => router.push(`/invoices/${inv.invoiceNumber}`)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="font-medium text-primary hover:underline">
                  {inv.invoiceNumber}
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
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => router.push(`/invoices/${inv.invoiceNumber}`)}>
                        <Eye className="mr-2 h-4 w-4" /> View Details
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