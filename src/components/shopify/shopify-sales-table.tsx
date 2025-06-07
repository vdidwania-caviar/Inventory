
'use client';

import { useState, useMemo } from 'react';
import type { ShopifyOrderCacheItem, ShopifyTransaction } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, FileText, Loader2, AlertTriangle, ShoppingBag, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { format, parseISO, isValid } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ShopifySalesTableProps {
  orders: ShopifyOrderCacheItem[];
  isLoading: boolean;
  error: string | null;
}

function safeFormatDate(dateString?: string | null): string {
  if (!dateString) return 'N/A';
  try {
    const date = parseISO(dateString);
    return isValid(date) ? format(date, 'PPpp') : 'Invalid Date'; // e.g., Jul 20, 2024, 2:30 PM
  } catch {
    return 'Date Error';
  }
}

function formatShopifyMoney(moneySet?: { shopMoney: { amount: string, currencyCode: string } } | null ): string {
  if (!moneySet || !moneySet.shopMoney) return 'N/A';
  const amount = parseFloat(moneySet.shopMoney.amount);
  return isNaN(amount) ? 'N/A' : `$${amount.toFixed(2)} ${moneySet.shopMoney.currencyCode}`;
}

type SortKey = 'name' | 'createdAt' | 'totalPriceSet';
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}


