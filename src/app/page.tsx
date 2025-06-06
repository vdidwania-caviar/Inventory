import { OverviewCard } from '@/components/dashboard/overview-card';
import { SalesSummaryChart } from '@/components/dashboard/sales-summary-chart';
import { Button } from '@/components/ui/button';
import { Download, Upload, Package, DollarSign, LineChart, CalendarCheck, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAdminDb } from '@/lib/firebase-admin';
import type { InventoryItem, Sale, InventoryMetric } from '@/lib/types';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { format, getYear, getMonth, startOfMonth, endOfMonth, startOfYear, endOfYear, isValid, parseISO } from 'date-fns';

// --- Utility Functions ---
function formatCurrencyForDisplay(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
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
function safeParseDate(
  dateInput?: string | AdminTimestamp | { _seconds: number; _nanoseconds: number }
): Date | null {
  if (!dateInput) return null;
  try {
    if (dateInput instanceof AdminTimestamp) {
      return dateInput.toDate();
    }
    if (
      typeof dateInput === 'object' &&
      '_seconds' in dateInput &&
      typeof dateInput._seconds === 'number'
    ) {
      return new Date(dateInput._seconds * 1000);
    }
    if (typeof dateInput === 'string') {
      let parsed = parseISO(dateInput);
      if (isValid(parsed)) return parsed;
      const match = dateInput.match(
        /^([A-Za-z]+ \d{1,2}, \d{4}) at (\d{1,2}:\d{2}:\d{2} (?:AM|PM)) UTC([+-]?\d+)?$/
      );
      if (match) {
        const [_, datePart, timePart, offset] = match;
        const dateString = `${datePart} ${timePart} GMT${offset || ''}`;
        const asDate = new Date(dateString);
        if (isValid(asDate)) return asDate;
      }
      parsed = new Date(dateInput);
      if (isValid(parsed)) return parsed;
    }
    return null;
  } catch (err) {
    console.error('Date parse failed:', dateInput, err);
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

  // --- Sales Summary Chart Data ---
  const now = new Date();
  const currentYear = getYear(now);
  const currentMonth = getMonth(now); // 0-indexed

  // 7 months: [oldest,...,current]
  const chartMonths: { year: number; month: number; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    chartMonths.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: format(d, 'MMM'),
    });
  }
  const chartData: number[] = Array(chartMonths.length).fill(0);

  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const currentYearStart = startOfYear(now);
  const currentYearEnd = endOfYear(now);

  try {
    const adminDb = getAdminDb();

    // --- Inventory Data ---
    const inventorySnapshot = await adminDb.collection('inventory').get();
    inventorySnapshot.forEach(doc => {
      const item = doc.data() as Omit<InventoryItem, 'id'>;
      if (item.status === 'Active') {
        totalActiveInventoryCount += (parseNumeric(item.quantity) || 0);
        totalActiveInventoryValue += (parseNumeric(item.price) || 0) * (parseNumeric(item.quantity) || 0);
        totalActiveInventoryCost += (parseNumeric(item.cost) || 0) * (parseNumeric(item.quantity) || 0);
      }
    });

    // --- Sales Data ---
    const salesSnapshot = await adminDb.collection('sales').get();
    salesSnapshot.forEach(doc => {
      const sale = doc.data() as Sale;
      const saleRevenue = parseNumeric(sale.Revenue || sale.Price);
      const saleDate = safeParseDate(sale.Date as any);

      if (typeof saleRevenue === 'number' && saleDate && isValid(saleDate)) {
        // CHART: Find the correct index for the sale's month/year
        for (let i = 0; i < chartMonths.length; i++) {
          if (
            getYear(saleDate) === chartMonths[i].year &&
            getMonth(saleDate) === chartMonths[i].month
          ) {
            chartData[i] += saleRevenue;
            break;
          }
        }
        // -- Year-To-Date Revenue --
        if (saleDate >= currentYearStart && saleDate <= currentYearEnd) {
          totalYTDRevenue += saleRevenue;
        }
        // -- This Month Revenue --
        if (saleDate >= currentMonthStart && saleDate <= currentMonthEnd) {
          totalCurrentMonthRevenue += saleRevenue;
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

  // Log chart data in the correct structure
  console.log("DASHBOARD CHART DATA", chartMonths.map((m, idx) => ({
    name: m.label,
    totalSales: chartData[idx],
  })));

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

      {/* --- SALES SUMMARY CHART --- */}
      <div className="grid gap-6 md:grid-cols-1">
        <SalesSummaryChart
          data={chartMonths.map((m, idx) => ({
            name: m.label,
            totalSales: chartData[idx],  // This is the important fix!
          }))}
        />
        {chartData.every(val => val === 0) && (
          <div className="text-center text-gray-400 py-10">
            No sales data found for the last 7 months.
          </div>
        )}
      </div>
    </div>
  );
}