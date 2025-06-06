
import { PurchaseOrdersListTable } from '@/components/purchase-orders/purchase-orders-list-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Upload, Truck } from 'lucide-react';
import Link from 'next/link';

export default function PurchaseOrdersListPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Purchase Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import POs
          </Button>
          <Button asChild>
            <Link href="/purchase-orders/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Purchase Order
            </Link>
          </Button>
        </div>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            All Purchase Orders
          </CardTitle>
          <CardDescription>
            View and manage your purchase orders. Click on a PO Number to see its line items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PurchaseOrdersListTable />
        </CardContent>
      </Card>
    </div>
  );
}