export function ShopifySalesTable({ orders, isLoading, error: parentError }: ShopifySalesTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ShopifyOrderCacheItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'createdAt', direction: 'descending' });


  const filteredOrders = useMemo(() => {
    return (orders || []).filter(order => {
        const term = searchTerm.toLowerCase();
        return (
            order.name?.toLowerCase().includes(term) ||
            order.email?.toLowerCase().includes(term) ||
            order.customer?.firstName?.toLowerCase().includes(term) ||
            order.customer?.lastName?.toLowerCase().includes(term) ||
            order.displayFinancialStatus?.toLowerCase().includes(term) ||
            order.displayFulfillmentStatus?.toLowerCase().includes(term) ||
            (order.lineItems?.edges?.some(li => li.node.title.toLowerCase().includes(term) || li.node.sku?.toLowerCase().includes(term)))
        );
    });
  }, [orders, searchTerm]);

  const sortedOrders = useMemo(() => {
    let sortableItems = [...filteredOrders];
    if (sortConfig) {
      sortableItems.sort((a, b) => {
        let valA: any;
        let valB: any;

        if (sortConfig.key === 'totalPriceSet') {
          valA = parseFloat(a.totalPriceSet.shopMoney.amount);
          valB = parseFloat(b.totalPriceSet.shopMoney.amount);
        } else {
          valA = a[sortConfig.key];
          valB = b[sortConfig.key];
        }
        
        if (valA === undefined || valA === null) valA = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (valB === undefined || valB === null) valB = sortConfig.direction === 'ascending' ? Infinity : -Infinity;


        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredOrders, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortConfig?.key !== key) return <ChevronDown className="h-3 w-3 opacity-30 group-hover:opacity-100" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />;
  };


  const handleViewDetails = (order: ShopifyOrderCacheItem) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading Shopify orders...</p>
      </div>
    );
  }

  if (parentError && (!orders || orders.length === 0)) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Shopify Orders</AlertTitle>
        <AlertDescription>{parentError}</AlertDescription>
      </Alert>
    );
  }
  
  if (!isLoading && !parentError && (!orders || orders.length === 0)) {
     return (
      <div className="text-center py-10 text-muted-foreground">
        <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Shopify Orders Found in Cache</h3>
        <p className="mt-1">The local cache of Shopify orders is currently empty.</p>
        <p>Try refreshing the cache from the Shopify Sales page.</p>
      </div>
    );
  }
  
  const colSpan = 7; // Order #, Date, Customer, Payment, Fulfillment, Total, Actions

  return (
    <div className="space-y-4">
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
                placeholder="Search Orders (e.g., Order #, Customer, Email, Status, Item...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-xl pl-10 pr-4 py-2 border-input rounded-full focus:ring-primary focus:border-primary"
            />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="min-w-full divide-y divide-border">
            <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer group" onClick={() => requestSort('name')}>
                <div className="flex items-center">Order # {getSortIndicator('name')}</div>
              </TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer group" onClick={() => requestSort('createdAt')}>
                <div className="flex items-center">Date {getSortIndicator('createdAt')}</div>
              </TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fulfillment</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer group" onClick={() => requestSort('totalPriceSet')}>
                 <div className="flex items-center justify-end">Total {getSortIndicator('totalPriceSet')}</div>
              </TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody className="bg-background divide-y divide-border">
            {sortedOrders.length > 0 ? sortedOrders.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm font-medium text-primary hover:underline cursor-pointer" onClick={() => handleViewDetails(order)}>{order.name}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{safeFormatDate(order.createdAt)}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    {order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || order.email || 'N/A' : order.email || 'N/A'}
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm">
                    <Badge variant={order.displayFinancialStatus === 'PAID' ? 'default' : order.displayFinancialStatus === 'PENDING' ? 'secondary' : 'outline'}>
                    {order.displayFinancialStatus || 'N/A'}
                    </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm">
                    <Badge variant={order.displayFulfillmentStatus === 'FULFILLED' ? 'default' : order.displayFulfillmentStatus === 'UNFULFILLED' ? 'secondary' : 'outline'}>
                    {order.displayFulfillmentStatus || 'N/A'}
                    </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground text-right">{formatShopifyMoney(order.totalPriceSet)}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground text-right">
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleViewDetails(order)}>
                        <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => alert(`Create Invoice for ${order.name} (to be implemented)`)}>
                        <FileText className="mr-2 h-4 w-4" /> Create Invoice
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
                </TableRow>
            )) : (
                 <TableRow>
                    <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
                        {orders.length === 0 ? "No Shopify orders found in cache." : "No orders match your search."}
                    </TableCell>
                </TableRow>
            )}
            </TableBody>
        </Table>
      </div>
      {selectedOrder && (
        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order Details: {selectedOrder.name}</DialogTitle>
              <DialogDescription>
                Full details for Shopify Order {selectedOrder.name}, created at {safeFormatDate(selectedOrder.createdAt)}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                <div><strong>Financial Status:</strong> <Badge variant={selectedOrder.displayFinancialStatus === 'PAID' ? 'default' : 'secondary'}>{selectedOrder.displayFinancialStatus}</Badge></div>
                <div><strong>Fulfillment Status:</strong> <Badge variant={selectedOrder.displayFulfillmentStatus === 'FULFILLED' ? 'default' : 'secondary'}>{selectedOrder.displayFulfillmentStatus}</Badge></div>
                <div><strong>Total:</strong> {formatShopifyMoney(selectedOrder.totalPriceSet)}</div>
                <div><strong>Subtotal:</strong> {formatShopifyMoney(selectedOrder.subtotalPriceSet)}</div>
                <div><strong>Shipping:</strong> {formatShopifyMoney(selectedOrder.totalShippingPriceSet)}</div>
                <div><strong>Tax:</strong> {formatShopifyMoney(selectedOrder.totalTaxSet)}</div>
                <div><strong>Discounts:</strong> {formatShopifyMoney(selectedOrder.totalDiscountsSet)}</div>
                <div><strong>Refunded:</strong> {formatShopifyMoney(selectedOrder.totalRefundedSet)}</div>
                <div><strong>Email:</strong> {selectedOrder.email || 'N/A'}</div>
                <div><strong>Phone:</strong> {selectedOrder.phone || 'N/A'}</div>
                {selectedOrder.poNumber && <div><strong>PO Number:</strong> {selectedOrder.poNumber}</div>}
              </div>
              {selectedOrder.customer && (
                <>
                  <h4 className="font-semibold mt-2">Customer</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div><strong>Name:</strong> {`${selectedOrder.customer.firstName || ''} ${selectedOrder.customer.lastName || ''}`.trim()}</div>
                    <div><strong>Email:</strong> {selectedOrder.customer.email || 'N/A'}</div>
                    <div><strong>Phone:</strong> {selectedOrder.customer.phone || 'N/A'}</div>
                  </div>
                </>
              )}
               {selectedOrder.note && <div className="mt-2"><strong>Notes:</strong> <p className="whitespace-pre-wrap bg-muted/50 p-2 rounded-md">{selectedOrder.note}</p></div>}
               {selectedOrder.tags && selectedOrder.tags.length > 0 && <div className="mt-2"><strong>Tags:</strong> {selectedOrder.tags.map(tag => <Badge key={tag} variant="secondary" className="mr-1">{tag}</Badge>)}</div>}

              <h4 className="font-semibold mt-4 mb-1">Line Items ({selectedOrder.lineItems?.edges?.length || 0})</h4>
              <div className="border rounded-md max-h-60 overflow-y-auto">
                <Table className="text-xs">
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-center">Qty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {selectedOrder.lineItems?.edges?.map(itemEdge => (
                      <TableRow key={itemEdge.node.id}>
                        <TableCell className="font-medium">{itemEdge.node.title}{itemEdge.node.variantTitle ? ` (${itemEdge.node.variantTitle})` : ''}<br/><span className="text-muted-foreground text-xs">{itemEdge.node.vendor || ''}</span></TableCell>
                        <TableCell>{itemEdge.node.sku || 'N/A'}</TableCell>
                        <TableCell className="text-center">{itemEdge.node.quantity}</TableCell>
                        <TableCell className="text-right">{formatShopifyMoney(itemEdge.node.discountedTotalSet || itemEdge.node.originalTotalSet)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {selectedOrder.transactions && selectedOrder.transactions.length > 0 && (
                <>
                <h4 className="font-semibold mt-4 mb-1">Transactions ({selectedOrder.transactions.length})</h4>
                 <div className="border rounded-md max-h-48 overflow-y-auto">
                    <Table className="text-xs">
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Kind</TableHead><TableHead>Status</TableHead><TableHead>Gateway</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {selectedOrder.transactions.map((transaction: ShopifyTransaction) => (
                        <TableRow key={transaction.id}>
                            <TableCell>{safeFormatDate(transaction.processedAt)}</TableCell>
                            <TableCell>{transaction.kind}</TableCell>
                            <TableCell><Badge variant={transaction.status === 'SUCCESS' ? 'default' : transaction.status === 'PENDING' ? 'secondary' : 'destructive'}>{transaction.status}</Badge></TableCell>
                            <TableCell>{transaction.gateway}</TableCell>
                            <TableCell className="text-right">{formatShopifyMoney(transaction.amountSet)}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </div>
                </>
              )}

            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

