'use client';

import { useEffect, useState } from 'react';
import type { InvoiceItem } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

// ---- Table only ----
interface InvoiceDetailLineItemsTableProps {
  items: InvoiceItem[];
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '';
  return `$${amount.toFixed(2)}`;
}

export function InvoiceDetailLineItemsTable({ items }: InvoiceDetailLineItemsTableProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Line Items</h3>
        <p className="mt-1">This invoice does not have any line items.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-center">Qty</TableHead>
          <TableHead className="text-right">Price/Unit</TableHead>
          <TableHead className="text-right">Line Total</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.id || `invoice-item-${index}`}>
            <TableCell className="font-medium">{item.itemName || ''}</TableCell>
            <TableCell>{item.itemSku || 'N/A'}</TableCell>
            <TableCell className="text-center">{item.itemQuantity || ''}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.itemPricePerUnit)}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.lineItemTotal)}</TableCell>
            <TableCell className="truncate max-w-[200px] hover:max-w-none hover:whitespace-normal">
              {item.itemNotes || 'N/A'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---- Section that fetches data ----
interface InvoiceDetailLineItemsSectionProps {
  invoiceNumber: string; // e.g., 'SH-1074'
}

export function InvoiceDetailLineItemsSection({ invoiceNumber }: InvoiceDetailLineItemsSectionProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLineItems() {
      setLoading(true);
      setError(null);
      try {
        // Assumes your line items are stored in a "sales" collection, one doc per line item,
        // and each doc has an "Invoice" field that matches invoiceNumber
        const q = query(
          collection(db, 'sales'),
          where('Invoice', '==', invoiceNumber),
          orderBy('Date', 'asc')
        );
        const snapshot = await getDocs(q);
        const fetchedItems: InvoiceItem[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            itemName: data.Item || '',
            itemSku: data.SKU || '',
            itemQuantity: typeof data.Quantity === 'number' ? data.Quantity : Number(data.Quantity) || 1,
            itemPricePerUnit: typeof data.Price === 'number' ? data.Price : Number(data.Price) || 0,
            lineItemTotal: (typeof data.Price === 'number' ? data.Price : Number(data.Price) || 0) * (typeof data.Quantity === 'number' ? data.Quantity : Number(data.Quantity) || 1),
            itemNotes: data.Notes || '',
          };
        });
        setItems(fetchedItems);
      } catch (err: any) {
        setError(err.message || 'Failed to load line items');
      }
      setLoading(false);
    }
    fetchLineItems();
  }, [invoiceNumber]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <FileText className="h-6 w-6 mr-2 animate-pulse" />
        Loading line items...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        <FileText className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h3 className="text-xl font-semibold">Error Loading Line Items</h3>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  return <InvoiceDetailLineItemsTable items={items} />;
}