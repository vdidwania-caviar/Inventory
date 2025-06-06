'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Building } from 'lucide-react';
import { VendorsTable } from '@/components/vendors/vendors-table';

export default function VendorsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Vendors</h1>
        <div className="flex gap-2">
          <Button onClick={() => alert('Add Vendor functionality (e.g., open dialog or navigate to /vendors/new) to be implemented.')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Vendor
          </Button>
        </div>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Building className="h-6 w-6 text-primary" />
            Vendor Management
          </CardTitle>
          <CardDescription>
            View and manage your supplier and vendor information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VendorsTable />
        </CardContent>
      </Card>
    </div>
  );
}
