
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { InvoiceSchema, type InvoiceFormValues, type InvoiceItemFormValues } from '@/lib/schemas';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp, getDocs, query, orderBy as firestoreOrderBy, doc, runTransaction, writeBatch, DocumentReference, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, Save, FileSpreadsheet } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import type { Customer, Sale, InventoryItem } from '@/lib/types';
import { InventoryItemSkuSelector } from './inventory-item-sku-selector';

async function generateNextInvoiceNumber(): Promise<string> {
  const counterRef = doc(db, "systemCounters", "invoiceCounter") as DocumentReference<{ lastInvoiceNumber: number }>;
  let nextInvoiceNumberValue = 1;

  try {
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { lastInvoiceNumber: 1 });
        nextInvoiceNumberValue = 1;
      } else {
        const currentNumber = counterDoc.data()?.lastInvoiceNumber || 0;
        nextInvoiceNumberValue = currentNumber + 1;
        transaction.update(counterRef, { lastInvoiceNumber: nextInvoiceNumberValue });
      }
    });
  } catch (e) {
    console.error("Transaction failed for Invoice Number: ", e);
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `I-ERR${year}${month}${day}${randomSuffix}`;
  }
  return `I${nextInvoiceNumberValue.toString().padStart(6, '0')}`;
}

