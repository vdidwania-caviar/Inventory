
'use client';

import { useEffect, useState } from 'react';
import type { PurchaseOrder } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Loader2, AlertTriangle, TruckIcon } from 'lucide-react';
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

export function PurchaseOrdersListTable() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      const collectionName = 'purchaseOrders';
      try {
        const q = query(collection(db, collectionName), orderBy('purchaseDate', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const pos: PurchaseOrder[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          let docPurchaseDateISO: string | undefined;
          if (data.purchaseDate) {
            if (data.purchaseDate instanceof Timestamp) {
              docPurchaseDateISO = data.purchaseDate.toDate().toISOString();
            } else if (typeof data.purchaseDate === 'string') {
                const parsed = parseISO(data.purchaseDate);
                if(isValid(parsed)) docPurchaseDateISO = parsed.toISOString();
            } else if (typeof data.purchaseDate === 'object' && (data.purchaseDate as any).seconds !== undefined) {
                const tsDate = new Timestamp((data.purchaseDate as any).seconds, (data.purchaseDate as any).nanoseconds || 0).toDate();
                if(isValid(tsDate)) docPurchaseDateISO = tsDate.toISOString();
            }
          }

          let createdAtISO: string | undefined;
          if (data.createdAt instanceof Timestamp) createdAtISO = data.createdAt.toDate().toISOString();
          else if (typeof data.createdAt === 'string') createdAtISO = data.createdAt;


          let updatedAtISO: string | undefined;
          if (data.updatedAt instanceof Timestamp) updatedAtISO = data.updatedAt.toDate().toISOString();
          else if (typeof data.updatedAt === 'string') updatedAtISO = data.updatedAt;


          pos.push({
            id: doc.id,
            poNumber: String(data.poNumber || ''),
            purchaseDate: docPurchaseDateISO || '',
            vendorName: String(data.vendorName || ''),
            vendorId: String(data.vendorId || ''),
            items: Array.isArray(data.items) ? data.items.map((item: any) => ({
                itemName: String(item.itemName || ''),
                itemSku: String(item.itemSku || ''),
                itemQuantity: parseNumeric(item.itemQuantity) ?? 0,
                itemCostPerUnit: parseNumeric(item.itemCostPerUnit) ?? 0,
                lineItemTotal: parseNumeric(item.lineItemTotal) ?? ((parseNumeric(item.itemQuantity) ?? 0) * (parseNumeric(item.itemCostPerUnit) ?? 0)),
                itemAllocatedPayment: parseNumeric(item.itemAllocatedPayment) ?? 0,
                itemBalance: parseNumeric(item.itemBalance) ?? (((parseNumeric(item.itemQuantity) ?? 0) * (parseNumeric(item.itemCostPerUnit) ?? 0)) - (parseNumeric(item.itemAllocatedPayment) ?? 0)),
                itemPurchaseType: String(item.itemPurchaseType || 'Unknown') as any,
                itemStatus: String(item.itemStatus || 'Pending') as any,
                itemNotes: String(item.itemNotes || ''),
            })) : [],
            totalOrderAmount: parseNumeric(data.totalOrderAmount) ?? 0,
            totalAllocatedPayment: parseNumeric(data.totalAllocatedPayment) ?? 0,
            totalOrderBalance: parseNumeric(data.totalOrderBalance) ?? 0,
            poStatus: String(data.poStatus || 'Draft') as any,
            notes: String(data.notes || ''),
            receiptUrls: Array.isArray(data.receiptUrls) ? data.receiptUrls : (typeof data.receiptUrls === 'string' ? data.receiptUrls.split(',').map((s:string) => s.trim()).filter(Boolean) : []),
            tags: Array.isArray(data.tags) ? data.tags : [],
            createdAt: createdAtISO || new Date().toISOString(),
            updatedAt: updatedAtISO || new Date().toISOString(),
          });
        });
        setPurchaseOrders(pos);
      } catch (err: any)
       {
        console.error("Error fetching purchase orders list:", err);
        let userErrorMessage = `Failed to load purchase orders. ${err.message}. Check collection name ('purchaseOrders'), field names, and data structure.`;
        if (err.code === 'failed-precondition' && err.message.includes('index')) {
          userErrorMessage += ` This might be due to a missing Firestore index for ordering on 'purchaseDate'. Check the browser console for a link to create it.`;
        }
        setError(userErrorMessage);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredPOs = purchaseOrders.filter(po =>
    (po.poNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (po.vendorName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (po.poStatus?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (po.notes?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading purchase orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Purchase Orders</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!loading && !error && purchaseOrders.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <TruckIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Purchase Orders Found</h3>
        <p className="mt-1">Your 'purchaseOrders' collection in Firestore is currently empty.</p>
        <p>You can add new purchase orders using the button above.</p>
      </div>
    );
  }
  
  const colSpanFull = 7;

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by PO#, Vendor, Status, Notes..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-xl"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO Number</TableHead>
            <TableHead>PO Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total Amount</TableHead>
            <TableHead className="text-right">Total Balance</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPOs.length > 0 ? filteredPOs.map((po) => (
            <TableRow key={po.id}>
              <TableCell className="font-medium">
                <Link href={`/purchase-orders/${po.id}`} className="text-primary hover:underline">
                  {po.poNumber || ''}
                </Link>
              </TableCell>
              <TableCell>{safeFormatDate(po.purchaseDate)}</TableCell>
              <TableCell>{po.vendorName || ''}</TableCell>
              <TableCell>
                <Badge variant={po.poStatus === 'Draft' ? 'secondary' : po.poStatus === 'Cancelled' ? 'destructive' : 'default'}>
                  {po.poStatus || ''}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {typeof po.totalOrderAmount === 'number' ? `$${po.totalOrderAmount.toFixed(2)}` : ''}
              </TableCell>
              <TableCell className="text-right">
                {typeof po.totalOrderBalance === 'number' ? `$${po.totalOrderBalance.toFixed(2)}` : ''}
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
                       <Link href={`/purchase-orders/${po.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => alert(`Edit PO: ${po.poNumber} (functionality to be implemented)`)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit PO
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => alert(`Delete PO: ${po.poNumber} (functionality to be implemented)`)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete PO
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={colSpanFull} className="text-center text-muted-foreground py-8">
                No purchase orders match your search criteria.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
