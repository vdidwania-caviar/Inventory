
import { OverviewCard } from '@/components/dashboard/overview-card';
import { SalesSummaryChart } from '@/components/dashboard/sales-summary-chart';
import { initialInventoryItems, mockSales, salesSummaryChartData } from '@/lib/mock-data'; // Keep mockSales for "Recent Sales" for now
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Package, DollarSign, TrendingUp, CalendarCheck, LineChart, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { getAdminDb } from '@/lib/firebase-admin';
import type { InventoryItem, Sale, InventoryMetric } from '@/lib/types';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { format, getYear, getMonth, startOfMonth, endOfMonth, startOfYear, endOfYear, isValid, parseISO } from 'date-fns';

// Helper function to format currency
function formatCurrencyForDisplay(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper function to parse numeric values robustly
function parseNumeric(value: any): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/[^0-9.-]+/g, "");
    if (cleanedValue === '') return undefined;
    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// Helper to safely parse date strings or Timestamps from Firestore
function safeParseDate(dateInput?: string | AdminTimestamp | { _seconds: number; _nanoseconds: number }): Date | null {
  if (!dateInput) return null;
  try {
    if (dateInput instanceof AdminTimestamp) {
      return dateInput.toDate();
    }
    if (typeof dateInput === 'string') {
      const parsed = parseISO(dateInput);
      return isValid(parsed) ? parsed : null;
    }
    if (typeof dateInput === 'object' && '_seconds' in dateInput && typeof dateInput._seconds === 'number') {
        return new Date(dateInput._seconds * 1000);
    }
    return null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  let totalActiveInventoryCount = 0;
  let totalActiveInventoryValue = 0;
  let totalActiveInventoryCost = 0;
  let totalYTDRevenue = 0;
  let totalCurrentMonthRevenue = 0;
  let dataFetchingError: string | null = null;

  const now = new Date();
  const currentYear = getYear(now);
  const currentMonth = getMonth(now); // 0-indexed

  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const currentYearStart = startOfYear(now);
  const currentYearEnd = endOfYear(now);

  try {
    const adminDb = getAdminDb();

    // Fetch Inventory Data
    const inventorySnapshot = await adminDb.collection('inventory').get();
    inventorySnapshot.forEach(doc => {
      const item = doc.data() as Omit<InventoryItem, 'id'>;
      if (item.status === 'Active') {
        totalActiveInventoryCount += (parseNumeric(item.quantity) || 0);
        totalActiveInventoryValue += (parseNumeric(item.price) || 0) * (parseNumeric(item.quantity) || 0);
        totalActiveInventoryCost += (parseNumeric(item.cost) || 0) * (parseNumeric(item.quantity) || 0);
      }
    });

    // Fetch Sales Data
    const salesSnapshot = await adminDb.collection('sales').get();
    salesSnapshot.forEach(doc => {
      const sale = doc.data() as Sale;
      const saleRevenue = parseNumeric(sale.Revenue || sale.Price);
      
      if (typeof saleRevenue === 'number') {
        const saleDate = safeParseDate(sale.Date as any);
        
        if (saleDate && isValid(saleDate)) {
          if (saleDate >= currentYearStart && saleDate <= currentYearEnd) {
            totalYTDRevenue += saleRevenue;
          }
          if (saleDate >= currentMonthStart && saleDate <= currentMonthEnd) {
            totalCurrentMonthRevenue += saleRevenue;
          }
        }
      }
    });

  } catch (error: any) {
    console.warn("DashboardPage: Error fetching data:", error.message, "Code:", error.code);
    dataFetchingError = `Failed to load dashboard data. Firestore error: ${error.message} (Code: ${error.code}). Please check Firestore setup and permissions.`;
  }

  const dynamicDashboardMetrics: InventoryMetric[] = [
    { title: 'Active Inventory Items', value: totalActiveInventoryCount.toString(), icon: Package, description: 'Total units of active products.' },
    { title: 'Est. Inventory Value (Retail)', value: formatCurrencyForDisplay(totalActiveInventoryValue), icon: DollarSign, description: 'Total retail value of active stock.' },
    { title: 'Est. Inventory Cost', value: formatCurrencyForDisplay(totalActiveInventoryCost), icon: DollarSign, description: 'Total cost of goods for active stock.' },
    { title: 'Revenue (Year-to-Date)', value: formatCurrencyForDisplay(totalYTDRevenue), icon: LineChart, description: `Total revenue since Jan 1, ${currentYear}.` },
    { title: 'Revenue (This Month)', value: formatCurrencyForDisplay(totalCurrentMonthRevenue), icon: CalendarCheck, description: `Total revenue in ${format(now, 'MMMM yyyy')}.` },
  ];

  // Recent Sales (still using mock for simplicity in this step)
  const recentSales = mockSales.slice(0, 5);
  const lowStockItems = initialInventoryItems.filter(item => item.status === 'Active' && item.quantity < 3 && item.quantity > 0).slice(0,3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold font-headline tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" /> Export Report
          </Button>
          <Button>
            <Upload className="mr-2 h-4 w-4" /> Import Data
          </Button>
        </div>
      </div>

      {dataFetchingError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard Data Error</AlertTitle>
          <AlertDescription>
            <p>{dataFetchingError}</p>
            <p className="mt-2">Live dashboard metrics may be inaccurate or display default values until this issue is resolved.</p>
            <p className="mt-1 text-xs">Check server logs for more technical details. Ensure Firestore is enabled for your project and the 'inventory' and 'sales' collections exist and are populated.</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {dynamicDashboardMetrics.map((metric) => (
          <OverviewCard key={metric.title} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SalesSummaryChart data={salesSummaryChartData} />
        
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline">Recent Sales</CardTitle>
            <CardDescription>Top 5 most recent sales transactions (mock data).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product(s)</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">
                      {sale.items.map(item => item.name).join(', ')} ({sale.items.reduce((acc, item) => acc + item.quantity, 0)} items)
                    </TableCell>
                    <TableCell>{sale.customerId || 'N/A'}</TableCell>
                    <TableCell className="text-right">${sale.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
             <Button variant="link" asChild className="mt-4 px-0">
              <Link href="/sales">View All Sales</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Low Stock Alerts</CardTitle>
          <CardDescription>Inventory items that are running low on stock (mock data).</CardDescription>
        </CardHeader>
        <CardContent>
          {lowStockItems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {lowStockItems.map(item => (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader className="p-4 flex-row items-center gap-4">
                     {item.images && item.images.length > 0 && (
                        <Image 
                            src={item.images[0]} 
                            alt={item.productTitle} 
                            width={60} 
                            height={60} 
                            className="rounded-md object-cover"
                            data-ai-hint={item.dataAiHint || 'product image'}
                        />
                    )}
                    <div>
                        <CardTitle className="text-base">{item.productTitle}</CardTitle>
                        <CardDescription>SKU: {item.sku}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <Badge variant={item.quantity < 2 ? "destructive" : "secondary"}>
                        Stock: {item.quantity}
                    </Badge>
                     <Button size="sm" variant="outline" className="mt-2 w-full" asChild>
                        <Link href={`/inventory#${item.id}`}>View Details</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No items are currently low on stock based on mock data.</p>
          )}
          <Button variant="link" asChild className="mt-4 px-0">
            <Link href="/inventory">Manage Inventory</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
