
import { z } from 'zod';
import { PAYMENT_METHODS, TRANSACTION_TYPES } from './types';

export const PurchaseOrderItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required."),
  itemSku: z.string().optional(),
  itemQuantity: z.number().min(0.01, "Quantity must be greater than 0.").default(1),
  itemCostPerUnit: z.number().min(0, "Cost must be a positive number.").default(0),
  itemPurchaseType: z.enum(['For Sale', 'Business Use']).default('For Sale'),
  itemStatus: z.enum(['Pending', 'Received', 'Cancelled']).default('Pending'),
  itemAllocatedPayment: z.number().min(0, "Allocated payment must be positive.").optional().default(0),
  itemNotes: z.string().optional(),
  lineItemTotal: z.number().optional(), // Calculated display field
  itemBalance: z.number().optional(), // Calculated display field
});

export type PurchaseOrderItemFormValues = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderSchema = z.object({
  poNumber: z.string().optional(), // Auto-generated
  vendorName: z.string().min(1, "Vendor name is required."),
  vendorId: z.string().optional(),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  poStatus: z.enum(['Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled']).default('Draft'),
  items: z.array(PurchaseOrderItemSchema).min(1, "At least one item is required."),
  notes: z.string().optional(),
  receiptUrls: z.string().optional(), // Comma-separated URLs
  // Calculated fields (not directly on form, but part of the object)
  totalOrderAmount: z.number().optional(),
  totalAllocatedPayment: z.number().optional(),
  totalOrderBalance: z.number().optional(),
  createdAt: z.string().optional(), // ISO string from Firestore
  updatedAt: z.string().optional(), // ISO string from Firestore
});

export type PurchaseOrderFormValues = z.infer<typeof PurchaseOrderSchema>;

export const PaymentSchema = z.object({
  transactionType: z.enum(TRANSACTION_TYPES, {
    required_error: "Transaction type is required.",
  }),
  invoiceNumber: z.string().min(1, "Invoice/PO number is required."),
  referenceSku: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required.",
  }),
  method: z.enum(PAYMENT_METHODS, {
    required_error: "Payment method is required.",
  }),
  amount: z.number({invalid_type_error: "Amount must be a number."}).min(0.01, "Amount must be greater than 0.").optional(),
  person: z.string().optional(), // Customer or Vendor Name
  notes: z.string().optional(),
}).refine(data => data.amount !== undefined && data.amount > 0, {
    message: "Amount must be greater than 0.",
    path: ["amount"],
});

export type PaymentFormValues = z.infer<typeof PaymentSchema>;

// Invoice Schemas
export const InvoiceItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required."),
  itemSku: z.string().min(1, "SKU is required."), // Made SKU mandatory
  itemQuantity: z.number().min(0.01, "Quantity must be greater than 0.").default(1),
  itemPricePerUnit: z.number().min(0, "Price must be a positive number.").default(0),
  itemNotes: z.string().optional(),
  lineItemTotal: z.number().optional(), // Calculated for display
});

export type InvoiceItemFormValues = z.infer<typeof InvoiceItemSchema>;

export const InvoiceSchema = z.object({
  invoiceNumber: z.string().optional(), // Auto-generated
  invoiceDate: z.date({ required_error: "Invoice date is required." }),
  dueDate: z.date().optional(),
  customerId: z.string().optional(), // Firestore ID of the customer
  customerName: z.string().min(1, "Customer name is required."),
  items: z.array(InvoiceItemSchema).min(1, "At least one item is required."),
  invoiceStatus: z.enum(['Draft', 'Sent', 'Paid', 'Partially Paid', 'Overdue', 'Void']).default('Draft'),
  notes: z.string().optional(),
  terms: z.string().optional(),
  // Calculated fields (not directly on form, but part of the object)
  subtotal: z.number().optional(),
  taxAmount: z.number().min(0).optional().default(0),
  totalAmount: z.number().optional(),
  totalAllocatedPayment: z.number().optional(),
  totalBalance: z.number().optional(),
  createdAt: z.string().optional(), // ISO string from Firestore
  updatedAt: z.string().optional(), // ISO string from Firestore
});

export type InvoiceFormValues = z.infer<typeof InvoiceSchema>;
