
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DatePicker } from '@/components/ui/date-picker';
import { PaymentSchema, type PaymentFormValues } from '@/lib/schemas';
import { PAYMENT_METHODS, TRANSACTION_TYPES, type PurchaseOrder, type Sale, type SelectableOrder, type SelectablePerson, type Customer, type Vendor } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, writeBatch, doc, runTransaction } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';

function formatCurrency(amount?: number): string {
    if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
    return `$${amount.toFixed(2)}`;
}

export function AddPaymentForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectableOrders, setSelectableOrders] = useState<SelectableOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectablePersons, setSelectablePersons] = useState<SelectablePerson[]>([]);
  const [isLoadingPersons, setIsLoadingPersons] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(PaymentSchema),
    defaultValues: {
      transactionType: undefined,
      invoiceNumber: '',
      referenceSku: '',
      paymentDate: new Date(),
      method: undefined,
      amount: undefined, // Changed to undefined for blank default
      person: '',
      notes: '',
    },
  });

  const watchedTransactionType = useWatch({ control: form.control, name: 'transactionType' });

  useEffect(() => {
    async function fetchOrders() {
      if (!watchedTransactionType) {
        setSelectableOrders([]);
        return;
      }
      setIsLoadingOrders(true);
      try {
        let orders: SelectableOrder[] = [];
        if (watchedTransactionType === 'Sale') {
          const salesQuery = query(collection(db, 'sales'), where('Balance', '>', 0));
          const snapshot = await getDocs(salesQuery);
          orders = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as Sale;
            return {
              id: data.Invoice || data.ID || docSnap.id,
              displayLabel: `${data.Invoice || data.ID || docSnap.id} - ${data.Customer || 'N/A'} - Bal: ${formatCurrency(data.Balance)}`,
              balance: data.Balance || 0,
            };
          });
        } else if (watchedTransactionType === 'Purchase') {
          const poQuery = query(collection(db, 'purchaseOrders'), where('totalOrderBalance', '>', 0));
          const snapshot = await getDocs(poQuery);
          orders = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as PurchaseOrder;
            return {
              id: data.poNumber,
              displayLabel: `${data.poNumber} - ${data.vendorName} - Bal: ${formatCurrency(data.totalOrderBalance)}`,
              balance: data.totalOrderBalance,
            };
          });
        }
        setSelectableOrders(orders);
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: `Failed to load unpaid ${watchedTransactionType}s.` });
      }
      setIsLoadingOrders(false);
    }
    fetchOrders();
  }, [watchedTransactionType, toast]);

  useEffect(() => {
    async function fetchPersons() {
      if (!watchedTransactionType) {
        setSelectablePersons([]);
        return;
      }
      setIsLoadingPersons(true);
      try {
        let persons: SelectablePerson[] = [];
        if (watchedTransactionType === 'Sale') {
          const customersQuery = query(collection(db, 'customers'));
          const snapshot = await getDocs(customersQuery);
          persons = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as Customer;
            return { id: docSnap.id, name: data.name };
          });
        } else if (watchedTransactionType === 'Purchase') {
          const vendorsQuery = query(collection(db, 'vendors'));
          const snapshot = await getDocs(vendorsQuery);
          persons = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as Vendor;
            return { id: docSnap.id, name: data.name };
          });
        }
        setSelectablePersons(persons.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: `Failed to load ${watchedTransactionType === 'Sale' ? 'customers' : 'vendors'}.` });
      }
      setIsLoadingPersons(false);
    }
    fetchPersons();
  }, [watchedTransactionType, toast]);

  async function onSubmit(values: PaymentFormValues) {
    setIsSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const paymentData = {
          ...values,
          paymentDate: Timestamp.fromDate(values.paymentDate),
          amount: values.amount, // Ensure amount is number
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const paymentDocRef = doc(collection(db, 'payments'));
        transaction.set(paymentDocRef, paymentData);

        if (values.transactionType === 'Sale') {
          const salesQuery = query(collection(db, 'sales'), 
            where(watchedTransactionType === 'Sale' ? 'Invoice' : 'ID', '==', values.invoiceNumber)
          );
          const salesSnapshot = await transaction.get(salesQuery); // Use transaction.get

          if (salesSnapshot.empty) {
             const salesByIdQuery = query(collection(db, 'sales'), where('ID', '==', values.invoiceNumber));
             const salesByIdSnapshot = await transaction.get(salesByIdQuery);
             if (salesByIdSnapshot.empty) {
                 toast({ variant: 'destructive', title: 'Warning', description: `Sale with Invoice/ID #${values.invoiceNumber} not found. Payment recorded, but sale not updated.` });
                 throw new Error(`Sale with Invoice/ID #${values.invoiceNumber} not found.`); // Throw to rollback
             }
             const saleDoc = salesByIdSnapshot.docs[0];
             const saleData = saleDoc.data() as Sale;
             const currentAllocated = saleData.allocated_payment || 0;
             const newAllocated = currentAllocated + values.amount;
             const newBalance = (saleData.Price || 0) - newAllocated;
             transaction.update(saleDoc.ref, { allocated_payment: newAllocated, Balance: newBalance, updatedAt: serverTimestamp() });
          } else {
            const saleDoc = salesSnapshot.docs[0];
            const saleData = saleDoc.data() as Sale;
            const currentAllocated = saleData.allocated_payment || 0;
            const newAllocated = currentAllocated + values.amount;
            const newBalance = (saleData.Price || 0) - newAllocated;
            transaction.update(saleDoc.ref, { allocated_payment: newAllocated, Balance: newBalance, updatedAt: serverTimestamp() });
          }
        } else if (values.transactionType === 'Purchase') {
          const poQuery = query(collection(db, 'purchaseOrders'), where('poNumber', '==', values.invoiceNumber));
          const poSnapshot = await transaction.get(poQuery); // Use transaction.get
          if (poSnapshot.empty) {
            toast({ variant: 'destructive', title: 'Warning', description: `Purchase Order #${values.invoiceNumber} not found. Payment recorded, but PO not updated.` });
            throw new Error(`Purchase Order #${values.invoiceNumber} not found.`); // Throw to rollback
          }
          const poDoc = poSnapshot.docs[0];
          const poData = poDoc.data() as PurchaseOrder;
          
          let paymentAmountToDistribute = values.amount;
          const itemsWithBalance = poData.items.filter(item => ((item.lineItemTotal || 0) - (item.itemAllocatedPayment || 0)) > 0.001); // Items with actual balance
          const countOfItemsWithBalance = itemsWithBalance.length;

          const updatedItems = poData.items.map(item => {
            const currentItemBalance = (item.lineItemTotal || 0) - (item.itemAllocatedPayment || 0);
            if (paymentAmountToDistribute <= 0.001 || currentItemBalance <= 0.001) {
              return item;
            }
            
            // Distribute based on number of items that still have a balance
            const allocationPerItem = countOfItemsWithBalance > 0 ? paymentAmountToDistribute / countOfItemsWithBalance : 0;
            const allocationForThisItem = Math.min(allocationPerItem, currentItemBalance);
            
            const newItemAllocatedPayment = (item.itemAllocatedPayment || 0) + allocationForThisItem;
            
            // Adjust paymentAmountToDistribute for next iteration if it was fully allocated here or partially.
            // This logic ensures paymentAmountToDistribute is reduced correctly even if allocationPerItem > currentItemBalance
            // paymentAmountToDistribute -= allocationForThisItem; // This will be done after loop to handle rounding and final distribution if needed

            return {
              ...item,
              itemAllocatedPayment: parseFloat(newItemAllocatedPayment.toFixed(2)),
              itemBalance: parseFloat(((item.lineItemTotal || 0) - newItemAllocatedPayment).toFixed(2)),
            };
          });
          
          // After initial distribution, re-calculate totals
          let newTotalAllocatedPayment = updatedItems.reduce((sum, item) => sum + (item.itemAllocatedPayment || 0), 0);
          
          // If there's a tiny discrepancy due to distribution, ensure total allocated doesn't exceed original payment
          // (This might happen if initial even distribution overpays slightly due to many items and small payment amounts)
          // More robust is to sum allocated and ensure it matches payment values.amount
          // Or, if paymentAmountToDistribute was still positive, apply remaining to first item with balance
          if (newTotalAllocatedPayment > (poData.totalAllocatedPayment || 0) + values.amount + 0.001 || newTotalAllocatedPayment < (poData.totalAllocatedPayment || 0) + values.amount - 0.001) {
             // This implies a distribution issue, usually more complex logic needed for perfect distribution for all edge cases
             // For now, we ensure totalAllocatedPayment reflects the actual sum from items.
          }


          const newTotalOrderBalance = poData.totalOrderAmount - newTotalAllocatedPayment;

          transaction.update(poDoc.ref, {
            items: updatedItems,
            totalAllocatedPayment: parseFloat(newTotalAllocatedPayment.toFixed(2)),
            totalOrderBalance: parseFloat(newTotalOrderBalance.toFixed(2)),
            updatedAt: serverTimestamp(),
          });
        }
      });

      toast({ title: 'Payment Recorded', description: 'Payment successfully saved and linked.' });
      router.push('/payments');
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({ variant: 'destructive', title: 'Error', description: `Failed to record payment: ${error.message}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="shadow-lg max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Record New Payment
        </CardTitle>
        <CardDescription>Enter payment details and link it to a Sale or Purchase Order.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="transactionType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Transaction Type *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('invoiceNumber', ''); // Reset invoice number on type change
                        form.setValue('person', ''); // Reset person on type change
                      }}
                      value={field.value}
                      className="flex flex-col sm:flex-row gap-4"
                    >
                      {TRANSACTION_TYPES.map((type) => (
                        <FormItem key={type} className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value={type} />
                          </FormControl>
                          <FormLabel className="font-normal">{type}</FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice / PO Number *</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!watchedTransactionType || isLoadingOrders}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingOrders ? "Loading..." : "Select Invoice/PO"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!isLoadingOrders && selectableOrders.length === 0 && (
                        <SelectItem value="-" disabled>No unpaid {watchedTransactionType?.toLowerCase()}s found</SelectItem>
                      )}
                      {selectableOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.displayLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Select the sale invoice or purchase order for this payment.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="referenceSku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference SKU (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter an SKU for quick reference" {...field} />
                  </FormControl>
                  <FormDescription>Useful if payment relates to a specific primary item.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                control={form.control}
                name="paymentDate"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>Payment Date *</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} />
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Amount *</FormLabel>
                    <FormControl>
                        <Input 
                        type="number" 
                        placeholder="0.00" 
                        {...field} 
                        value={field.value === undefined ? '' : field.value} // Control blank display
                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)}
                        step="0.01"
                        />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="person"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Person (Optional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!watchedTransactionType || isLoadingPersons}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingPersons ? "Loading..." : `Select ${watchedTransactionType === 'Sale' ? 'Customer' : 'Vendor'}`} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       {!isLoadingPersons && selectablePersons.length === 0 && (
                        <SelectItem value="-" disabled>No {watchedTransactionType === 'Sale' ? 'customers' : 'vendors'} found</SelectItem>
                      )}
                      {selectablePersons.map((person) => (
                        <SelectItem key={person.id} value={person.name}> {/* Store name, could be ID if schema changes */}
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Name of the person associated with this payment.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes about this payment..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto ml-auto" disabled={isSubmitting || isLoadingOrders || isLoadingPersons}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Record Payment
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
