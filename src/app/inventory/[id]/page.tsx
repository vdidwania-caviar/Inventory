
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import type { InventoryItem, Sale, SimplePurchase } from '@/lib/types';
import {
  Loader2,
  ArrowLeft,
  Edit,
  Trash2,
  ExternalLink,
  Package,
  Tag,
  CalendarDays,
  FileText,
  DollarSign,
  Info,
  ListChecks,
  Percent,
  Columns,
  GripVertical,
  BookText,
  Users,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function safeFormatDate(
  dateInput?: string | Timestamp | { seconds: number; nanoseconds: number },
): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return 'Invalid Date String';
      dateToFormat = parsedDate;
    } else if (
      dateInput &&
      typeof (dateInput as any).seconds === 'number' &&
      typeof (dateInput as any).nanoseconds === 'number'
    ) {
      dateToFormat = new Timestamp(
        (dateInput as any).seconds,
        (dateInput as any).nanoseconds,
      ).toDate();
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

function getFirstValidImage(
  images?: string[] | string,
  defaultPlaceholder = 'https://placehold.co/320x320.png',
) {
  if (typeof images === 'string') {
    const arr = images
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const first = arr.find(
      (img) =>
        typeof img === 'string' &&
        (img.startsWith('http://') || img.startsWith('https://')),
    );
    return first || defaultPlaceholder;
  }
  if (Array.isArray(images) && images.length > 0) {
    const first = images.find(
      (img) =>
        typeof img === 'string' &&
        (img.startsWith('http://') || img.startsWith('https://')),
    );
    return first || defaultPlaceholder;
  }
  return defaultPlaceholder;
}

export default function InventoryItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = typeof params.id === 'string' ? params.id : undefined;

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [associatedSales, setAssociatedSales] = useState<Sale[]>([]);
  const [associatedPurchases, setAssociatedPurchases] = useState<
    SimplePurchase[]
  >([]);
  const [loadingAssociatedData, setLoadingAssociatedData] = useState(true);

  useEffect(() => {
    if (!itemId) {
      setError('Item ID is missing.');
      setLoading(false);
      return;
    }

    async function fetchItem() {
      setLoading(true);
      setError(null);
      setLoadingAssociatedData(true); // Reset for new item fetch
      setAssociatedSales([]);
      setAssociatedPurchases([]);

      try {
        const itemDocRef = doc(db, 'inventory', itemId);
        const itemDocSnap = await getDoc(itemDocRef);

        if (itemDocSnap.exists()) {
          const rawData = itemDocSnap.data();
          const { tags: rawTags, ...restOfData } = rawData;

          let processedTags: string[] = [];
          if (rawTags) {
            if (Array.isArray(rawTags)) {
              processedTags = rawTags.filter(
                (tag) => typeof tag === 'string' && tag.trim() !== '',
              );
            } else if (typeof rawTags === 'string') {
              processedTags = rawTags
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag !== '');
            }
          }

          const convertTimestamp = (tsField: any): string | undefined => {
            if (!tsField) return undefined;
            if (tsField instanceof Timestamp)
              return tsField.toDate().toISOString();
            if (typeof tsField === 'string') {
              try {
                const parsed = parseISO(tsField);
                if (isValid(parsed)) return parsed.toISOString();
              } catch {
                /* ignore */
              }
              try {
                const directParsed = new Date(tsField);
                if (isValid(directParsed)) return directParsed.toISOString();
              } catch {
                /* ignore */
              }
              return tsField;
            }
            if (
              tsField &&
              typeof tsField.seconds === 'number' &&
              typeof tsField.nanoseconds === 'number'
            ) {
              return new Timestamp(
                tsField.seconds,
                tsField.nanoseconds,
              ).toDate().toISOString();
            }
            return undefined;
          };
          const fetchedItem = {
            id: itemDocSnap.id,
            ...restOfData,
            tags: processedTags,
            description: rawData.description || undefined,
            purchaseDate: convertTimestamp(rawData.purchaseDate),
            saleDate: convertTimestamp(rawData.saleDate),
            createdAt: convertTimestamp(rawData.createdAt),
            updatedAt: convertTimestamp(rawData.updatedAt),
            shopifyUpdatedAt: convertTimestamp(rawData.shopifyUpdatedAt),
          } as InventoryItem;

          setItem(fetchedItem);

          if (fetchedItem.sku) {
            const salesQuery = query(
              collection(db, 'sales'),
              where('SKU', '==', fetchedItem.sku),
              orderBy('Date', 'desc'),
            );
            const purchasesQuery = query(
              collection(db, 'purchases'),
              where('itemSku', '==', fetchedItem.sku),
              orderBy('purchaseDate', 'desc'),
            );

            const [salesSnapshot, purchasesSnapshot] = await Promise.all([
              getDocs(salesQuery),
              getDocs(purchasesQuery),
            ]);

            const salesData = salesSnapshot.docs.map((saleDoc) => {
                 const data = saleDoc.data();
                 return {
                    id: saleDoc.id,
                    ...data,
                    // Ensure dates and amounts are correctly parsed if needed, though types.ts implies they are strings/numbers
                    Date: data.Date, // Assuming Sale type handles conversion
                    totalAmount: typeof data.Price === 'number' ? data.Price : (typeof data.totalAmount === 'number' ? data.totalAmount : 0),
                    customerName: data.Customer,
                 } as Sale;
            });
            const purchasesData = purchasesSnapshot.docs.map((purchaseDoc) => ({
              id: purchaseDoc.id,
              ...purchaseDoc.data(),
            })) as SimplePurchase[];

            setAssociatedSales(salesData);
            setAssociatedPurchases(purchasesData);
          }
        } else {
          setError('Inventory item not found.');
        }
      } catch (err: any) {
        console.error('Error fetching item and associated data:', err);
        setError(`Failed to load item details: ${err.message}`);
      }
      setLoading(false);
      setLoadingAssociatedData(false);
    }

    fetchItem();
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#F8F9FA]">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#7EC8E3]" />
          <p className="ml-3 mt-3 text-lg text-[#5E606A]">
            Loading Item Details...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-[#F8F9FA] min-h-screen">
        <button
          onClick={() => router.push('/inventory')}
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

  if (!item) {
    return (
      <div className="p-8 bg-[#F8F9FA] min-h-screen">
        <button
          onClick={() => router.push('/inventory')}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition mb-4"
        >
          <ArrowLeft className="h-5 w-5 text-[#24282F]" />
        </button>
        <p className="text-center text-[#5E606A] py-16 text-lg">
          Inventory item data could not be loaded.
        </p>
      </div>
    );
  }

  const imageSrc = getFirstValidImage(
    item.images,
    `https://placehold.co/320x320.png?text=${encodeURIComponent(
      item.productTitle || 'Image',
    )}`,
  );
  const hintProductType = item.productType?.split(' ')[0] || '';
  const hintTitle =
    item.productTitle
      ?.split(' ')
      .slice(0, hintProductType ? 1 : 2)
      .join(' ') || '';
  let dataAiHintValue = (
    hintProductType
      ? hintProductType +
        (hintTitle &&
        hintProductType.toLowerCase() !== hintTitle.split(' ')[0].toLowerCase()
          ? ' ' + hintTitle.split(' ')[0]
          : '')
      : hintTitle
  ).trim();
  if (dataAiHintValue.split(' ').length > 2)
    dataAiHintValue = dataAiHintValue.split(' ').slice(0, 2).join(' ');
  dataAiHintValue = dataAiHintValue.toLowerCase() || 'product';

  let statusBadgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
    'secondary';
  const statusText = item.status || 'N/A';
  if (statusText.toLowerCase() === 'active' || statusText.toLowerCase() === 'available') {
    statusBadgeVariant = 'default';
  } else if (statusText.toLowerCase() === 'archived' || statusText.toLowerCase() === 'sold') {
    statusBadgeVariant = 'destructive';
  } else if (statusText.toLowerCase() === 'draft') {
    statusBadgeVariant = 'secondary';
  }

  function ConsignmentBadge({ consignment }: { consignment?: boolean }) {
    if (consignment === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300 ml-1">
          Yes
        </span>
      );
    }
    if (consignment === false) {
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
          onClick={() => router.push('/inventory')}
        >
          <ArrowLeft className="h-5 w-5 text-[#24282F]" />
          <span className="sr-only">Back to Inventory</span>
        </Button>
        <h1 className="text-xl md:text-2xl font-semibold text-[#24282F] flex-1 truncate min-w-0 break-words">
          {item.productTitle || 'Item Details'}
        </h1>
        <Button
          variant="outline"
          className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Edit item functionality to be implemented.')}
        >
          <Edit className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          className="rounded-full bg-[#EC3B4C] text-white font-medium hover:bg-red-600 transition flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 h-auto"
          onClick={() => alert('Delete item functionality to be implemented.')}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col items-center justify-start min-h-[300px]">
          <div className="text-[#5E606A] font-semibold mb-4 text-base w-full">
            Product Image
          </div>
          <Image
            src={imageSrc}
            alt={item.productTitle || 'Inventory item image'}
            width={320}
            height={320}
            className="rounded-xl object-contain border border-gray-200 bg-gray-50 w-full max-w-[300px] h-auto aspect-square"
            data-ai-hint={dataAiHintValue}
            priority
          />
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col">
          <div className="text-[#24282F] font-semibold text-lg mb-1">
            Item Details
          </div>
          <div className="text-[#5E606A] text-sm mb-4">
            Key details for this inventory item
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm flex-grow">
            {[
              { label: 'SKU', value: item.sku, icon: GripVertical },
              { label: 'Variant', value: item.variant, icon: Columns },
              {
                label: 'Price',
                value: formatCurrency(item.price),
                icon: DollarSign,
              },
              { label: 'Cost', value: formatCurrency(item.cost), icon: DollarSign },
              { label: 'Quantity', value: item.quantity ?? 'N/A', icon: Package },
              {
                label: 'Status',
                value: statusText,
                icon: ListChecks,
                isBadge: true,
                badgeVariant: statusBadgeVariant,
              },
              { label: 'Product Type', value: item.productType, icon: Info },
              { label: 'Vendor', value: item.vendor, icon: Info },
              {
                label: 'Purchase Date',
                value: safeFormatDate(item.purchaseDate),
                icon: CalendarDays,
              },
              { label: 'State', value: item.state, icon: Info },
            ].map(
              (detail) =>
                (detail.value &&
                  detail.value !== 'N/A' &&
                  String(detail.value).trim() !== '') ||
                typeof detail.value === 'boolean' ? (
                  <div key={detail.label} className="flex items-start min-w-0">
                    <detail.icon className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
                    <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                      {detail.label}:&nbsp;
                    </strong>
                    {detail.isBadge ? (
                      <Badge
                        variant={detail.badgeVariant}
                        className="ml-1 capitalize min-w-0 flex-1"
                      >
                        {String(detail.value)}
                      </Badge>
                    ) : (
                      <span className="text-[#5E606A] break-words min-w-0 flex-1">
                        {String(detail.value)}
                      </span>
                    )}
                  </div>
                ) : null,
            )}
            <div className="flex items-start min-w-0">
              <Percent className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                Consignment:&nbsp;
              </strong>
              <ConsignmentBadge
                consignment={
                  typeof item.consignment === 'boolean'
                    ? item.consignment
                    : undefined
                }
              />
            </div>
          </div>

          {item.tags && item.tags.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center mb-1.5">
                <Tag className="h-4 w-4 text-[#7EC8E3] mr-2 flex-shrink-0" />
                <strong className="text-[#24282F] font-medium">Tags:</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-[#F6F8FB] text-[#5E606A] font-medium text-xs px-2.5 py-1"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {item.description && (
            <div className="mt-4">
              <Separator className="my-3" />
              <div className="flex items-center mb-1.5">
                <BookText className="h-4 w-4 text-[#7EC8E3] mr-2 flex-shrink-0" />
                <strong className="text-[#24282F] font-medium">
                  Description:
                </strong>
              </div>
              <div
                className="text-[#5E606A] text-sm prose prose-sm max-w-none break-words leading-relaxed"
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            </div>
          )}

          <div className="mt-4">
            <Separator className="my-3" />
            <div className="flex items-center mb-1.5">
              <FileText className="h-4 w-4 text-[#7EC8E3] mr-2 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium">Notes:</strong>
            </div>
            <p className="text-[#5E606A] text-sm whitespace-pre-wrap break-words leading-relaxed">
              {item.notes || (
                <span className="italic text-gray-400">
                  No notes for this item.
                </span>
              )}
            </p>
          </div>

          {(item.productUrl || item.receiptUrl || item.coaUrl) && (
            <div className="mt-auto pt-6 flex flex-wrap gap-3">
              {item.productUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium"
                  asChild
                >
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> View Product Page
                  </a>
                </Button>
              )}
              {item.receiptUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium"
                  asChild
                >
                  <a
                    href={item.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> View Receipt
                  </a>
                </Button>
              )}
              {item.coaUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-gray-300 hover:bg-gray-100 text-[#24282F] font-medium"
                  asChild
                >
                  <a
                    href={item.coaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> View COA
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Associated Sales and Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Associated Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAssociatedData ? (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Sale Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Customer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {associatedSales.length > 0 ? (
                    associatedSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.Item || 'N/A'}</TableCell>
                        <TableCell>{safeFormatDate(sale.Date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(sale.totalAmount)}</TableCell>
                        <TableCell>{sale.customerName || 'N/A'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        No associated sales found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Associated Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAssociatedData ? (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead>Vendor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {associatedPurchases.length > 0 ? (
                    associatedPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{purchase.itemName || 'N/A'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(purchase.itemCost)}</TableCell>
                        <TableCell>
                          {safeFormatDate(purchase.purchaseDate)}
                        </TableCell>
                        <TableCell>{purchase.vendorName || 'N/A'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        No associated purchases found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>


      {(item.saleDate || item.customer || item.salePrice) && (
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 mb-6">
          <div className="text-[#24282F] font-semibold text-base mb-3">
            Sale Information (Directly on Item)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {[
              { label: 'Customer', value: item.customer, icon: Users },
              {
                label: 'Sale Date',
                value: safeFormatDate(item.saleDate),
                icon: CalendarDays,
              },
              {
                label: 'Sale Price',
                value: formatCurrency(item.salePrice),
                icon: DollarSign,
              },
            ].map(
              (detail) =>
                detail.value &&
                detail.value !== 'N/A' &&
                String(detail.value).trim() !== '' ? (
                  <div key={detail.label} className="flex items-start min-w-0">
                    <detail.icon className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
                    <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                      {detail.label}:&nbsp;
                    </strong>
                    <span className="text-[#5E606A] break-words min-w-0 flex-1">
                      {String(detail.value)}
                    </span>
                  </div>
                ) : null,
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-md p-6 md:p-8">
        <div className="text-[#24282F] font-semibold text-base mb-3">
          System Information
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div className="flex items-start min-w-0">
            <Package className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
            <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
              Item ID:&nbsp;
            </strong>
            <span className="text-[#5E606A] break-all min-w-0 flex-1">
              {item.id}
            </span>
          </div>
          <div className="flex items-start min-w-0">
            <CalendarDays className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
            <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
              Last Updated:&nbsp;
            </strong>
            <span className="text-[#5E606A] break-words min-w-0 flex-1">
              {safeFormatDate(item.updatedAt)}
            </span>
          </div>
          <div className="flex items-start min-w-0">
            <CalendarDays className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
            <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
              Created At:&nbsp;
            </strong>
            <span className="text-[#5E606A] break-words min-w-0 flex-1">
              {safeFormatDate(item.createdAt)}
            </span>
          </div>
          {item.shopifyVariantId && (
            <div className="flex items-start min-w-0">
              <Info className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                Shopify Variant ID:&nbsp;
              </strong>
              <span className="text-[#5E606A] break-all min-w-0 flex-1">
                {item.shopifyVariantId}
              </span>
            </div>
          )}
          {item.shopifyProductId && (
            <div className="flex items-start min-w-0">
              <Info className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                Shopify Product ID:&nbsp;
              </strong>
              <span className="text-[#5E606A] break-all min-w-0 flex-1">
                {item.shopifyProductId}
              </span>
            </div>
          )}
          {item.shopifyUpdatedAt && (
            <div className="flex items-start min-w-0">
              <CalendarDays className="h-4 w-4 text-[#7EC8E3] mr-2 mt-0.5 flex-shrink-0" />
              <strong className="text-[#24282F] font-medium whitespace-nowrap mr-1 flex-shrink-0">
                Shopify Updated:&nbsp;
              </strong>
              <span className="text-[#5E606A] break-words min-w-0 flex-1">
                {safeFormatDate(item.shopifyUpdatedAt)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
