
'use client';

import { useEffect, useState, useMemo } from 'react';
import type { SimplePurchase } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Loader2, AlertTriangle, ShoppingBagIcon, LinkIcon, ArrowUpDown } from 'lucide-react';
import { format, parseISO, isValid, parse } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, query, orderBy as firestoreOrderBy, getDocs, Timestamp } from 'firebase/firestore'; // Renamed to avoid conflict
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Helper: Safely format dates, returns empty string if invalid
function safeFormatDate(dateInput?: string | { seconds: number; nanoseconds: number } | Timestamp): string {
  if (!dateInput) return '';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      let parsedDate = new Date(dateInput); 
      if (!isValid(parsedDate) || dateInput.includes(' at ') || (dateInput.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/) && !dateInput.includes('-'))) {
         if (dateInput.includes(' at ') && dateInput.includes('UTC')) {
             parsedDate = new Date(dateInput);
         } else if (dateInput.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
            parsedDate = parse(dateInput, 'P', new Date()); 
            if (!isValid(parsedDate)) { 
                 const parts = dateInput.split('/');
                 if (parts.length === 3) {
                    const year = parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2]);
                    parsedDate = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
                 }
            }
         } else {
            parsedDate = parseISO(dateInput);
         }
      }
      if (!isValid(parsedDate)) {
        console.warn("safeFormatDate: Invalid date string provided after attempts", dateInput);
        return '';
      }
      dateToFormat = parsedDate;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
      dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds || 0).toDate();
    } else {
      console.warn("safeFormatDate: Unhandled dateInput type", dateInput);
      return '';
    }

    if (!isValid(dateToFormat)) {
      console.warn("safeFormatDate: Resulting date is invalid", dateToFormat);
      return '';
    }
    return format(dateToFormat, 'PP'); 
  } catch (error) {
    console.error("Error formatting date in safeFormatDate:", dateInput, error);
    return '';
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

type SortKey = 'itemSku' | 'purchaseDate';
type SortDirection = 'ascending' | 'descending';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function PurchasesTable() {
  const [purchases, setPurchases] = useState<SimplePurchase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'purchaseDate', direction: 'descending' });
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      const collectionName = 'purchases';
      try {
        // Initial fetch order, will be re-sorted client-side if user clicks headers
        const q = query(collection(db, collectionName), firestoreOrderBy('purchaseDate', 'desc')); 

        const querySnapshot = await getDocs(q);
        
        const fetchedPurchases: SimplePurchase[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          let docPurchaseDate: string | undefined;
          const rawDate = data.purchaseDate || data.Date; 
          if (rawDate) {
            if (rawDate instanceof Timestamp) {
              docPurchaseDate = rawDate.toDate().toISOString();
            } else if (typeof rawDate === 'string') {
              let parsed;
              if (rawDate.includes(' at ') && rawDate.includes('UTC')) {
                 parsed = new Date(rawDate);
              } else if (rawDate.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
                 parsed = parse(rawDate, 'P', new Date());
                  if (!isValid(parsed)) {
                     const parts = rawDate.split('/');
                     if (parts.length === 3) {
                        const year = parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2]);
                        parsed = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
                     }
                  }
              } else {
                 parsed = parseISO(rawDate);
              }
              if(isValid(parsed)) docPurchaseDate = parsed.toISOString();
            } else if (typeof rawDate === 'object' && rawDate.seconds !== undefined) {
               const tsDate = new Timestamp(rawDate.seconds, rawDate.nanoseconds || 0).toDate();
               if(isValid(tsDate)) docPurchaseDate = tsDate.toISOString();
            }
          }

          const purchaseEntry: SimplePurchase = {
            id: doc.id,
            itemName: String(data.name || data.Item || ''), 
            itemSku: String(data.sku || data.SKU || ''), 
            itemCost: parseNumeric(data.totalAmount || data.Cost || data.costPerUnit),
            vendorName: String(data.vendorName || data.Vendor || ''), 
            purchaseDate: docPurchaseDate,
            itemQuantity: parseNumeric(data.quantity || data.Quantity) ?? undefined,
            notes: String(data.notes || data.Notes || ''), 
            tags: data.tags || data.Tags,
            productType: String(data.productType || data.Product_Type || ''),
            receiptUrl: String(data.receiptUrl || data.Receipt_URL || ''),
            person: String(data.person || data.Person || ''),
            balance: parseNumeric(data.Balance),
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : String(data.createdAt || ''),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt || ''),
          };
          fetchedPurchases.push(purchaseEntry);
        });
        setPurchases(fetchedPurchases);
      } catch (err: any) {
        let userErrorMessage = `Failed to load data from '${collectionName}'. ${err.message}. Check collection name and field names. Ensure a sortable 'purchaseDate' field exists.`;
        if (err.code === 'failed-precondition' && err.message.includes('index')) {
          userErrorMessage += ` This might be due to a missing Firestore index for ordering on 'purchaseDate'. Check the browser console for a link to create it.`;
        } else if (err.code === 'invalid-argument' && err.message.includes('orderBy')) {
           userErrorMessage += ` The field 'purchaseDate' used for ordering might be missing or not sortable in all documents.`;
        }
        setError(userErrorMessage);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p =>
      (p.itemName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.itemSku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.productType?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.itemCost?.toString().toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (p.balance?.toString().toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [purchases, searchTerm]);

  const sortedPurchases = useMemo(() => {
    let sortableItems = [...filteredPurchases];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: string | number | Date | undefined;
        let bValue: string | number | Date | undefined;

        if (sortConfig.key === 'purchaseDate') {
          aValue = a.purchaseDate ? new Date(a.purchaseDate) : new Date(0); // Handle undefined dates
          bValue = b.purchaseDate ? new Date(b.purchaseDate) : new Date(0);
        } else { // itemSku
          aValue = a.itemSku?.toLowerCase() || '';
          bValue = b.itemSku?.toLowerCase() || '';
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredPurchases, sortConfig]);


  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30 group-hover:opacity-100" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <ArrowUpDown className="ml-2 h-3 w-3 transform rotate-180 text-primary" /> : 
      <ArrowUpDown className="ml-2 h-3 w-3 text-primary" />;
  };

  const handleRowClick = (purchaseId: string) => {
    router.push(`/purchases/${purchaseId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading individual purchases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Purchases</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!loading && !error && purchases.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <ShoppingBagIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Individual Purchases Found</h3>
        <p className="mt-1">Your 'purchases' collection in Firestore is currently empty, or documents could not be processed.</p>
      </div>
    );
  }

  const colSpanFull = 9; 

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by Item Name, SKU, Type, Amount, Balance..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-xl"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item Name</TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-muted/50 group"
              onClick={() => requestSort('itemSku')}
            >
              <div className="flex items-center">
                SKU {getSortIndicator('itemSku')}
              </div>
            </TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Item Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-muted/50 group"
              onClick={() => requestSort('purchaseDate')}
            >
              <div className="flex items-center">
                Purchase Date {getSortIndicator('purchaseDate')}
              </div>
            </TableHead>
            <TableHead>Product Type</TableHead>
            <TableHead>Receipt</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPurchases.length > 0 ? sortedPurchases.map((p) => (
            <TableRow key={p.id} onClick={() => handleRowClick(p.id)} className="cursor-pointer hover:bg-muted/50">
              <TableCell>{p.itemName || ''}</TableCell>
              <TableCell>{p.itemSku || ''}</TableCell>
              <TableCell className="text-center">{p.itemQuantity ?? ''}</TableCell>
              <TableCell className="text-right">
                {typeof p.itemCost === 'number' ? `$${p.itemCost.toFixed(2)}` : ''}
              </TableCell>
              <TableCell className="text-right">
                {typeof p.balance === 'number' ? `$${p.balance.toFixed(2)}` : ''}
              </TableCell>
              <TableCell>{safeFormatDate(p.purchaseDate)}</TableCell>
              <TableCell>{p.productType || ''}</TableCell>
              <TableCell>
                {p.receiptUrl ? (
                  <Button variant="link" size="sm" asChild className="p-0 h-auto" onClick={(e) => e.stopPropagation()}>
                    <Link href={p.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <LinkIcon className="mr-1 h-3 w-3" /> View
                    </Link>
                  </Button>
                ) : ''}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={(e) => {e.stopPropagation(); router.push(`/purchases/${p.id}`)}}>
                      <Eye className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {e.stopPropagation(); alert('Edit Purchase: To be implemented')}}>
                      <Edit className="mr-2 h-4 w-4" /> Edit Purchase
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={(e) => {e.stopPropagation(); alert('Delete Purchase: To be implemented')}}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Purchase
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={colSpanFull} className="text-center text-muted-foreground py-8">
                No individual purchases match your search criteria.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
