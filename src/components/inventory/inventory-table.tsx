
'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { InventoryItem } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Search, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { parseISO, isValid } from 'date-fns';

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return `$${amount.toFixed(2)}`;
}

function getFirstValidImage(images?: string[] | string, defaultPlaceholder = "https://placehold.co/80x80.png") {
  if (typeof images === 'string') {
    const arr = images.split(',').map(s => s.trim()).filter(Boolean);
    const first = arr.find(img => typeof img === "string" && (img.startsWith("http://") || img.startsWith("https://")));
    return first || defaultPlaceholder;
  }
  if (Array.isArray(images) && images.length > 0) {
    const first = images.find(img => typeof img === "string" && (img.startsWith("http://") || img.startsWith("https://")));
    return first || defaultPlaceholder;
  }
  return defaultPlaceholder;
}

const ITEMS_PER_PAGE = 25;

export function InventoryTable() {
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const q = query(collection(db, 'inventory'));
        const querySnapshot = await getDocs(q);
        const items: InventoryItem[] = [];
        querySnapshot.forEach((doc) => {
          const rawData = doc.data();
          
          const { tags: rawTags, ...restOfData } = rawData;
          let processedTags: string[] = [];
          if (rawTags) {
            if (Array.isArray(rawTags)) {
              processedTags = rawTags.filter(tag => typeof tag === 'string' && tag.trim() !== '');
            } else if (typeof rawTags === 'string') {
              processedTags = rawTags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            }
          }

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
          
          items.push({
            id: doc.id,
            ...restOfData,
            tags: processedTags,
            price: typeof rawData.price === 'number' ? rawData.price : parseFloat(String(rawData.price || '0')),
            cost: typeof rawData.cost === 'number' ? rawData.cost : parseFloat(String(rawData.cost || '0')),
            quantity: typeof rawData.quantity === 'number' ? rawData.quantity : parseInt(String(rawData.quantity || '0')),
            purchaseDate: convertTimestamp(rawData.purchaseDate),
            saleDate: convertTimestamp(rawData.saleDate),
            createdAt: convertTimestamp(rawData.createdAt),
            updatedAt: convertTimestamp(rawData.updatedAt),
            shopifyUpdatedAt: convertTimestamp(rawData.shopifyUpdatedAt),
          } as InventoryItem);
        });

        items.sort((a, b) => (a.productTitle || '').localeCompare(b.productTitle || ''));
        setAllInventoryItems(items);

      } catch (err: any) {
        console.error("InventoryTable: Error fetching inventory items:", err);
        setError("Failed to load inventory items. Please check Firestore connection, rules, and data integrity.");
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredInventoryItems = useMemo(() => {
    setCurrentPage(1); // Reset to first page on search
    if (!searchTerm) {
      return allInventoryItems;
    }
    const searchTermLower = searchTerm.toLowerCase();
    return allInventoryItems.filter(item =>
        (item.productTitle || '').toLowerCase().includes(searchTermLower) ||
        (item.variant || '').toLowerCase().includes(searchTermLower) ||
        (item.sku || '').toLowerCase().includes(searchTermLower) ||
        (item.status || '').toLowerCase().includes(searchTermLower) ||
        (item.price?.toString() || '').includes(searchTermLower) ||
        (item.cost?.toString() || '').includes(searchTermLower) ||
        (item.quantity?.toString() || '').includes(searchTermLower)
    );
  }, [searchTerm, allInventoryItems]);

  const totalPages = Math.ceil(filteredInventoryItems.length / ITEMS_PER_PAGE);
  const displayedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredInventoryItems.slice(startIndex, endIndex);
  }, [filteredInventoryItems, currentPage]);

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center py-10 text-[#5E606A]">
        <Loader2 className="h-8 w-8 animate-spin text-[#7EC8E3]" />
        <p className="ml-2">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4 mx-4 md:mx-6 lg:mx-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Inventory</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  const tableDisplayedColCount = 8;

  return (
    <div className="space-y-4 p-4 md:p-6 lg:p-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search by Title, Variant, SKU, Status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-lg pl-10 pr-4 py-2 border-gray-300 rounded-full focus:ring-[#7EC8E3] focus:border-[#7EC8E3]"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <Table className="min-w-full divide-y divide-gray-200">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Image</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Title</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variant</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</TableHead>
              <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white divide-y divide-gray-200">
            {displayedItems.length > 0 ? displayedItems.map((item) => {
              const imageSrc = getFirstValidImage(item.images, `https://placehold.co/120x120.png?text=${encodeURIComponent(item.productTitle?.[0] || 'P')}`);
              let statusBadgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
              const statusText = item.status || 'N/A';
              if (statusText.toLowerCase() === 'active' || statusText.toLowerCase() === 'available') {
                statusBadgeVariant = 'default';
              } else if (statusText.toLowerCase() === 'archived' || statusText.toLowerCase() === 'sold') {
                statusBadgeVariant = 'destructive';
              } else if (statusText.toLowerCase() === 'draft') {
                statusBadgeVariant = 'secondary';
              }
              
              const hintProductType = item.productType?.split(" ")[0] || "";
              const hintTitle = item.productTitle?.split(" ").slice(0, hintProductType ? 1:2).join(" ") || "";
              let dataAiHintValue = (hintProductType ? hintProductType + (hintTitle && hintProductType.toLowerCase() !== hintTitle.split(" ")[0].toLowerCase() ? " " + hintTitle.split(" ")[0] : "") : hintTitle).trim();
              if (dataAiHintValue.split(' ').length > 2) dataAiHintValue = dataAiHintValue.split(' ').slice(0,2).join(' ');
              dataAiHintValue = dataAiHintValue.toLowerCase() || 'product';

              return (
              <TableRow 
                key={item.id} 
                id={item.id} 
                onClick={() => router.push(`/inventory/${item.id}`)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <Image
                    src={imageSrc}
                    alt={item.productTitle || 'Inventory item'}
                    width={120}
                    height={120}
                    className="rounded-md object-cover aspect-square border border-gray-200"
                    data-ai-hint={dataAiHintValue}
                  />
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-normal break-words text-sm font-medium text-gray-900 max-w-[160px]">
                  <span style={{
                    display: 'inline-block',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    lineHeight: '1.3',
                    maxWidth: '160px',
                    whiteSpace: 'normal'
                  }}>
                    {item.productTitle}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.variant}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.sku}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <Badge variant={statusBadgeVariant} className="capitalize text-xs">
                    {statusText}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">{item.quantity}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(item.price)}</TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(item.cost)}</TableCell>
              </TableRow>
            )}) : (
              <TableRow>
                <TableCell colSpan={tableDisplayedColCount} className="text-center text-gray-500 py-10">
                  {allInventoryItems.length === 0 ? (
                     <>
                        <Package className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                        <p className="font-semibold text-lg">No Inventory Items Found</p>
                        <p className="text-sm">Your inventory collection in Firestore might be empty or data is not loading correctly.</p>
                        <p className="text-xs mt-1">Check Firestore data, collection name ('inventory'), and security rules.</p>
                    </>
                  ) : (
                    "No inventory items match your search criteria."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="rounded-full"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="rounded-full"
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
