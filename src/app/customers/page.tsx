
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Users, Download } from 'lucide-react';
import { CustomersTable } from '@/components/customers/customers-table'; // Import the new table

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight text-[#24282F]">Customers</h1>
        <div className="flex gap-2">
           <Button variant="outline" className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium text-sm px-4 py-2 h-auto">
            <Download className="mr-2 h-4 w-4" /> Export Customers
          </Button>
          <Button className="rounded-full bg-[#7EC8E3] text-white font-medium hover:bg-[#6AB9D2] transition text-sm px-4 py-2 h-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>
      <Card className="shadow-lg rounded-2xl">
        <CardHeader className="p-6 md:p-8">
          <CardTitle className="font-headline text-xl text-[#24282F] flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Customer List
          </CardTitle>
          <CardDescription className="text-[#5E606A]">
            View and manage your customer information.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-2 lg:p-4">
          <CustomersTable />
        </CardContent>
      </Card>
    </div>
  );
}
