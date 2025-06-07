import { PushInvoicesButton } from '@/components/invoices/push-invoices-button';
import { InvoicesListTable } from '@/components/invoices/invoices-list-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

export default function InvoicesListPage() {
  return (
    <div className="space-y-6">
      {/* ====== Migration Button at the top ====== */}
      <PushInvoicesButton />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Invoices</h1>
        <div className="flex gap-2">
          {/* <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import Invoices
          </Button> */}
          <Button asChild>
            <Link href="/invoices/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Invoice
            </Link>
          </Button>
        </div>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            All Invoices
          </CardTitle>
          <CardDescription>
            View and manage your customer invoices. Click on an Invoice Number to see its details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoicesListTable />
        </CardContent>
      </Card>
    </div>
  );
}<PushInvoicesButton invoices={yourInvoicesArray} />
