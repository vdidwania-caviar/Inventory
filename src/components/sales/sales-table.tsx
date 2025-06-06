
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // Added useRouter
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FileText, DollarSign, Eye, Loader2, AlertTriangle, ShoppingCartIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import type { Sale } from '@/lib/types';
import { format, isValid, parseISO } from 'date-fns';

function safeFormatDate(dateInput?: string | { seconds: number; nanoseconds: number } | Timestamp): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      dateToFormat = parseISO(dateInput);
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number' && 'nanoseconds' in dateInput && typeof dateInput.nanoseconds === 'number') {
      dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds).toDate();
    } else {
      return 'Invalid Date Obj';
    }
    if (!isValid(dateToFormat)) {
      return 'Invalid Date Val';
    }
    return format(dateToFormat, 'PP'); // Show only date, e.g., Jul 20, 2024
  } catch (error) {
    return 'Date Error';
  }
}

function parseNumeric(value: any): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/[^0-9.-]+/g, "");
    if (cleanedValue === '') return undefined;
    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function safeMoney(val: any): string {
  const n = parseNumeric(val);
  if (typeof n === 'number') {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return '—';
}


export function SalesTable() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(); // Initialized useRouter

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const q = query(collection(db, 'sales'), orderBy('Date', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedSales: Sale[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          let saleDateISO: string | undefined = undefined;
          if (data.Date) {
            if (data.Date instanceof Timestamp) {
              saleDateISO = data.Date.toDate().toISOString();
            } else if (typeof data.Date === 'string') {
              const parsed = new Date(data.Date); // Try to parse various string formats
              if (!isNaN(parsed.getTime())) saleDateISO = parsed.toISOString();
               else { // Fallback to ISO parsing if direct fails
                 try {
                    const isoParsed = parseISO(data.Date);
                    if(isValid(isoParsed)) saleDateISO = isoParsed.toISOString();
                 } catch {}
               }
            } else if (typeof data.Date === 'object' && data.Date.seconds !== undefined && data.Date.nanoseconds !== undefined) {
               const tsDate = new Timestamp(data.Date.seconds, data.Date.nanoseconds || 0).toDate();
               if(!isNaN(tsDate.getTime())) saleDateISO = tsDate.toISOString();
            }
          }

          const saleEntry: Sale = {
            id: doc.id,
            ID: String(data.ID || ''),
            Invoice: String(data.Invoice || doc.id || ''),
            Customer: String(data.Customer || ''),
            customer_ID: String(data.customer_ID || ''),
            Date: saleDateISO,
            Item: String(data.Item || ''),
            SKU: String(data.SKU || ''),
            Quantity: parseNumeric(data.Quantity),
            State: String(data.State || ''),
            Cost: parseNumeric(data.Cost),
            Price: parseNumeric(data.Price),
            Revenue: parseNumeric(data.Revenue),
            Profit: parseNumeric(data.Profit),
            Tax: parseNumeric(data.Tax),
            Taxable: typeof data.Taxable === 'boolean' ? data.Taxable : undefined,
            allocated_payment: parseNumeric(data.allocated_payment || data.Allocated_Payment),
            Balance: parseNumeric(data.Balance),
            customer_type: String(data.customer_type || ''),
            items: data.items && Array.isArray(data.items) ? data.items.map((item: any) => ({
                sku: String(item.sku || ''),
                name: String(item.name || ''),
                quantity: parseNumeric(item.quantity) || 0,
                pricePerUnit: parseNumeric(item.pricePerUnit) || 0,
            })) : [],
          };
          fetchedSales.push(saleEntry);
        });
        setSales(fetchedSales);
      } catch (err: any) {
        setError(`Failed to load sales data. ${err.message}. Check collection name, field names (especially 'Date' for ordering), and security rules. See console for more details.`);
      }
      setLoading(false);
    }
    fetchData();
  }, []);
  
  const filteredSales = sales.filter((sale) =>
    (String(sale.Invoice || sale.id).toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (String(sale.Customer).toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (String(sale.Item).toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (String(sale.SKU).toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const handleRowClick = (saleId: string) => {
    router.push(`/sales/${saleId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sales data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4 mx-4 md:mx-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Sales</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!loading && !error && sales.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground px-4">
        <ShoppingCartIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Sales Data Found</h3>
        <p className="mt-1 text-sm">Your 'sales' collection in Firestore is currently empty or field names/types don't match the expected structure (e.g., 'Date' field for sorting, numeric fields for amounts). Please verify collection name, document structure, and check console logs for errors.</p>
      </div>
    );
  }
  
  const tableColumnCount = 7; // Adjusted for new columns: Invoice, Customer, Date, Item, SKU, Price, Actions

  return (
    <div className="space-y-4 p-0"> {/* Adjusted padding to be handled by parent CardContent */}
      <div className="px-4 md:px-0"> {/* Input padding handled here */}
        <Input
          placeholder="Search by Customer, Item, SKU, Invoice..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-lg"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <Table className="min-w-full divide-y divide-gray-200">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</TableHead>
              {/* Quantity is already part of the Sale type and could be displayed if needed, but removed from main view per request */}
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</TableHead>
              {/* Removed: Allocated Payment, Balance from main view */}
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white divide-y divide-gray-200">
            {filteredSales.length > 0 ? filteredSales.map((sale) => (
              <TableRow 
                key={sale.id} 
                onClick={() => handleRowClick(sale.id)}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{sale.Invoice || 'N/A'}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{sale.Customer || 'N/A'}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{safeFormatDate(sale.Date)}</TableCell>
                <TableCell className="px-4 py-3 whitespace-normal break-words text-sm text-gray-500 max-w-xs">{sale.Item || 'N/A'}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{sale.SKU || 'N/A'}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{safeMoney(sale.Price)}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()} > {/* Stop propagation to prevent row click */}
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/sales/${sale.id}`); }}>
                        <Eye className="mr-2 h-4 w-4" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert('View Invoice: To be implemented'); }}>
                        <FileText className="mr-2 h-4 w-4" /> View Invoice
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert('Process Refund: To be implemented'); }}>
                        <DollarSign className="mr-2 h-4 w-4" /> Process Refund
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={tableColumnCount} className="text-center text-gray-500 py-10">
                  {sales.length === 0 ? (
                     <>
                        <ShoppingCartIcon className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                        <p className="font-semibold text-lg">No Sales Records Found</p>
                        <p className="text-sm">Your sales collection in Firestore might be empty or data is not loading correctly.</p>
                        <p className="text-xs mt-1">Check Firestore data, collection name ('sales'), and security rules.</p>
                    </>
                  ) : (
                    "No sales records match your search criteria."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
