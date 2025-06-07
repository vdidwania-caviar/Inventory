
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CustomerDetails } from '@/components/customers/customer-details';
import { getSalesByCustomerId } from '@/lib/customers-data';
import { useAuth } from '@/hooks/use-auth';
import type { Customer, Sale } from '@/lib/types';
import { Loader2, AlertTriangle, UserX, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string; // This is the customer_ID, e.g., "C0001"
  const { user, loading: authLoading } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setLoading(false);
      setError("You must be logged in to view this page.");
      return;
    }
    if (!customerId) {
        setLoading(false);
        setError("Customer ID is missing from the URL.");
        return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const salesData = await getSalesByCustomerId(customerId);

        if (salesData.length === 0) {
            setError(`No sales history found for customer with ID: ${customerId}. Please check if sales records exist with a 'customerId' or 'customer_ID' field matching this ID.`);
            setLoading(false);
            return;
        }

        // Create the customer profile directly from the first sales record.
        const firstSale = salesData[0];
        const constructedCustomer: Customer = {
            id: customerId, // Use the ID from the URL/sales data
            name: firstSale.Customer || 'Unknown Customer',
            email: firstSale.email || '', // Assuming email might be in sales data
            CustomerID: firstSale.customer_ID || firstSale.customerId,
        };
        
        setCustomer(constructedCustomer);
        setSales(salesData);

      } catch (err: any) {
        console.error("Error fetching customer details:", err);
        if (err.code === 'permission-denied') {
            setError("Permission Denied. You do not have access to this data.");
        } else {
            setError(`Failed to load sales data. The database returned an error: ${err.message}`);
        }
      }
      setLoading(false);
    }

    fetchData();
  }, [customerId, user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading Customer Sales History...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.push('/customers')} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
        </Button>
        <Alert variant="destructive" className="my-4">
          <UserX className="h-4 w-4" />
          <AlertTitle>Could Not Load Customer Details</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!customer) {
      return (
         <div className="space-y-4">
            <Button variant="outline" onClick={() => router.push('/customers')} className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
            </Button>
            <p>Customer data could not be loaded.</p>
         </div>
      );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.push('/customers')} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Button>
      <CustomerDetails customer={customer} sales={sales} />
    </div>
  );
}