export function AddInvoiceForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isSettingInvoiceNumber, setIsSettingInvoiceNumber] = useState(true);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  const defaultItemValues: InvoiceItemFormValues = {
    itemName: '',
    itemSku: '',
    itemQuantity: 1,
    itemPricePerUnit: 0,
    itemNotes: '',
  };

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(InvoiceSchema),
    defaultValues: {
      invoiceNumber: '',
      customerName: '',
      invoiceDate: new Date(),
      invoiceStatus: 'Draft',
      items: [defaultItemValues],
      notes: '',
      terms: '',
      taxAmount: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const initializeInvoiceNumber = useCallback(async () => {
    setIsSettingInvoiceNumber(true);
    try {
      const invNum = await generateNextInvoiceNumber();
      form.setValue('invoiceNumber', invNum);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not generate Invoice number." });
      form.setValue('invoiceNumber', `I-FB-ERR${Date.now()}`);
    }
    setIsSettingInvoiceNumber(false);
  }, [form, toast]);

  useEffect(() => {
    initializeInvoiceNumber();
  }, [initializeInvoiceNumber]);

  const fetchCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    try {
      const customersQuery = query(collection(db, 'customers'), firestoreOrderBy('CustomerName'));
      const snapshot = await getDocs(customersQuery);
      const fetchedCustomers: Customer[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().CustomerName as string, 
        email: docSnap.data().Email as string | undefined,
      } as Customer));
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error("AddInvoiceForm: Error fetching customers:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load customers." });
    }
    setIsLoadingCustomers(false);
  }, [toast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const fetchInventoryItems = useCallback(async () => {
    setIsLoadingInventory(true);
    try {
      const inventoryQuery = query(collection(db, 'inventory'), where('status', '==', 'Active')); 
      const snapshot = await getDocs(inventoryQuery);
      const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as InventoryItem));
      setInventoryItems(items);
    } catch (error) {
      console.error("AddInvoiceForm: Error fetching inventory items:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load inventory items for SKU selection." });
    }
    setIsLoadingInventory(false);
  }, [toast]);

  useEffect(() => {
    fetchInventoryItems();
  }, [fetchInventoryItems]);


  const handleAddNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Customer name cannot be empty." });
      return;
    }
    setIsAddingCustomer(true);
    try {
      const customerData: Partial<Customer> & { CustomerName: string } = {
        CustomerName: newCustomerName.trim(),
        name: newCustomerName.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (newCustomerEmail.trim()) {
        customerData.email = newCustomerEmail.trim();
      }
      const docRef = await addDoc(collection(db, 'customers'), customerData);
      toast({ title: "Customer Added", description: `Customer "${newCustomerName.trim()}" created.` });
      setNewCustomerName('');
      setNewCustomerEmail('');
      await fetchCustomers();
      form.setValue('customerName', newCustomerName.trim());
      form.setValue('customerId', docRef.id);
      setIsAddCustomerDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add customer." });
    }
    setIsAddingCustomer(false);
  };

  const watchItems = form.watch('items');
  const isFormDisabled = form.formState.isSubmitting || isSettingInvoiceNumber || isAddingCustomer || isLoadingCustomers || isLoadingInventory;

  const calculateTotals = useCallback(() => {
    const items = form.getValues('items');
    const subtotal = items.reduce((acc, item) => acc + (item.itemQuantity || 0) * (item.itemPricePerUnit || 0), 0);
    const taxAmount = form.getValues('taxAmount') || 0;
    const totalAmount = subtotal + taxAmount;
    form.setValue('subtotal', parseFloat(subtotal.toFixed(2)));
    form.setValue('totalAmount', parseFloat(totalAmount.toFixed(2)));
  }, [form]);

  useEffect(() => {
    calculateTotals();
    const subscription = form.watch((value, { name }) => {
      if (name && (name.startsWith('items') || name === 'taxAmount')) {
        calculateTotals();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, calculateTotals]);


  async function onSubmit(values: InvoiceFormValues) {
    if (form.formState.isSubmitting) return; 
    form.control.handleSubmit(() => {})(); 

    setSubmitError(null);
    if (!values.invoiceNumber) {
      setSubmitError('Invoice Number is missing. Please wait or refresh.');
      toast({ variant: "destructive", title: "Error", description: "Invoice Number is missing." });
      return;
    }
    
    const batch = writeBatch(db);
    const invoiceCollectionRef = collection(db, 'invoices');
    const salesCollectionRef = collection(db, 'sales');

    try {
      const subtotalCalc = values.items.reduce((acc, item) => acc + (item.itemQuantity || 0) * (item.itemPricePerUnit || 0), 0);
      const taxAmountCalc = values.taxAmount || 0;
      const totalAmountCalc = subtotalCalc + taxAmountCalc;

      const invoiceDataToSave = {
        ...values,
        invoiceDate: Timestamp.fromDate(values.invoiceDate),
        dueDate: values.dueDate ? Timestamp.fromDate(values.dueDate) : undefined,
        items: values.items.map(item => ({
          ...item,
          lineItemTotal: parseFloat(((item.itemQuantity || 0) * (item.itemPricePerUnit || 0)).toFixed(2)),
        })),
        subtotal: parseFloat(subtotalCalc.toFixed(2)),
        taxAmount: parseFloat(taxAmountCalc.toFixed(2)),
        totalAmount: parseFloat(totalAmountCalc.toFixed(2)),
        totalAllocatedPayment: 0, 
        totalBalance: parseFloat(totalAmountCalc.toFixed(2)), 
        channel: 'Manual' as InvoiceFormValues['channel'], 
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      // Use the generated invoiceNumber as the document ID
      const newInvoiceDocRef = doc(invoiceCollectionRef, invoiceDataToSave.invoiceNumber);
      batch.set(newInvoiceDocRef, invoiceDataToSave);

      for (const item of invoiceDataToSave.items) {
        const lineItemTotal = (item.itemQuantity || 0) * (item.itemPricePerUnit || 0);
        const saleData: Omit<Sale, 'id' | 'items'> & { items?: any[] } = { 
          invoiceId: newInvoiceDocRef.id, // This will be the invoiceNumber, e.g., "I000001"
          Invoice: invoiceDataToSave.invoiceNumber, 
          Customer: invoiceDataToSave.customerName,
          customerId: invoiceDataToSave.customerId,
          Date: invoiceDataToSave.invoiceDate.toDate().toISOString(),
          Item: item.itemName,
          SKU: item.itemSku,
          Quantity: item.itemQuantity,
          Price: lineItemTotal, 
          Revenue: lineItemTotal, 
          Tax: 0, 
          Taxable: false, 
          allocated_payment: 0, 
          Balance: lineItemTotal, 
          channel: 'Manual', 
          notes: item.itemNotes,
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        };
        delete saleData.items;

        const newSaleDocRef = doc(salesCollectionRef); 
        batch.set(newSaleDocRef, saleData);
      }
      
      await batch.commit();

      toast({
        title: 'Invoice Created',
        description: `Invoice #${invoiceDataToSave.invoiceNumber} and its sale line items have been successfully saved.`,
      });

      form.reset();  
      await initializeInvoiceNumber(); 
      router.push('/invoices');
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to create invoice or associated sales. Please try again.');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to create invoice or associated sales: ${error.message}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      {submitError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {submitError}
        </div>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
                Invoice Details
              </CardTitle>
              <CardDescription>
                Enter customer and date details for this invoice.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || (isSettingInvoiceNumber ? "Generating..." : "Error")} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <div className="flex gap-2 items-center">
                      <Select
                        onValueChange={(selectedCustomerName) => {
                          field.onChange(selectedCustomerName);
                          const selectedCustomer = customers.find(c => c.name === selectedCustomerName);
                          form.setValue('customerId', selectedCustomer?.id || undefined);
                        }}
                        value={field.value || ''}
                        disabled={isLoadingCustomers || isFormDisabled}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingCustomers ? "Loading customers..." : "Select customer"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingCustomers && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                          {!isLoadingCustomers && customers.length === 0 && <SelectItem value="no-customers" disabled>No customers found. Add one.</SelectItem>}
                          {customers.map(customer => (
                            <SelectItem key={customer.id} value={customer.name}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="icon" title="Add New Customer" disabled={isFormDisabled}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
                          <div className="py-4 space-y-3">
                            <Input placeholder="Customer name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                            <Input type="email" placeholder="Customer email (optional)" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
                          </div>
                          <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline" onClick={() => { setNewCustomerName(''); setNewCustomerEmail(''); }}>Cancel</Button></DialogClose>
                            <Button type="button" onClick={handleAddNewCustomer} disabled={isAddingCustomer}>
                              {isAddingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add Customer
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Invoice Date</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={isFormDisabled} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date (Optional)</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={isFormDisabled} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                        <SelectItem value="Void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Amount (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        {...field}
                        value={field.value || ''}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        step="0.01"
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Invoice Notes (Optional)</FormLabel>
                    <FormControl><Textarea placeholder="Internal notes for this invoice..." {...field} value={field.value || ''} disabled={isFormDisabled} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Terms & Conditions (Optional)</FormLabel>
                    <FormControl><Textarea placeholder="Payment terms, return policy, etc." {...field} value={field.value || ''} disabled={isFormDisabled} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline">Line Items</CardTitle>
              <CardDescription>Add items to this invoice. SKU is required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((itemField, index) => {
                const currentItem = watchItems[index];
                const lineItemTotal = (currentItem?.itemQuantity || 0) * (currentItem?.itemPricePerUnit || 0);
                return (
                  <div key={itemField.id} className="p-4 border rounded-md space-y-4 relative shadow bg-background/50">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.itemSku`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-3">
                            <FormLabel>SKU *</FormLabel>
                            <FormControl>
                              <InventoryItemSkuSelector
                                inventoryItems={inventoryItems}
                                value={field.value}
                                onChange={(selectedSku) => {
                                  const selectedItem = inventoryItems.find(invItem => invItem.sku === selectedSku);
                                  form.setValue(`items.${index}.itemSku`, selectedSku);
                                  if (selectedItem) {
                                    form.setValue(`items.${index}.itemName`, selectedItem.productTitle || '');
                                    form.setValue(`items.${index}.itemPricePerUnit`, selectedItem.price || 0);
                                  } else {
                                    form.setValue(`items.${index}.itemName`, ''); 
                                    form.setValue(`items.${index}.itemPricePerUnit`, 0);
                                  }
                                }}
                                disabled={isFormDisabled || isLoadingInventory}
                                placeholder="Select or Search SKU..."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField 
                        control={form.control} 
                        name={`items.${index}.itemQuantity`} 
                        render={({ field:formField }) => (
                          <FormItem className="md:col-span-3">
                            <FormLabel>Quantity *</FormLabel>
                            <FormControl><Input type="number" placeholder="Qty" {...formField} value={formField.value || ''} onChange={e => formField.onChange(parseFloat(e.target.value) || 0)} step="any" disabled={isFormDisabled} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} 
                      />
                      <FormField 
                        control={form.control} 
                        name={`items.${index}.itemName`} 
                        render={({ field }) => (
                          <FormItem className="md:col-span-6">
                            <FormLabel>Item Name *</FormLabel>
                            <FormControl><Input placeholder="Auto-filled from SKU" {...field} value={field.value || ''} readOnly className="bg-muted/50"/></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} 
                      />
                      <FormField control={form.control} name={`items.${index}.itemPricePerUnit`} render={({ field:formField }) => (
                        <FormItem className="md:col-span-3">
                          <FormLabel>Price/Unit *</FormLabel>
                          <FormControl><Input type="number" placeholder="Price/unit" {...formField} value={formField.value || ''} onChange={e => formField.onChange(parseFloat(e.target.value) || 0)} step="0.01" disabled={isFormDisabled} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormItem className="md:col-span-3">
                        <FormLabel>Line Total</FormLabel>
                        <Input value={`$${lineItemTotal.toFixed(2)}`} readOnly className="bg-muted" />
                      </FormItem>
                    </div>
                    <FormField control={form.control} name={`items.${index}.itemNotes`} render={({ field: formField }) => (<FormItem><FormLabel>Item Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Notes for this specific item..." {...formField} value={formField.value || ''} disabled={isFormDisabled}/></FormControl><FormMessage /></FormItem>)} />
                    {fields.length > 1 && (<Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} className="absolute top-4 right-4 h-7 w-7" disabled={isFormDisabled}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Item</span></Button>)}
                  </div>
                )
              })}
              <Button type="button" variant="outline" onClick={() => append(defaultItemValues)} className="mt-4" disabled={isFormDisabled}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </CardContent>
            <CardFooter className="flex flex-col md:flex-row md:justify-between items-center gap-4 pt-6">
                <div className="text-right w-full md:w-auto space-y-1">
                    <p className="text-sm text-muted-foreground">Subtotal: <span className="font-medium text-foreground">${(form.getValues('subtotal') || 0).toFixed(2)}</span></p>
                    <p className="text-sm text-muted-foreground">Tax: <span className="font-medium text-foreground">${(form.getValues('taxAmount') || 0).toFixed(2)}</span></p>
                    <p className="text-lg font-semibold text-foreground">Total: <span className="text-primary">${(form.getValues('totalAmount') || 0).toFixed(2)}</span></p>
                </div>
                <Button type="submit" disabled={isFormDisabled || form.formState.isSubmitting} className="w-full md:w-auto">
                    {form.formState.isSubmitting || isFormDisabled ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<Save className="mr-2 h-4 w-4" />)}
                    Save Invoice
                </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
