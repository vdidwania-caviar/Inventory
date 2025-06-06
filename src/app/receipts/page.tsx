
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText } from 'lucide-react';

export default function ReceiptsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Receipts</h1>
        <div className="flex gap-2">
          <Button>
            <Upload className="mr-2 h-4 w-4" /> Upload Receipt
          </Button>
        </div>
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Receipt Management
          </CardTitle>
          <CardDescription>
            View, upload, and manage your purchase receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Receipt listing, viewing, and uploading features will be implemented here.</p>
          {/* Placeholder for ReceiptsList component */}
        </CardContent>
      </Card>
    </div>
  );
}
