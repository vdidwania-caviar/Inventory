'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { PurchaseOrderSchema, type PurchaseOrderFormValues, type PurchaseOrderItemFormValues } from '@/lib/schemas';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect } from 'react';

function generatePoNumber(): string {
  const datePart = format(new Date(), 'yyyyMMdd');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PO-${datePart}-${randomPart}`;
}

export default function AddPurchaseOrderPage() {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(PurchaseOrderSchema),
    defaultValues: {
      poNumber: '', // Will be set on mount
      vendorName: '',
      purchaseDate: new Date(),
      poStatus: 'Draft',
      items: [{ 
        itemName: '', 
        itemQuantity: 1, 
        itemCostPerUnit: 0, 
        itemPurchaseType: 'For Sale', 
        itemStatus: 'Pending',
        itemAllocatedPayment: 0,
      }],
      notes: '',
      receiptUrls: '',
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  useEffect(() => {
    form.setValue('poNumber', generatePoNumber());
  }, [form]);

  const watchItems = form.watch('items');

  async function onSubmit(values: PurchaseOrderFormValues) {
    try {
      const poDataToSave = {
        ...values,
        poNumber: values.poNumber || generatePoNumber(),
        purchaseDate: Timestamp.fromDate(values.purchaseDate),
        items: values.items.map(item => {
          const lineItemTotal = (item.itemQuantity || 0) * (item.itemCostPerUnit || 0);
          const itemBalance = lineItemTotal - (item.itemAllocatedPayment || 0);
          return {
            ...item,
            lineItemTotal: parseFloat(lineItemTotal.toFixed(2)),
            itemBalance: parseFloat(itemBalance.toFixed(2)),
          };
        }),
        totalOrderAmount: parseFloat(values.items.reduce((acc, item) => acc + (item.itemQuantity || 0) * (item.itemCostPerUnit || 0), 0).toFixed(2)),
        totalAllocatedPayment: parseFloat(values.items.reduce((acc, item) => acc + (item.itemAllocatedPayment || 0), 0).toFixed(2)),
        totalOrderBalance: parseFloat(values.items.reduce((acc, item) => {
            const lineTotal = (item.itemQuantity || 0) * (item.itemCostPerUnit || 0);
            const balance = lineTotal - (item.itemAllocatedPayment || 0);
            return acc + balance;
        }, 0).toFixed(2)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'purchaseOrders'), poDataToSave);
      
      toast({
        title: 'Purchase Order Created',
        description: `PO #${poDataToSave.poNumber} has been successfully saved.`,
      });
      router.push('/purchase-orders'); // Updated redirect
    } catch (error) {
      console.error('Error creating purchase order:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create purchase order. Please try again.',
      });
    }
  }

  const handleItemChange = (index: number, field: keyof PurchaseOrderItemFormValues, value: any) => {
    const currentItem = { ...watchItems[index], [field]: value };
    update(index, currentItem);
  };


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline tracking-tight">Add New Purchase Order</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline">PO Details</CardTitle>
              <CardDescription>Enter the main details for this purchase order.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number (Auto-generated)</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vendorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter vendor name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchaseDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Purchase Date</FormLabel>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="poStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select PO status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Ordered">Ordered</SelectItem>
                        <SelectItem value="Partially Received">Partially Received</SelectItem>
                        <SelectItem value="Received">Received</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>PO Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter any notes for the PO..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="receiptUrls"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Receipt URLs (comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., https://example.com/receipt1.pdf, https://example.com/receipt2.jpg" {...field} />
                    </FormControl>
                    <FormDescription>Enter URLs for receipts associated with this PO.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline">Line Items</CardTitle>
              <CardDescription>Add items to this purchase order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((field, index) => {
                const currentItem = watchItems[index];
                const lineItemTotal = (currentItem?.itemQuantity || 0) * (currentItem?.itemCostPerUnit || 0);
                const itemBalance = lineItemTotal - (currentItem?.itemAllocatedPayment || 0);

                return (
                <div key={field.id} className="p-4 border rounded-md space-y-4 relative shadow">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemName`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Item Name</FormLabel>
                          <FormControl><Input placeholder="Item name" {...formField} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemSku`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>SKU (Optional)</FormLabel>
                          <FormControl><Input placeholder="Item SKU" {...formField} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemQuantity`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="Qty" 
                              {...formField} 
                              onChange={e => handleItemChange(index, 'itemQuantity', parseFloat(e.target.value) || 0)}
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemCostPerUnit`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Cost/Unit</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="Cost per unit" 
                              {...formField}
                              onChange={e => handleItemChange(index, 'itemCostPerUnit', parseFloat(e.target.value) || 0)}
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name={`items.${index}.itemAllocatedPayment`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Allocated Payment</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="Payment amount" 
                              {...formField}
                              onChange={e => handleItemChange(index, 'itemAllocatedPayment', parseFloat(e.target.value) || 0)}
                              step="0.01"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemPurchaseType`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Purchase Type</FormLabel>
                          <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="For Sale">For Sale</SelectItem>
                              <SelectItem value="Business Use">Business Use</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.itemStatus`}
                      render={({ field: formField }) => (
                        <FormItem>
                          <FormLabel>Item Status</FormLabel>
                          <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="Received">Received</SelectItem>
                              <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormItem>
                        <FormLabel>Line Total</FormLabel>
                        <Input value={`$${lineItemTotal.toFixed(2)}`} readOnly className="bg-muted" />
                    </FormItem>
                    <FormItem>
                        <FormLabel>Item Balance</FormLabel>
                        <Input value={`$${itemBalance.toFixed(2)}`} readOnly className="bg-muted" />
                    </FormItem>
                  </div>
                  <FormField
                    control={form.control}
                    name={`items.${index}.itemNotes`}
                    render={({ field: formField }) => (
                      <FormItem>
                        <FormLabel>Item Notes (Optional)</FormLabel>
                        <FormControl><Textarea placeholder="Notes for this specific item..." {...formField} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2"
                    disabled={fields.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )})}
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ itemName: '', itemQuantity: 1, itemCostPerUnit: 0, itemPurchaseType: 'For Sale', itemStatus: 'Pending', itemAllocatedPayment: 0 })}
                className="mt-4"
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </CardContent>
             <CardFooter className="flex justify-end">
                 <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Purchase Order
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}