
import type { InventoryItem, Sale, PurchaseOrder, Receipt, Customer, Vendor, InventoryMetric } from '@/lib/types';
import { ShoppingCart, Package, DollarSign, Users } from 'lucide-react';
import { formatISO, subDays } from 'date-fns';

const now = new Date();

export const mockVendors: Vendor[] = [
  { id: 'vendor-1', name: 'Hermès Paris', contactName: 'Jean Pierre', email: 'jp@hermes.fr', createdAt: formatISO(now), updatedAt: formatISO(now) },
  { id: 'vendor-2', name: 'Luxury Resellers Inc.', contactName: 'Sophie Dubois', email: 'sophie@luxuryresellers.com', createdAt: formatISO(now), updatedAt: formatISO(now) },
];

export const mockCustomers: Customer[] = [
  { id: 'cust-1', name: 'Alice Wonderland', email: 'alice@example.com', createdAt: formatISO(now), updatedAt: formatISO(now) },
  { id: 'cust-2', name: 'John Smith', email: 'john.smith@example.com', shopifyCustomerId: 'shopify-123', createdAt: formatISO(now), updatedAt: formatISO(now) },
];

export const initialInventoryItems: InventoryItem[] = [
  {
    id: 'HB001',
    sku: 'A12345',
    productTitle: 'Hermès Birkin 25',
    variant: 'Togo Gold',
    cost: 12000,
    price: 18000,
    quantity: 1,
    tags: ['hermes', 'birkin', 'gold', 'togo'],
    productType: 'Handbag',
    status: 'Active', // Updated
    productUrl: 'https://www.hermes.com/us/en/product/birkin-25-bag-H041344CK37/',
    images: ['https://placehold.co/100x100.png?text=Birkin+Front', 'https://placehold.co/100x100.png?text=Birkin+Side'],
    dataAiHint: 'luxury handbag',
    vendor: 'Hermès Paris',
    purchaseDate: formatISO(new Date('2024-04-01')),
    consignment: true,
    createdAt: formatISO(subDays(now, 30)),
    updatedAt: formatISO(now),
  },
  {
    id: 'HB002',
    sku: 'C67890',
    productTitle: 'Chanel Classic Flap',
    variant: 'Lambskin Black GHW',
    cost: 8000,
    price: 11500,
    quantity: 0, // Sold, but Shopify status might be 'Archived' or 'Active' (if restockable)
    tags: ['chanel', 'classic flap', 'lambskin', 'black'],
    productType: 'Handbag',
    status: 'Archived', // Updated (example, could be 'Active' if Shopify product is still active but OOS)
    productUrl: 'https://www.chanel.com/us/fashion/p/AS1112B04852NL283/classic-handbag-lambskin-gold-tone-metal-black/',
    images: ['https://placehold.co/100x100.png?text=Chanel+Front'],
    dataAiHint: 'designer purse',
    vendor: 'Luxury Resellers Inc.',
    purchaseDate: formatISO(new Date('2024-03-15')),
    consignment: false,
    customer: 'Alice Wonderland',
    saleDate: formatISO(new Date('2024-05-10')),
    state: 'CA',
    salePrice: 11500,
    receiptUrl: 'https://placehold.co/300x400.png?text=Sale+Receipt+HB002',
    createdAt: formatISO(subDays(now, 60)),
    updatedAt: formatISO(new Date('2024-05-10')),
  },
  {
    id: 'ACC001',
    sku: 'S54321',
    productTitle: 'Hermès Silk Scarf',
    variant: '90cm Brides de Gala',
    cost: 350,
    price: 550,
    quantity: 5,
    tags: ['hermes', 'scarf', 'silk', 'brides de gala'],
    productType: 'Accessory',
    status: 'Active', // Updated
    images: ['https://placehold.co/100x100.png?text=Scarf+Detail'],
    dataAiHint: 'silk scarf',
    vendor: 'Hermès Paris',
    purchaseDate: formatISO(new Date('2024-06-01')),
    consignment: false,
    createdAt: formatISO(subDays(now, 15)),
    updatedAt: formatISO(subDays(now, 2)),
  },
  {
    id: 'JEW001',
    sku: 'J98765',
    productTitle: 'Cartier Love Bracelet',
    variant: 'Yellow Gold',
    cost: 5000,
    price: 6800,
    quantity: 2,
    tags: ['cartier', 'love bracelet', 'yellow gold'],
    productType: 'Jewelry',
    status: 'Draft', // Updated
    images: ['https://placehold.co/100x100.png?text=Love+Bracelet'],
    dataAiHint: 'gold bracelet',
    vendor: 'Luxury Resellers Inc.',
    purchaseDate: formatISO(new Date('2024-02-10')),
    consignment: true,
    createdAt: formatISO(subDays(now, 90)),
    updatedAt: formatISO(subDays(now, 5)),
  }
];

