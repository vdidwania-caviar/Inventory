
import { AddPaymentForm } from '@/components/payments/add-payment-form';

export default function AddNewPaymentPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline tracking-tight">Add New Payment</h1>
      <AddPaymentForm />
    </div>
  );
}
