'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase'; // Your initialized client Firestore
import { collection, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, DatabaseZap } from 'lucide-react';

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  items: any[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  invoiceStatus: string;
  totalAllocatedPayment: number;
  totalBalance: number;
  // ... any other fields
}

export function PushInvoicesButton({ invoices }: { invoices: InvoiceData[] }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function pushToFirestore() {
    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;
    for (const invoice of invoices) {
      try {
        await setDoc(
          doc(collection(db, 'invoices'), invoice.invoiceNumber),
          {
            ...invoice,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        successCount++;
      } catch (e) {
        errorCount++;
        console.error('Failed to push invoice', invoice.invoiceNumber, e);
      }
    }
    setResult(`Invoices pushed: ${successCount}, Errors: ${errorCount}`);
    setIsLoading(false);
  }

  return (
    <div className="mb-4">
      <Button variant="destructive" disabled={isLoading} onClick={pushToFirestore}>
        {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseZap className="h-4 w-4 mr-2" />}
        Push All Invoices to Firestore
      </Button>
      {result && <div className="mt-2 text-sm">{result}</div>}
    </div>
  );
}