export const mockSales: Sale[] = [
  {
    id: 'sale-1',
    items: [{ sku: 'C67890', name: 'Chanel Classic Flap', quantity: 1, pricePerUnit: 11500 }],
    totalAmount: 11500, saleDate: formatISO(new Date('2024-05-10T10:30:00Z')),
    customerId: 'cust-1', channel: 'Manual', createdAt: formatISO(new Date('2024-05-10'))
  },
];

// This mock data is for PurchaseOrder, not SimplePurchase
export const mockPurchaseOrders: PurchaseOrder[] = [
    // This data is not used by PurchasesTable which uses SimplePurchase
];


export const mockReceipts: Receipt[] = [
  {
    id: 'receipt-1', purchaseId: 'purchase-1', vendorId: 'vendor-1',
    receiptDate: formatISO(new Date('2024-04-01')), totalAmount: 12000.00,
    fileUrl: 'https://placehold.co/300x400.png?text=Birkin+Purchase', fileName: 'hermes_birkin_invoice.pdf',
    notes: 'Birkin 25 Togo Gold purchase', createdAt: formatISO(now)
  },
  {
    id: 'receipt-2', purchaseId: 'purchase-2', vendorId: 'vendor-1',
    receiptDate: formatISO(new Date('2024-06-01')), totalAmount: 3000.00,
    fileUrl: 'https://placehold.co/300x400.png?text=Scarf+Purchase', fileName: 'hermes_scarves_invoice.jpg',
    notes: 'Bulk order of silk scarves', createdAt: formatISO(now)
  }
];

export const dashboardMetrics: InventoryMetric[] = [
  { title: 'Total Est. Value (Price)', value: `$${initialInventoryItems.filter(i => i.status === 'Active' && i.price).reduce((sum, item) => sum + (item.price! * item.quantity), 0).toLocaleString()}`, icon: DollarSign, trend: '+12.5%', trendDirection: 'up', description: 'Based on current active stock' },
  { title: 'Total Est. Value (Cost)', value: `$${initialInventoryItems.filter(i => i.status === 'Active' && i.cost).reduce((sum, item) => sum + (item.cost! * item.quantity), 0).toLocaleString()}`, icon: DollarSign, trend: '+8.2%', trendDirection: 'up', description: 'Based on current active stock' },
  { title: 'Total Items', value: initialInventoryItems.reduce((sum, item) => sum + item.quantity, 0), icon: Package, trend: '2 new', trendDirection: 'neutral', description: 'All items in stock' },
  { title: 'Active Customers', value: mockCustomers.length, icon: Users, trend: '+1', trendDirection: 'up', description: 'New customers this month' },
];


export const salesSummaryChartData = [
  { name: 'Jan', totalSales: Math.floor(Math.random() * 20000) + 5000 },
  { name: 'Feb', totalSales: Math.floor(Math.random() * 20000) + 5000 },
  { name: 'Mar', totalSales: Math.floor(Math.random() * 20000) + 5000 },
  { name: 'Apr', totalSales: Math.floor(Math.random() * 20000) + 5000 },
  { name: 'May', totalSales: initialInventoryItems.filter(i => i.saleDate && new Date(i.saleDate).getMonth() === 4).reduce((sum, i) => sum + (i.salePrice || 0), 0) || Math.floor(Math.random() * 20000) + 5000 },
  { name: 'Jun', totalSales: Math.floor(Math.random() * 20000) + 5000 },
  { name: 'Jul', totalSales: Math.floor(Math.random() * 20000) + 5000 },
];

export function generateCsvFromSales(sales: Sale[]): string {
  const header = 'ID,SaleDate,TotalAmount,CustomerID,Channel,ItemSKU,ItemName,ItemQuantity,ItemPricePerUnit\n';
  let rows = '';
  sales.forEach(s => {
    s.items.forEach(item => {
      rows += `${s.id},${s.saleDate},${s.totalAmount},${s.customerId || ''},${s.channel},${item.sku},"${item.name}",${item.quantity},${item.pricePerUnit}\n`;
    });
  });
  return header + rows;
}
