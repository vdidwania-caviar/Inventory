
import type { LucideIcon } from 'lucide-react';

export interface InventoryItem {
  id: string; // Firestore document ID
  sku: string; // Primary key for matching with Shopify variants
  productTitle: string;
  variant?: string; // Can store concatenated selectedOptions from Shopify like "Color / Size"
  description?: string; // To store product description (HTML from Shopify)
  cost?: number;
  price?: number;
  quantity: number;
  tags?: string[];
  productType?: string;
  status?: 'Active' | 'Draft' | 'Archived' | string;
  productUrl?: string;
  images?: string[]; // Array of image URLs, Shopify variant image preferred
  vendor?: string;
  purchaseDate?: string; // ISO Date string
  consignment?: boolean;
  customer?: string; // If sold
  saleDate?: string; // ISO Date string, if sold
  state?: string; // Location/state, if relevant
  salePrice?: number; // If sold
  receiptUrl?: string;
  coaUrl?: string; // Certificate of Authenticity URL
  notes?: string;
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string - for local app updates
  dataAiHint?: string;

  // Shopify Sync Specific Fields
  shopifyVariantId?: string; // To store ProductVariant.id from Shopify
  shopifyProductId?: string;  // To store Product.id from Shopify
  shopifyUpdatedAt?: string;  // To store ProductVariant.updatedAt or Product.updatedAt from Shopify for sync logic
}

export interface SaleItem { // This is used in the mock data, might be deprecated if Invoices fully replace ad-hoc sales
  sku: string;
  name: string;
  quantity: number;
  pricePerUnit: number;
}

export interface Sale {
  id: string; // Firestore Document ID
  items: SaleItem[]; // Used by mock sales, may be less relevant for invoice-generated sales where each line is a Sale doc.
  totalAmount: number; // For mockSales, this is the grand total. For invoice-generated sales, this might be the line item total.
  saleDate?: string; // ISO Date string
  customerId?: string; // Firestore ID of the customer from 'customers' collection
  customerName?: string; // Denormalized customer name
  channel?: 'Shopify' | 'Manual' | 'Invoice' | 'Other';
  notes?: string;
  createdAt?: string; // ISO Date string
  ID?: string; // Original data import field for Sale ID
  Invoice?: string; // Original data import field for Invoice #. For new Invoices, this will be the generated Invoice.invoiceNumber
  Customer?: string; // Original data import field for Customer Name
  customer_ID?: string; // Original data import field for Customer ID (can be different from Firestore ID)
  Item?: string; // For invoice-generated sales, this will be InvoiceItem.itemName
  SKU?: string; // For invoice-generated sales, this will be InvoiceItem.itemSku
  Quantity?: number; // For invoice-generated sales, this will be InvoiceItem.itemQuantity
  Cost?: number; // Cost of goods for this sale item (optional)
  Price?: number; // For invoice-generated sales, this is total line item price (quantity * pricePerUnit)
  Revenue?: number; // Typically Price - Discounts (if any)
  Profit?: number; // Revenue - Cost
  Tax?: number;
  Taxable?: boolean;
  allocated_payment?: number;
  Balance?: number;
  State?: string; // Shipping state for tax purposes
  customer_type?: string;
  Date?: string | { seconds: number, nanoseconds: number }; // Original Date field (can be mixed type)

  // Link to parent Invoice if this Sale record was generated from an Invoice
  invoiceId?: string; // Firestore ID of the parent Invoice from 'invoices' collection
  // invoiceNumber is already covered by 'Invoice' field.
}


export interface PurchaseOrderItem {
  id?: string; // Not a Firestore ID, just for local array keying if needed
  itemName: string;
  itemSku?: string;
  itemQuantity: number;
  itemCostPerUnit: number;
  lineItemTotal?: number;
  itemPurchaseType: 'For Sale' | 'Business Use' | 'Unknown';
  itemStatus: 'Pending' | 'Ordered' | 'Shipped' | 'Partially Received' | 'Received' | 'Cancelled';
  itemAllocatedPayment?: number;
  itemBalance?: number;
  itemNotes?: string;
  inventoryItemId?: string;
  receivedQuantity?: number;
}

