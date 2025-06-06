
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
import { collection, doc, getDoc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, writeBatch, addDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Trash2, Loader2, Save, ArrowLeft } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import type { Vendor, SimplePurchase, PurchaseOrder as PurchaseOrderType } from '@/lib/types';
import { parseISO, isValid } from 'date-fns';

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const poId = typeof params.id === 'string' ? params.id : undefined; // Firestore Document ID of the PO
  const { toast } = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
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

  useEffect(() => {
    if (!poId) {
      toast({ variant: "destructive", title: "Error", description: "Purchase Order ID is missing." });
      router.push('/purchase-orders');
      return;
    }

    const fetchPurchaseOrder = async () => {
      setIsInitialLoading(true);
      try {
        const poDocRef = doc(db, 'purchaseOrders', poId);
        const poDocSnap = await getDoc(poDocRef);

        if (poDocSnap.exists()) {
          const data = poDocSnap.data() as PurchaseOrderType;
          
          let purchaseDateObj: Date = new Date();
          if (data.purchaseDate) {
            if (data.purchaseDate instanceof Timestamp) {
              purchaseDateObj = data.purchaseDate.toDate();
            } else if (typeof data.purchaseDate === 'string') {
              const parsed = parseISO(data.purchaseDate);
              if (isValid(parsed)) purchaseDateObj = parsed;
            }
          }
          
          form.reset({
            ...data,
            poNumber: data.poNumber || '', 
            purchaseDate: purchaseDateObj,
            receiptUrls: Array.isArray(data.receiptUrls) ? data.receiptUrls.join(', ') : (data.receiptUrls || ''),
            items: data.items.map(item => ({
                ...item,
                itemQuantity: item.itemQuantity || 0,
                itemCostPerUnit: item.itemCostPerUnit || 0,
                itemAllocatedPayment: item.itemAllocatedPayment || 0,
            })),
          });
        } else {
          toast({ variant: "destructive", title: "Error", description: "Purchase Order not found." });
          router.push('/purchase-orders');
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Failed to load Purchase Order data." });
        console.error("Error fetching PO for edit:", error);
        router.push('/purchase-orders');
      }
      setIsInitialLoading(false);
    };

    fetchPurchaseOrder();
  }, [poId, form, router, toast]);

  const handleAddNewVendor = async () => {
    if (!newVendorName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Vendor name cannot be empty." });
      return;
    }
    setIsAddingVendor(true);
    try {
      await addDoc(collection(db, 'vendors'), {
        name: newVendorName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Vendor Added", description: `Vendor "${newVendorName.trim()}" created.` });
      setNewVendorName('');
      await fetchVendors(); 
      form.setValue('vendorName', newVendorName.trim()); 
      setIsAddVendorDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add vendor." });
    }
    setIsAddingVendor(false);
  };

  const watchItems = form.watch('items');
  const isFormDisabled = form.formState.isSubmitting || isInitialLoading || isAddingVendor;

  async function onSubmit(values: PurchaseOrderFormValues) {
    if (!poId) { 
      setSubmitError("Purchase Order ID is missing. Cannot update.");
      toast({ variant: "destructive", title: "Error", description: "Critical data missing for update." });
      return;
    }
    setSubmitError(null);
    
    try {
      const receiptUrlsArray = values.receiptUrls
        ? values.receiptUrls.split(',').map(url => url.trim()).filter(Boolean)
        : [];

      const poDataToUpdate = {
        ...values, 
        poNumber: values.poNumber, // Use the PO number from the form (which is loaded and read-only)
        purchaseDate: Timestamp.fromDate(values.purchaseDate),
        items: values.items.map(item => {
          const lineItemTotal = (item.itemQuantity || 0) * (item.itemCostPerUnit || 0);
          const itemBalance = lineItemTotal - (item.itemAllocatedPayment || 0);
          return {
            ...item,
            itemSku: item.itemSku || '',
            itemNotes: item.itemNotes || '',
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
        updatedAt: serverTimestamp(),
        receiptUrls: receiptUrlsArray,
      };

      const poDocRef = doc(db, 'purchaseOrders', poId);
      const batch = writeBatch(db);

      batch.update(poDocRef, poDataToUpdate);

      const purchasesCollectionRef = collection(db, 'purchases');
      const q = query(purchasesCollectionRef, where("poId", "==", poId));
      const existingSimplePurchasesSnap = await getDocs(q);

      existingSimplePurchasesSnap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      for (const item of poDataToUpdate.items) {
        const simplePurchaseData: Omit<SimplePurchase, 'id'> = {
          poId: poId, 
          poNumber: poDataToUpdate.poNumber,
          itemName: item.itemName,
          itemSku: item.itemSku,
          itemCost: item.itemCostPerUnit,
          vendorName: poDataToUpdate.vendorName,
          purchaseDate: poDataToUpdate.purchaseDate.toDate().toISOString(),
          itemQuantity: item.itemQuantity,
          notes: item.itemNotes,
          productType: item.itemPurchaseType === 'For Sale' ? 'Retail Product' : 'Business Supply',
          receiptUrl: receiptUrlsArray.length > 0 ? receiptUrlsArray[0] : '',
          createdAt: serverTimestamp() as any, 
          updatedAt: serverTimestamp() as any,
        };
        const newSimplePurchaseRef = doc(collection(db, 'purchases'));
        batch.set(newSimplePurchaseRef, simplePurchaseData);

        if (item.itemPurchaseType === 'For Sale') {
          console.log(`Placeholder: Item "${item.itemName}" (SKU: ${item.itemSku}) would be checked/updated/pushed to Shopify as a draft.`);
          toast({ title: "Shopify Action (Placeholder)", description: `Item "${item.itemName}" processing for Shopify.`});
        }
      }
      
      await batch.commit();

      toast({
        title: 'Purchase Order Updated',
        description: `PO #${values.poNumber} has been successfully updated.`,
      });
      router.push(`/purchase-orders/${poId}`);
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to update purchase order or associated purchases. Please try again.');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update purchase order. Please try again.',
      });
    }
  }

  if (isInitialLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading Purchase Order for Editing...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.push(poId ? `/purchase-orders/${poId}` : '/purchase-orders')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to PO Detail
      </Button>
      <h1 className="text-3xl font-bold font-headline tracking-tight">Edit Purchase Order</h1>
      
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
                Modify the details for this purchase order. PO Number is not editable.
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
                      <Input {...field} value={field.value || ""} readOnly className="bg-muted"/>
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
                        onValueChange={field.onChange}
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
              <CardDescription>Add or modify items for this purchase order.</CardDescription>
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
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
