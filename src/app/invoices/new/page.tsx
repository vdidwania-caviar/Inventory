
import { AddInvoiceForm } from '@/components/invoices/add-invoice-form';

export default function AddNewInvoicePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline tracking-tight">Create New Invoice</h1>
      <AddInvoiceForm />
    </div>
  );
}
