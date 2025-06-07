
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Customer, Sale } from '@/lib/types';
import { format } from 'date-fns';
import { DollarSign, ShoppingBag } from 'lucide-react';

interface CustomerDetailsProps {
  customer: Customer;
  sales: Sale[];
}

export function CustomerDetails({ customer, sales }: CustomerDetailsProps) {
  const getInitials = (name?: string) => {
    if (!name || typeof name !== 'string') {
      return '??';
    }
    const names = name.split(' ');
    if (names.length === 0) {
        return '??';
    }
    return names.map((n) => n[0]).join('').toUpperCase();
  };

  const displayName = customer?.name || 'Unknown Customer';

  const totalSpend = sales.reduce((acc, sale) => acc + (sale.Price || 0), 0);
  const totalItems = sales.reduce((acc, sale) => acc + (sale.Quantity || 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-20 w-20 text-2xl">
            <AvatarImage src={customer?.avatarUrl} alt={displayName} data-ai-hint="person avatar"/>
            <AvatarFallback>{getInitials(customer?.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-3xl font-bold font-headline">{displayName}</CardTitle>
            <CardDescription className="text-lg">{customer?.email || 'No email provided'}</CardDescription>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center">
                <DollarSign className="h-4 w-4 mr-1.5 text-primary" />
                Total Spent: <span className="font-semibold text-foreground ml-1">${totalSpend.toFixed(2)}</span>
              </div>
              <div className="flex items-center">
                <ShoppingBag className="h-4 w-4 mr-1.5 text-primary" />
                Total Items Purchased: <span className="font-semibold text-foreground ml-1">{totalItems}</span>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
          <CardDescription>A complete list of all items purchased by {displayName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length > 0 ? (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{sale.Date ? format(new Date(sale.Date), 'PPP') : 'N/A'}</TableCell>
                    <TableCell>{sale.Item || 'N/A'}</TableCell>
                    <TableCell>{sale.SKU || 'N/A'}</TableCell>
                    <TableCell className="text-right">{sale.Quantity || 0}</TableCell>
                    <TableCell className="text-right">${(sale.Price || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No purchase history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
