
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
import { PurchaseOrderSchema, type PurchaseOrderFormValues, type PurchaseOrderItemFormValues } from '@/lib/schemas';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, Timestamp, getDocs, query, orderBy, doc, runTransaction, DocumentReference, writeBatch } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, Save } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import type { Vendor, SimplePurchase } from '@/lib/types';

// Firestore PO number transaction
async function generateNextPoNumber(): Promise<string> {
  const counterRef = doc(db, "systemCounters", "poCounter") as DocumentReference<{ lastPoNumber: number }>;
  let nextPoNumberValue = 1;

  try {
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { lastPoNumber: 1 });
        nextPoNumberValue = 1;
      } else {
        const currentNumber = counterDoc.data()?.lastPoNumber || 0;
        nextPoNumberValue = currentNumber + 1;
        transaction.update(counterRef, { lastPoNumber: nextPoNumberValue });
      }
    });
  } catch (e) {
    console.error("Transaction failed or counter error for PO Number: ", e);
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `P-ERR${year}${month}${day}${randomSuffix}`;
  }
  return `P${nextPoNumberValue.toString().padStart(6, '0')}`;
}

export default function AddPurchaseOrderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isSettingPoNumber, setIsSettingPoNumber] = useState(true);
  const [newVendorName, setNewVendorName] = useState('');
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [isAddVendorDialogOpen, setIsAddVendorDialogOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultItemValues: PurchaseOrderItemFormValues = {
    itemName: '',
    itemSku: '',
    itemQuantity: 1,
    itemCostPerUnit: 0,
    itemPurchaseType: 'For Sale',
    itemStatus: 'Pending',
    itemAllocatedPayment: 0,
    itemNotes: '',
  };

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(PurchaseOrderSchema),
    defaultValues: {
      poNumber: '',
      vendorName: '',
      purchaseDate: new Date(),
      poStatus: 'Draft',
      items: [defaultItemValues],
      notes: '',
      receiptUrls: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const initializePoNumber = useCallback(async () => {
    setIsSettingPoNumber(true);
    try {
      const poNum = await generateNextPoNumber();
      form.setValue('poNumber', poNum);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not generate PO number. Using fallback." });
      // Fallback PO number if generateNextPoNumber truly fails beyond its own error handling
      const now = new Date();
      form.setValue('poNumber', `P-FB${now.getFullYear()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    }
    setIsSettingPoNumber(false);
  }, [form, toast]);

  useEffect(() => {
    initializePoNumber();
  }, [initializePoNumber]);

  const fetchVendors = useCallback(async () => {
    setIsLoadingVendors(true);
    try {
      const vendorsQuery = query(collection(db, 'vendors'), orderBy('name'));
      const snapshot = await getDocs(vendorsQuery);
      const fetchedVendors: Vendor[] = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Vendor));
      setVendors(fetchedVendors);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load vendors." });
    }
    setIsLoadingVendors(false);
  }, [toast]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleAddNewVendor = async () => {
    if (!newVendorName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Vendor name cannot be empty." });
      return;
    }
    setIsAddingVendor(true);
    try {
      const docRef = await addDoc(collection(db, 'vendors'), {
        name: newVendorName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Vendor Added", description: `Vendor "${newVendorName.trim()}" created.` });
      setNewVendorName('');
      await fetchVendors(); 
      form.setValue('vendorName', newVendorName.trim()); 
      // Find the newly added vendor and set its ID in the form if needed (optional for current schema)
      const newVendor = vendors.find(v => v.name === newVendorName.trim() && v.id === docRef.id);
      if (newVendor) form.setValue('vendorId', newVendor.id);
      setIsAddVendorDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add vendor." });
    }
    setIsAddingVendor(false);
  };

  const watchItems = form.watch('items');
  const isFormDisabled = form.formState.isSubmitting || isSettingPoNumber || isAddingVendor;

  async function onSubmit(values: PurchaseOrderFormValues) {
    setSubmitError(null);
    if (!values.poNumber) {
      setSubmitError('PO Number is missing. Please wait or refresh.');
      toast({ variant: "destructive", title: "Error", description: "PO Number is missing." });
      return;
    }
    try {
      const receiptUrlsArray = values.receiptUrls
        ? values.receiptUrls.split(',').map(url => url.trim()).filter(Boolean)
        : [];

      const poDataToSave = {
        ...values,
        purchaseDate: Timestamp.fromDate(values.purchaseDate),
        items: values.items.map(item => {
          const lineItemTotal = (item.itemQuantity || 0) * (item.itemCostPerUnit || 0);
          const itemBalance = lineItemTotal - (item.itemAllocatedPayment || 0);
          return {
            ...item,
            itemSku: item.itemSku || '', // Ensure SKU is an empty string if not provided
            itemNotes: item.itemNotes || '', // Ensure notes is an empty string if not provided
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
        receiptUrls: receiptUrlsArray, // Use the processed array
      };

      const poDocRef = await addDoc(collection(db, 'purchaseOrders'), poDataToSave);
      const poFirestoreId = poDocRef.id; 

      const batch = writeBatch(db);
      const purchasesCollectionRef = collection(db, 'purchases');
      for (const item of poDataToSave.items) {
        const simplePurchaseData: Omit<SimplePurchase, 'id'> = {
          poId: poFirestoreId, 
          poNumber: poDataToSave.poNumber,
          itemName: item.itemName,
          itemSku: item.itemSku,
          itemCost: item.itemCostPerUnit,
          vendorName: poDataToSave.vendorName,
          purchaseDate: poDataToSave.purchaseDate.toDate().toISOString(),
          itemQuantity: item.itemQuantity,
          notes: item.itemNotes,
          productType: item.itemPurchaseType === 'For Sale' ? 'Retail Product' : 'Business Supply',
          receiptUrl: receiptUrlsArray.length > 0 ? receiptUrlsArray[0] : '', 
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        };
        const newSimplePurchaseRef = doc(purchasesCollectionRef); 
        batch.set(newSimplePurchaseRef, simplePurchaseData);

        if (item.itemPurchaseType === 'For Sale') {
          console.log(`Placeholder: Item "${item.itemName}" (SKU: ${item.itemSku}) would be pushed to Shopify as a draft.`);
          toast({ title: "Shopify Action (Placeholder)", description: `Item "${item.itemName}" marked for Shopify draft creation.`});
        }
      }
      await batch.commit();

      toast({
        title: 'Purchase Order Created',
        description: `PO #${poDataToSave.poNumber} and its line items have been successfully saved.`,
      });

      form.reset();  
      await initializePoNumber(); 
      router.push('/purchase-orders');
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to create purchase order or associated purchases. Please try again.');
      console.error("Error in onSubmit for new PO:", error); // Added console log for detailed error
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to create purchase order or associated purchases: ${error.message}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline tracking-tight">Add New Purchase Order</h1>
      {submitError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {submitError}
        </div>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline">PO Details</CardTitle>
              <CardDescription>
                Enter the main details for this purchase order.
                <br />
                <span className="text-xs text-muted-foreground">
                  PO Number is auto-generated. Client-side counter is for demo; use Cloud Functions for production.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || (isSettingPoNumber ? "Generating..." : "Error")} readOnly className="bg-muted" />
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
                    <div className="flex gap-2 items-center">
                      <Select
                        onValueChange={(selectedVendorName) => {
                           field.onChange(selectedVendorName);
                           const selectedVendor = vendors.find(v => v.name === selectedVendorName);
                           form.setValue('vendorId', selectedVendor?.id || undefined);
                        }}
                        value={field.value || ''}
                        disabled={isLoadingVendors || isFormDisabled}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingVendors ? "Loading vendors..." : "Select vendor"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingVendors && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                          {!isLoadingVendors && vendors.length === 0 && <SelectItem value="no-vendors" disabled>No vendors found. Add one.</SelectItem>}
                          {vendors.map(vendor => (
                            <SelectItem key={vendor.id} value={vendor.name}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Dialog open={isAddVendorDialogOpen} onOpenChange={setIsAddVendorDialogOpen}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="icon" title="Add New Vendor" disabled={isFormDisabled}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Vendor</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <Input
                              placeholder="Enter new vendor name"
                              value={newVendorName}
                              onChange={(e) => setNewVendorName(e.target.value)}
                            />
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="outline" onClick={() => setNewVendorName('')}>Cancel</Button>
                            </DialogClose>
                            <Button type="button" onClick={handleAddNewVendor} disabled={isAddingVendor}>
                              {isAddingVendor && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Add Vendor
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
                name="purchaseDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Purchase Date</FormLabel>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isFormDisabled}
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
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
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
                      <Textarea placeholder="Enter any notes for the PO..." {...field} value={field.value || ''} disabled={isFormDisabled} />
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
                      <Input placeholder="e.g., https://example.com/receipt1.pdf" {...field} value={field.value || ''} disabled={isFormDisabled} />
                    </FormControl>
                    <FormDescription>Enter URLs for receipts. Direct upload is a future feature.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline">Line Items</CardTitle>
              <CardDescription>Add items to this purchase order. SKU generation is manual for now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((field, index) => {
                const currentItem = watchItems[index];
                const lineItemTotal = (currentItem?.itemQuantity || 0) * (currentItem?.itemCostPerUnit || 0);
                const itemBalance = lineItemTotal - (currentItem?.itemAllocatedPayment || 0);

                return (
                  <div key={field.id} className="p-4 border rounded-md space-y-4 relative shadow bg-background/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.itemName`}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>Item Name</FormLabel>
                            <FormControl><Input placeholder="Item name" {...formField} value={formField.value || ''} disabled={isFormDisabled}/></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.itemSku`}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>SKU (Manual)</FormLabel>
                            <FormControl><Input placeholder="Enter Item SKU" {...formField} value={formField.value || ''} disabled={isFormDisabled} /></FormControl>
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
                                value={formField.value || ''}
                                onChange={e => formField.onChange(parseFloat(e.target.value) || 0)}
                                step="any"
                                disabled={isFormDisabled}
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
                                value={formField.value || ''}
                                onChange={e => formField.onChange(parseFloat(e.target.value) || 0)}
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
                        name={`items.${index}.itemAllocatedPayment`}
                        render={({ field: formField }) => (
                          <FormItem>
                            <FormLabel>Allocated Payment</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="Payment amount"
                                {...formField}
                                value={formField.value || ''}
                                onChange={e => formField.onChange(parseFloat(e.target.value) || 0)}
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
                        name={`items.${index}.itemPurchaseType`}
                        render={({ field: formField }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>Purchase Type</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={formField.onChange}
                                value={formField.value}
                                className="flex flex-col space-y-1"
                                disabled={isFormDisabled}
                              >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="For Sale" disabled={isFormDisabled}/>
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                    For Sale
                                  </FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="Business Use" disabled={isFormDisabled}/>
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                    Business Use
                                  </FormLabel>
                                </FormItem>
                              </RadioGroup>
                            </FormControl>
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
                            <Select onValueChange={formField.onChange} value={formField.value} disabled={isFormDisabled}>
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
                          <FormControl><Textarea placeholder="Notes for this specific item..." {...formField} value={formField.value || ''} disabled={isFormDisabled}/></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => remove(index)}
                        className="absolute top-4 right-4 h-7 w-7"
                        disabled={isFormDisabled}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove Item</span>
                      </Button>
                    )}
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                onClick={() => append(defaultItemValues)}
                className="mt-4"
                disabled={isFormDisabled}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                type="submit"
                disabled={isFormDisabled || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting || isFormDisabled ? (
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
