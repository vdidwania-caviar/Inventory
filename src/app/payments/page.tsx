
import { PaymentsListTable } from '@/components/payments/payments-list-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, CreditCard } from 'lucide-react';
import Link from 'next/link';

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Payments</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/payments/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Payment
            </Link>
          </Button>
        </div>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Payment Records
          </CardTitle>
          <CardDescription>
            View and manage all recorded payments for sales and purchases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentsListTable />
        </CardContent>
      </Card>
    </div>
  );
}
