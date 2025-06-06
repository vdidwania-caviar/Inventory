
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
import { collection, doc, getDoc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, writeBatch, addDoc, orderBy as firestoreOrderBy, FieldValue } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, Save, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import type { Customer, Sale, Invoice as InvoiceType, InventoryItem } from '@/lib/types';
import { parseISO, isValid } from 'date-fns';
import { InventoryItemSkuSelector } from '@/components/invoices/inventory-item-sku-selector';

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = typeof params.id === 'string' ? params.id : undefined;
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);


  const defaultItemValues: InvoiceItemFormValues = {
    itemName: '', itemSku: '', itemQuantity: 1, itemPricePerUnit: 0, itemNotes: '',
  };

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(InvoiceSchema),
    defaultValues: {
      invoiceNumber: '', customerName: '', invoiceDate: new Date(), invoiceStatus: 'Draft', items: [defaultItemValues], taxAmount: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const fetchCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    try {
      const customersQuery = query(collection(db, 'customers'), firestoreOrderBy('CustomerName')); // Order by CustomerName
      const snapshot = await getDocs(customersQuery);
      const fetchedCustomers = snapshot.docs.map(docSnap => ({
         id: docSnap.id,
         name: docSnap.data().CustomerName as string, // Use CustomerName
         email: docSnap.data().Email as string | undefined,
      } as Customer));
      setCustomers(fetchedCustomers);
      console.log("EditInvoicePage: Fetched customers:", fetchedCustomers);
    } catch (error) { 
      console.error("EditInvoicePage: Error fetching customers:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load customers." }); 
    }
    setIsLoadingCustomers(false);
  }, [toast]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const fetchInventoryItems = useCallback(async () => {
    setIsLoadingInventory(true);
    try {
      const inventoryQuery = query(collection(db, 'inventory'), where('status', '==', 'Active')); 
      const snapshot = await getDocs(inventoryQuery);
      const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as InventoryItem));
      setInventoryItems(items);
      console.log("EditInvoicePage: Fetched active inventory items for SKU selector:", items);
    } catch (error) {
      console.error("EditInvoicePage: Error fetching inventory items:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load inventory items for SKU selection." });
    }
    setIsLoadingInventory(false);
  }, [toast]);

  useEffect(() => {
    fetchInventoryItems();
  }, [fetchInventoryItems]);


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

  useEffect(() => {
    if (!invoiceId) {
      toast({ variant: "destructive", title: "Error", description: "Invoice ID is missing." });
      router.push('/invoices');
      return;
    }
    const fetchInvoice = async () => {
      setIsInitialLoading(true);
      try {
        const invoiceDocRef = doc(db, 'invoices', invoiceId);
        const invoiceDocSnap = await getDoc(invoiceDocRef);
        if (invoiceDocSnap.exists()) {
          const data = invoiceDocSnap.data() as InvoiceType;
          let invoiceDateObj: Date = new Date();
          if (data.invoiceDate) {
            if (data.invoiceDate instanceof Timestamp) invoiceDateObj = data.invoiceDate.toDate();
            else if (typeof data.invoiceDate === 'string') {
              const parsed = parseISO(data.invoiceDate);
              if (isValid(parsed)) invoiceDateObj = parsed;
            }
          }
          let dueDateObj: Date | undefined = undefined;
          if (data.dueDate) {
            if (data.dueDate instanceof Timestamp) dueDateObj = data.dueDate.toDate();
            else if (typeof data.dueDate === 'string') {
              const parsed = parseISO(data.dueDate);
              if (isValid(parsed)) dueDateObj = parsed;
            }
          }
          form.reset({
            ...data,
            invoiceDate: invoiceDateObj,
            dueDate: dueDateObj,
            items: data.items.map(item => ({
                ...item,
                itemQuantity: item.itemQuantity || 0,
                itemPricePerUnit: item.itemPricePerUnit || 0,
            })),
            taxAmount: data.taxAmount || 0,
          });
          calculateTotals(); 
        } else {
          toast({ variant: "destructive", title: "Error", description: "Invoice not found." });
          router.push('/invoices');
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load Invoice data." });
        router.push('/invoices');
      }
      setIsInitialLoading(false);
    };
    fetchInvoice();
  }, [invoiceId, form, router, toast, calculateTotals]);

  const handleAddNewCustomer = async () => {
    if (!newCustomerName.trim()) return toast({ variant: "destructive", title: "Error", description: "Customer name cannot be empty." });
    setIsAddingCustomer(true);
    try {
      const customerData: Partial<Customer> & { CustomerName: string } = { // Ensure CustomerName is part of the type
        CustomerName: newCustomerName.trim(), // Save as CustomerName
        name: newCustomerName.trim(), // Keep name for local state compatibility if needed
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString()
      };
      if (newCustomerEmail.trim()) customerData.email = newCustomerEmail.trim();
      const docRef = await addDoc(collection(db, 'customers'), customerData);
      toast({ title: "Customer Added", description: `Customer "${newCustomerName.trim()}" created.` });
      setNewCustomerName(''); setNewCustomerEmail('');
      await fetchCustomers();
      form.setValue('customerName', newCustomerName.trim());
      form.setValue('customerId', docRef.id);
      setIsAddCustomerDialogOpen(false);
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Failed to add customer." }); }
    setIsAddingCustomer(false);
  };

  const watchItems = form.watch('items');
  const isFormDisabled = form.formState.isSubmitting || isInitialLoading || isAddingCustomer || isLoadingCustomers || isLoadingInventory;

  async function onSubmit(values: InvoiceFormValues) {
    if (form.formState.isSubmitting) return; 
    form.control.handleSubmit(() => {})(); 

    if (!invoiceId) return setSubmitError("Invoice ID missing.");
    setSubmitError(null);
    try {
      const existingInvoiceSnap = await getDoc(doc(db, 'invoices', invoiceId));
      if(!existingInvoiceSnap.exists()) throw new Error("Original invoice not found for update.");
      const existingInvoiceData = existingInvoiceSnap.data() as InvoiceType;

      const subtotalCalc = values.items.reduce((acc, item) => acc + (item.itemQuantity || 0) * (item.itemPricePerUnit || 0), 0);
      const taxAmountCalc = values.taxAmount || 0;
      const totalAmountCalc = subtotalCalc + taxAmountCalc;
      const totalAllocatedPaymentCurrent = existingInvoiceData.totalAllocatedPayment || 0;

      const invoiceDataToUpdate = {
        ...values,
        invoiceDate: Timestamp.fromDate(values.invoiceDate),
        dueDate: values.dueDate ? Timestamp.fromDate(values.dueDate) : FieldValue.delete() as unknown as undefined,
        items: values.items.map(item => ({ ...item, lineItemTotal: parseFloat(((item.itemQuantity || 0) * (item.itemPricePerUnit || 0)).toFixed(2)) })),
        subtotal: parseFloat(subtotalCalc.toFixed(2)),
        taxAmount: parseFloat(taxAmountCalc.toFixed(2)),
        totalAmount: parseFloat(totalAmountCalc.toFixed(2)),
        totalAllocatedPayment: totalAllocatedPaymentCurrent,
        totalBalance: parseFloat((totalAmountCalc - totalAllocatedPaymentCurrent).toFixed(2)),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'invoices', invoiceId), invoiceDataToUpdate);

      const salesQuery = query(collection(db, 'sales'), where("invoiceId", "==", invoiceId));
      const existingSaleDocsSnap = await getDocs(salesQuery);
      existingSaleDocsSnap.forEach(docSnap => batch.delete(docSnap.ref));

      const salesCollectionRef = collection(db, 'sales');
      for (const item of invoiceDataToUpdate.items) {
        const lineItemTotal = (item.itemQuantity || 0) * (item.itemPricePerUnit || 0);
        const saleData: Omit<Sale, 'id' | 'items'> & { items?: any[] } = {
          invoiceId: invoiceId, Invoice: invoiceDataToUpdate.invoiceNumber,
          Customer: invoiceDataToUpdate.customerName, customerId: invoiceDataToUpdate.customerId,
          Date: invoiceDataToUpdate.invoiceDate.toDate().toISOString(), Item: item.itemName, SKU: item.itemSku,
          Quantity: item.itemQuantity, Price: lineItemTotal, Revenue: lineItemTotal,
          allocated_payment: 0, Balance: lineItemTotal, 
          channel: 'Invoice', notes: item.itemNotes,
          createdAt: invoiceDataToUpdate.updatedAt, updatedAt: invoiceDataToUpdate.updatedAt,
        };
        delete saleData.items;
        const newSaleDocRef = doc(salesCollectionRef);
        batch.set(newSaleDocRef, saleData);
      }
      await batch.commit();
      toast({ title: 'Invoice Updated', description: `Invoice #${values.invoiceNumber} updated.` });
      router.push(`/invoices/${invoiceId}`);
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to update invoice.');
      toast({ variant: 'destructive', title: 'Error', description: `Failed to update invoice: ${error.message}` });
    }
  }

  if (isInitialLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-lg">Loading Invoice...</p></div>;
  
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.push(invoiceId ? `/invoices/${invoiceId}` : '/invoices')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoice Detail
      </Button>
      <h1 className="text-3xl font-bold font-headline tracking-tight">Edit Invoice</h1>
      {submitError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">{submitError}</div>}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-lg">
            <CardHeader><CardTitle className="font-headline flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-primary" />Invoice Details</CardTitle><CardDescription>Modify details for this invoice. Invoice Number is not editable.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="invoiceNumber" render={({ field }) => (<FormItem><FormLabel>Invoice Number</FormLabel><FormControl><Input {...field} value={field.value || ""} readOnly className="bg-muted"/></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="customerName" render={({ field }) => (
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
                            <SelectValue placeholder={isLoadingCustomers ? "Loading..." : "Select customer"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingCustomers && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                          {!isLoadingCustomers && customers.length === 0 && <SelectItem value="no-customers" disabled>No customers. Add one.</SelectItem>}
                          {customers.map(c => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
                        <DialogTrigger asChild><Button type="button" variant="outline" size="icon" title="Add Customer" disabled={isFormDisabled}><PlusCircle className="h-4 w-4" /></Button></DialogTrigger>
                        <DialogContent><DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader><div className="py-4 space-y-3"><Input placeholder="Customer name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} /><Input type="email" placeholder="Customer email (optional)" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline" onClick={() => { setNewCustomerName(''); setNewCustomerEmail(''); }}>Cancel</Button></DialogClose><Button type="button" onClick={handleAddNewCustomer} disabled={isAddingCustomer}>{isAddingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add</Button></DialogFooter></DialogContent>
                      </Dialog>
                    </div><FormMessage />
                  </FormItem>)} />
              <FormField control={form.control} name="invoiceDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Invoice Date</FormLabel><DatePicker value={field.value} onChange={field.onChange} disabled={isFormDisabled} /><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="dueDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Due Date (Optional)</FormLabel><DatePicker value={field.value} onChange={field.onChange} disabled={isFormDisabled} /><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="invoiceStatus" render={({ field }) => (<FormItem><FormLabel>Invoice Status</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Sent">Sent</SelectItem><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Partially Paid">Partially Paid</SelectItem><SelectItem value="Overdue">Overdue</SelectItem><SelectItem value="Void">Void</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="taxAmount" render={({ field }) => (<FormItem><FormLabel>Tax Amount (Optional)</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} step="0.01" disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="notes" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Internal notes..." {...field} value={field.value || ''} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="terms" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Terms (Optional)</FormLabel><FormControl><Textarea placeholder="Payment terms..." {...field} value={field.value || ''} disabled={isFormDisabled} /></FormControl><FormMessage /></FormItem>)} />
            </CardContent>
          </Card>
          <Card className="shadow-lg">
            <CardHeader><CardTitle className="font-headline">Line Items</CardTitle><CardDescription>Add or modify items for this invoice. SKU is required.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              {fields.map((itemField, index) => { const currentItem = watchItems[index]; const lineItemTotal = (currentItem?.itemQuantity || 0) * (currentItem?.itemPricePerUnit || 0); return (
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
                  <FormField control={form.control} name={`items.${index}.itemNotes`} render={({ field:formField }) => (<FormItem><FormLabel>Item Notes (Opt.)</FormLabel><FormControl><Textarea placeholder="Notes for item..." {...formField} value={formField.value || ''} disabled={isFormDisabled}/></FormControl><FormMessage /></FormItem>)} />
                  <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} className="absolute top-4 right-4 h-7 w-7" disabled={isFormDisabled}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Item</span></Button>
                </div>);
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
                    Save Changes
                </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
