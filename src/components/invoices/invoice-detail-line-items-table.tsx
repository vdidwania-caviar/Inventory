
'use client';

import type { InvoiceItem } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText } from 'lucide-react'; // Using FileText as a generic item icon

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
