'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { Sale, SaleItem as SaleItemType } from '@/lib/types';
import { Loader2, ArrowLeft, Edit, Trash2, DollarSign, Users, CalendarDays, Hash, ShoppingCart, MapPin, FileText, Percent, Info, ListChecks } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

function safeFormatDate(dateInput?: string | Timestamp | { seconds: number; nanoseconds: number }): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return 'Invalid Date String';
      dateToFormat = parsedDate;
    } else if (dateInput && typeof (dateInput as any).seconds === 'number' && typeof (dateInput as any).nanoseconds === 'number') {
        dateToFormat = new Timestamp((dateInput as any).seconds, (dateInput as any).nanoseconds).toDate();
    } else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'MMM d, yyyy');
  } catch {
    return 'Date Error';
  }
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return `$${amount.toFixed(2)}`;
}

export default function SaleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const saleId = typeof params.id === 'string' ? params.id : undefined;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) {
      setError('Sale ID is missing.');
      setLoading(false);
      return;
    }

    async function fetchSale() {
      setLoading(true);
      setError(null);
      try {
        const saleDocRef = doc(db, 'sales', saleId);
        const saleDocSnap = await getDoc(saleDocRef);

        if (saleDocSnap.exists()) {
          const rawData = saleDocSnap.data();
          
          const convertTimestamp = (tsField: any): string | undefined => {
            if (!tsField) return undefined;
            if (tsField instanceof Timestamp) return tsField.toDate().toISOString();
            if (typeof tsField === 'string') {
                 try { 
                    const parsed = parseISO(tsField);
                    if (isValid(parsed)) return parsed.toISOString();
                 } catch {/* ignore */}
                 try {
                    const directParsed = new Date(tsField);
                    if (isValid(directParsed)) return directParsed.toISOString();
                 } catch {/* ignore */}
                 return tsField; 
            }
            if (tsField && typeof tsField.seconds === 'number' && typeof tsField.nanoseconds === 'number') {
                return new Timestamp(tsField.seconds, tsField.nanoseconds).toDate().toISOString();
            }
            return undefined;
          };

          const parseNumeric = (value: any): number | undefined => {
            if (value === undefined || value === null || String(value).trim() === '') return undefined;
            if (typeof value === 'number' && !isNaN(value)) return value;
            if (typeof value === 'string') {
              const cleanedValue = value.replace(/[^0-9.-]+/g, "");
              if (cleanedValue === '') return undefined;
              const parsed = parseFloat(cleanedValue);
              return isNaN(parsed) ? undefined : parsed;
            }
            return undefined;
          };

          setSale({
            id: saleDocSnap.id,
            ID: String(rawData.ID || ''),
            Invoice: String(rawData.Invoice || ''),
            Customer: String(rawData.Customer || ''),
            customer_ID: String(rawData.customer_ID || ''),
            Date: convertTimestamp(rawData.Date),
            Item: String(rawData.Item || ''),
            SKU: String(rawData.SKU || ''),
            Quantity: parseNumeric(rawData.Quantity),
            State: String(rawData.State || ''),
            Cost: parseNumeric(rawData.Cost),
            Price: parseNumeric(rawData.Price),
            Revenue: parseNumeric(rawData.Revenue),
            Profit: parseNumeric(rawData.Profit),
            Tax: parseNumeric(rawData.Tax),
            Taxable: typeof rawData.Taxable === 'boolean' ? rawData.Taxable : undefined,
            allocated_payment: parseNumeric(rawData.allocated_payment),
            Balance: parseNumeric(rawData.Balance),
            customer_type: String(rawData.customer_type || ''),
            notes: String(rawData.notes || ''),
            channel: rawData.channel as Sale['channel'],
            items: Array.isArray(rawData.items) ? rawData.items.map((item: any) => ({
                sku: String(item.sku || ''),
                name: String(item.name || ''),
                quantity: parseNumeric(item.quantity) || 0,
                pricePerUnit: parseNumeric(item.pricePerUnit) || 0,
            })) : [],
            createdAt: convertTimestamp(rawData.createdAt),
          } as Sale);
        } else {
          setError('Sale record not found.');
        }
      } catch (err: any) {
        console.error("Error fetching sale:", err);
        setError(`Failed to load sale details: ${err.message}`);
      }
      setLoading(false);
    }

    fetchSale();
  }, [saleId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#F8F9FA]">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#7EC8E3]" />
          <p className="ml-3 mt-3 text-lg text-[#5E606A]">Loading Sale Details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-[#F8F9FA] min-h-screen">
        <button
          onClick={() => router.push('/sales')}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition mb-4"
        >
          <ArrowLeft className="h-5 w-5 text-[#24282F]" />
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800 shadow-md">
          <div className="font-semibold text-lg mb-2">Error</div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="p-8 bg-[#F8F9FA] min-h-screen">
        <button
          onClick={() => router.push('/sales')}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition mb-4"
        >
          <ArrowLeft className="h-5 w-5 text-[#24282F]" />
        </button>
        <p className="text-center text-[#5E606A] py-16 text-lg">Sale data could not be loaded.</p>
      </div>
    );
  }

  const displayOrderId = sale.Invoice || sale.ID || sale.id;

  // Badge for Taxable
  function TaxableBadge({ taxable }: { taxable?: boolean }) {
    if (taxable === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300 ml-1">
          Yes
        </span>
      );
    }
    if (taxable === false) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300 ml-1">
          No
        </span>
      );
    }
    return <span className="ml-1">N/A</span>;
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8F9FA] min-h-screen">
      <div className="flex items-center gap-3 md:gap-4 mb-6">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full border-gray-300 hover:bg-gray-100 flex-shrink-0"
          onClick={() => router.push('/sales')}
        >
          <ArrowLeft className="h-5 w-5 text-[#24282F]" />
          <span className="sr-only">Back to Sales</span>
        </Button>
        <h1 className="text-xl md:text-2xl font-semibold text-[#24282F] flex-1 truncate min-w-0 break-words">
          Sale: {displayOrderId}
        </h1>
        <Button
          variant="outline"
          className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Edit sale functionality to be implemented.')}
        >
          <Edit className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          className="rounded-full bg-[#EC3B4C] text-white font-medium hover:bg-red-600 transition flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Delete sale functionality to be implemented.')}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Main Details */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col">
          <div className="text-[#24282F] font-semibold text-lg mb-1">Sale Details</div>
          <div className="text-[#5E606A] text-sm mb-4">Key details for this sale record</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm flex-grow">
            {[
              { label: 'Order/Invoice ID', value: displayOrderId, icon: Hash },
              { label: 'Sale Date', value: safeFormatDate(sale.Date), icon: CalendarDays },
              { label: 'Customer Name', value: sale.Customer, icon: Users },
              { label: 'Customer ID', value: sale.customer_ID, icon: Users },
              { label: 'Customer Type', value: sale.customer_type, icon: Info },
              { label: 'Sale Channel', value: sale.channel, icon: ShoppingCart },
              { label: 'Item Name', value: sale.Item, icon: ShoppingCart },
              { label: 'Item SKU', value: sale.SKU, icon: Hash },
              { label: 'Quantity Sold', value: sale.Quantity?.toString(), icon: ListChecks },
              { label: 'State/Location', value: sale.State, icon: MapPin }
            ].map(detail => (
              detail.value && String(detail.value).trim() !== '' && String(detail.value).trim() !== 'N/A' ? (
                <div key={detail.label} className="flex items-start min-w-0">
                  <detail.icon className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
                  <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">{detail.label}:&nbsp;</strong>
                  <span className="text-[#5E606A] break-words min-w-0 flex-1">{String(detail.value)}</span>
                </div>
              ) : null
            ))}
            {/* Taxable badge row */}
            <div className="flex items-start min-w-0">
              <FileText className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">Taxable:&nbsp;</strong>
              <TaxableBadge taxable={typeof sale.Taxable === 'boolean' ? sale.Taxable : undefined} />
            </div>
          </div>
        </div>
        {/* Financial Summary */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col">
          <div className="text-[#24282F] font-semibold text-lg mb-1">Financials</div>
          <div className="text-[#5E606A] text-sm mb-4">Sale financial summary</div>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Sale Price (Total)', value: formatCurrency(sale.Price), icon: DollarSign },
              { label: 'Cost of Goods Sold', value: formatCurrency(sale.Cost), icon: DollarSign },
              { label: 'Revenue', value: formatCurrency(sale.Revenue), icon: DollarSign },
              { label: 'Profit', value: formatCurrency(sale.Profit), icon: Percent },
              { label: 'Tax Applied', value: formatCurrency(sale.Tax), icon: FileText },
              { label: 'Allocated Payment', value: formatCurrency(sale.allocated_payment), icon: DollarSign },
              { label: 'Balance Due', value: formatCurrency(sale.Balance), icon: DollarSign, isBold: true, highlight: sale.Balance && sale.Balance > 0 ? 'text-[#EC3B4C]' : undefined },
            ].map(detail => (
              detail.value && String(detail.value).trim() !== '' && String(detail.value).trim() !== 'N/A' ? (
                <div key={detail.label} className="flex items-start min-w-0">
                  <detail.icon className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
                  <strong className={cn("text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0", detail.isBold && "font-bold")}>{detail.label}:&nbsp;</strong>
                  <span className={cn("text-[#5E606A] break-words min-w-0 flex-1", detail.highlight)}>{String(detail.value)}</span>
                </div>
              ) : null
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Items Table */}
      {sale.items && sale.items.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md mt-6 p-6 md:p-8">
          <div className="text-[#24282F] font-semibold text-base mb-3">Detailed Items in this Transaction</div>
          <div className="text-[#5E606A] text-sm mb-4">If this sale record groups multiple underlying items.</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-right">Price/Unit</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item, index) => (
                  <TableRow key={item.sku || index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.pricePerUnit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.quantity * item.pricePerUnit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Notes Section */}
      {sale.notes && (
        <div className="bg-white rounded-2xl shadow-md mt-6 p-6 md:p-8">
          <div className="text-[#24282F] font-semibold text-base mb-3">Notes</div>
          <p className="text-[#5E606A] text-sm whitespace-pre-wrap leading-relaxed">{sale.notes}</p>
        </div>
      )}

      {/* System Information */}
      <div className="bg-white rounded-2xl shadow-md mt-6 p-6 md:p-8">
        <div className="text-[#24282F] font-semibold text-base mb-3">System Information</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="flex items-start min-w-0">
            <Hash className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
            <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1">Record ID:&nbsp;</strong>
            <span className="text-[#5E606A] break-all min-w-0">{sale.id}</span>
          </div>
          {sale.createdAt && (
            <div className="flex items-start min-w-0">
              <CalendarDays className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1">Created At:&nbsp;</strong>
              <span className="text-[#5E606A] break-words min-w-0">{safeFormatDate(sale.createdAt)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}