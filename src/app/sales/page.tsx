
import { SalesTable } from '@/components/sales/sales-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, PlusCircle, ShoppingCart } from 'lucide-react';

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight text-[#24282F]">Sales Data</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium text-sm px-4 py-2 h-auto">
            <Download className="mr-2 h-4 w-4" /> Export Sales
          </Button>
          <Button variant="outline" className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium text-sm px-4 py-2 h-auto">
            <Upload className="mr-2 h-4 w-4" /> Sync with Shopify
          </Button>
           <Button className="rounded-full bg-[#7EC8E3] text-white font-medium hover:bg-[#6AB9D2] transition text-sm px-4 py-2 h-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Sale
          </Button>
        </div>
      </div>
      
      {/* AI Sales Insights Form removed from here */}

      <Card className="shadow-lg rounded-2xl">
        <CardHeader className="p-6 md:p-8">
          <CardTitle className="font-headline text-xl text-[#24282F] flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Sales Transactions
            </CardTitle>
          <CardDescription className="text-[#5E606A]">Detailed list of all sales transactions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-2 lg:p-4">
          <SalesTable />
        </CardContent>
      </Card>
    </div>
  );
}