export interface PurchaseOrder {
  id: string; // Firestore Document ID
  poNumber: string;
  purchaseDate: string; // ISO Date string
  vendorName: string;
  vendorId?: string; // Firestore ID of the vendor from 'vendors' collection
  items: PurchaseOrderItem[];
  totalOrderAmount: number;
  totalAllocatedPayment: number;
  totalOrderBalance: number;
  poStatus: 'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Completed' | 'Cancelled';
  notes?: string;
  receiptUrls?: string[];
  tags?: string[];
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

export interface Receipt {
  id: string;
  purchaseId?: string; // Links to SimplePurchase ID
  poNumber?: string; // Redundant if linked via purchaseId which has poNumber
  vendorId?: string;
  receiptDate: string;
  totalAmount: number;
  fileUrl?: string;
  fileName?: string;
  notes?: string;
  createdAt?: string;
}

export interface Customer {
  id: string; // Firestore Document ID
  customerID?: string; // User-defined or legacy ID
  name: string;
  email?: string;
  phone?: string;
  shopifyCustomerId?: string; // Shopify's customer GID
  totalSpend?: number; // Calculated field, not directly stored or updated by payment form
  // address fields, etc. can be added
  createdAt?: string;
  updatedAt?: string;
}

export interface Vendor {
  id: string; // Firestore Document ID
  displayId?: string; // Generated like V0001
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
  linkedCustomerId?: string; // Firestore ID of a linked customer
}

export interface InventoryMetric {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  description?: string;
}

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
}

export interface ShopifyVariantDetail {
  shopifyVariantId: string;
  sku?: string;
  price?: number;
  inventoryQuantity?: number;
  variantUpdatedAt: string;
  variantImage?: { src: string, altText?: string };
  shopifyProductId: string;
  productTitle: string;
  productDescriptionHtml?: string;
  productVendor?: string;
  productType?: string;
  productTags?: string[];
  productHandle: string;
  productCreatedAt: string;
  productUpdatedAt: string;
  productImages?: { src: string, altText?: string }[];
  productStatus?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  cost?: number;
  selectedOptions?: { name: string, value: string }[];
}

export interface SimplePurchase {
  id: string; // Firestore Document ID
  poId?: string; // Firestore ID of the parent PurchaseOrder
  poNumber?: string;
  itemName?: string;
  itemSku?: string;
  itemCost?: number;
  vendorName?: string;
  purchaseDate?: string; // ISO Date string
  itemQuantity?: number;
  notes?: string;
  tags?: string[] | string;
  productType?: string; // 'Retail Product' or 'Business Supply'
  receiptUrl?: string;
  person?: string; // Who made the purchase
  balance?: number; // Unpaid amount for this specific purchase item
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
}

export interface SyncSummary {
  itemsAdded: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: string[];
  detailedChanges?: string[];
}

export interface ShopifySyncState { // Used for products
  id?: string;
  lastEndCursor?: string | null;
  lastSyncTimestamp?: string | null;
  lastFullSyncCompletionTimestamp?: string | null;
}

export const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Check', 'Exchange', 'Shopify', 'Venmo', 'Wire', 'Wise', 'Zelle', 'Other'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const TRANSACTION_TYPES = ['Sale', 'Purchase'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export interface Payment {
  id: string;
  invoiceNumber: string; // Sales Invoice #, PO #, or new Invoice #
  referenceSku?: string;
  paymentDate: string; // ISO string
  method: PaymentMethod;
  amount: number;
  transactionType: TransactionType;
  person?: string; // Customer or Vendor name
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SelectableOrder {
    id: string;
    displayLabel: string;
    balance: number;
}

export interface SelectablePerson {
    id: string;
    name: string;
}

// Invoice Specific Types
export interface InvoiceItem {
  id?: string; // For local array keying if needed
  itemName: string;
  itemSku?: string;
  itemQuantity: number;
  itemPricePerUnit: number;
  lineItemTotal?: number; // Calculated: itemQuantity * itemPricePerUnit
  itemNotes?: string;
  // Potentially: taxRate, discountAmount, etc.
}

