
'use client';

import type { PurchaseOrderItem, PurchaseOrderDisplayItem } from '@/lib/types'; // Ensure PurchaseOrderDisplayItem is defined or use PurchaseOrderItem directly
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PackageIcon } from 'lucide-react';

interface PoDetailLineItemsTableProps {
  items: PurchaseOrderItem[];
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '';
  return `$${amount.toFixed(2)}`;
}

export function PoDetailLineItemsTable({ items }: PoDetailLineItemsTableProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <PackageIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Line Items</h3>
        <p className="mt-1">This purchase order does not have any line items.</p>
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
          <TableHead className="text-right">Cost/Unit</TableHead>
          <TableHead className="text-right">Line Total</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Purchase Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.id || `item-${index}`}>
            <TableCell className="font-medium">{item.itemName || ''}</TableCell>
            <TableCell>{item.itemSku || ''}</TableCell>
            <TableCell className="text-center">{item.itemQuantity || ''}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.itemCostPerUnit)}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.lineItemTotal)}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.itemAllocatedPayment)}</TableCell>
            <TableCell className="text-right">{formatCurrency(item.itemBalance)}</TableCell>
            <TableCell>
              <Badge variant={item.itemPurchaseType === 'For Sale' ? 'default' : 'outline'}>
                {item.itemPurchaseType || ''}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={item.itemStatus === 'Received' ? 'default' : item.itemStatus === 'Cancelled' ? 'destructive' : 'secondary'}>
                {item.itemStatus || ''}
              </Badge>
            </TableCell>
            <TableCell className="truncate max-w-[200px] hover:max-w-none hover:whitespace-normal">
              {item.itemNotes || ''}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