export interface Invoice {
  id: string; // Firestore Document ID
  invoiceNumber: string; // e.g., I000001
  invoiceDate: string; // ISO Date string
  dueDate?: string; // ISO Date string
  customerId?: string; // Firestore ID of the customer from 'customers' collection
  customerName?: string; // Denormalized customer name
  items: InvoiceItem[];
  subtotal: number; // Sum of all lineItemTotal before tax/discounts
  taxAmount?: number;
  totalAmount: number; // Final amount due for the invoice
  totalAllocatedPayment: number; // Sum of payments made against this invoice
  totalBalance: number; // totalAmount - totalAllocatedPayment
  invoiceStatus: 'Draft' | 'Sent' | 'Paid' | 'Partially Paid' | 'Overdue' | 'Void';
  notes?: string;
  terms?: string;
  // paymentInstructions?: string;
  // shippingAddress?: string;
  // billingAddress?: string;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}


// --- Shopify Order Specific Types ---
export interface ShopifyMoneySet {
  shopMoney: {
    amount: string;
    currencyCode: string;
  };
  presentmentMoney?: {
    amount: string;
    currencyCode: string;
  };
}

export interface ShopifyAddress {
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  countryCode?: string | null;
  zip?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface ShopifyOrderCustomer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ShopifyOrderLineItemNode {
  id: string;
  title: string;
  variantTitle?: string | null;
  quantity: number;
  sku?: string | null;
  vendor?: string | null;
  originalTotalSet?: ShopifyMoneySet;
  discountedTotalSet?: ShopifyMoneySet;
}

export interface ShopifyOrderLineItemEdge {
  node: ShopifyOrderLineItemNode;
}

export interface ShopifyOrderTransactionNode {
  id: string;
  kind: string;
  status: string;
  amountSet: ShopifyMoneySet;
  gateway?: string | null;
  processedAt?: string; // ISO Date string
  errorCode?: string | null;
}

export interface ShopifyOrderTransactionEdge {
  node: ShopifyOrderTransactionNode;
}

export interface ShopifyOrder {
  id: string; // Shopify Order GID, e.g., "gid://shopify/Order/12345"
  name: string; // Order name/number like #1001
  email?: string | null;
  phone?: string | null;
  createdAt: string; // ISO Date string
  processedAt?: string | null; // ISO Date string
  updatedAt: string; // ISO Date string
  note?: string | null;
  tags?: string[];
  poNumber?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  customer?: ShopifyOrderCustomer | null;
  billingAddress?: ShopifyAddress | null;
  shippingAddress?: ShopifyAddress | null;
  currencyCode: string;
  totalPriceSet: ShopifyMoneySet;
  subtotalPriceSet?: ShopifyMoneySet | null;
  totalShippingPriceSet?: ShopifyMoneySet | null;
  totalTaxSet?: ShopifyMoneySet | null;
  totalDiscountsSet?: ShopifyMoneySet | null;
  totalRefundedSet?: ShopifyMoneySet | null; // Added from user spec
  lineItems: {
    edges: ShopifyOrderLineItemEdge[];
    pageInfo?: { // Added for potential future pagination handling directly in type
        hasNextPage: boolean;
        endCursor?: string | null;
    };
  };
  transactions?: {
    edges: ShopifyOrderTransactionEdge[];
     pageInfo?: {
        hasNextPage: boolean;
        endCursor?: string | null;
    };
  };
}

// For storing in Firestore cache. Firestore document ID will be the numeric part of shopifyOrder.id.
export interface ShopifyOrderCacheItem extends ShopifyOrder {
  // No extra fields needed for now; can store ShopifyOrder structure.
  // Timestamps are already strings. Nested objects are fine for Firestore.
}

// Sync state for Shopify Orders (similar to products)
export interface ShopifyOrderSyncState {
  id?: string; // Should be a fixed ID like 'shopifyOrdersSyncState'
  lastOrderEndCursor?: string | null;
  lastOrderSyncTimestamp?: string | null; // Timestamp of the last successfully synced order's update/creation
  lastFullOrderSyncCompletionTimestamp?: string | null; // Timestamp of the last full sync completion
}
