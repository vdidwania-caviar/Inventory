
'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ShopifyVariantDetail } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ExternalLink, Eye, Loader2, AlertTriangle, TagsIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

interface ShopifyProductsTableProps {
  products: ShopifyVariantDetail[];
  isLoading: boolean;
  error: string | null;
}

export function ShopifyProductsTable({ products, isLoading, error: parentError }: ShopifyProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = (products || []).filter(product =>
    (product.productTitle?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.productVendor?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.productType?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.productTags?.join(' ').toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.cost?.toString().toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (product.productStatus?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading Shopify products from cache...</p>
      </div>
    );
  }

  if (parentError && (!products || products.length === 0)) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Shopify Products from Cache</AlertTitle>
        <AlertDescription>{parentError}</AlertDescription>
      </Alert>
    );
  }
  
  if (!isLoading && !parentError && (!products || products.length === 0)) {
     return (
      <div className="text-center py-10 text-muted-foreground">
        <TagsIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold">No Shopify Products Found in Cache</h3>
        <p className="mt-1">The local cache of Shopify products is currently empty.</p>
        <p>Try clicking "Refresh Shopify Data" to fetch products from your store and populate the cache.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by Title, SKU, Vendor, Type, Status, Cost, Tags..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-xl"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Image</TableHead>
            <TableHead>Product Title</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProducts.map((product) => {
            const displayTitle = product.productTitle || 'N/A';
            
            const variantImageSrc = product.variantImage?.src;
            const productFirstImageSrc = product.productImages?.[0]?.src;
            const imageSrc = variantImageSrc || productFirstImageSrc || "https://placehold.co/64x64.png";
            const imageAlt = product.variantImage?.altText || product.productImages?.[0]?.altText || product.productTitle || 'Shopify product';

            const hintProductType = product.productType?.split(' ')[0] || '';
            const hintTitleWords = product.productTitle?.split(' ').slice(0, hintProductType ? 1 : 2).join(' ') || '';
            let dataAiHintValue = (hintProductType ? hintProductType : hintTitleWords).trim();
            if (hintProductType && hintTitleWords && hintProductType.toLowerCase() !== hintTitleWords.split(' ')[0].toLowerCase()) {
                 dataAiHintValue = (hintProductType + ' ' + hintTitleWords.split(' ')[0]).trim();
            }
            if (!dataAiHintValue) dataAiHintValue = 'product';
            if (dataAiHintValue.split(' ').length > 2) dataAiHintValue = dataAiHintValue.split(' ').slice(0,2).join(' ');


            let statusBadgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
            if (product.productStatus === 'ACTIVE') {
              statusBadgeVariant = 'default';
            } else if (product.productStatus === 'ARCHIVED') {
              statusBadgeVariant = 'destructive';
            } else if (product.productStatus === 'DRAFT') {
              statusBadgeVariant = 'secondary';
            }

            return (
            <TableRow key={product.shopifyVariantId}>
              <TableCell>
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  width={48}
                  height={48}
                  className="rounded-md object-cover aspect-square"
                  data-ai-hint={dataAiHintValue.toLowerCase()}
                />
              </TableCell>
              <TableCell className="font-medium">{displayTitle}</TableCell>
              <TableCell>{product.sku || 'N/A'}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant}>
                  {product.productStatus || 'N/A'}
                </Badge>
              </TableCell>
              <TableCell>{product.productVendor || 'N/A'}</TableCell>
              <TableCell>{product.productType || 'N/A'}</TableCell>
              <TableCell className="text-right">
                {typeof product.cost === 'number' ? `$${product.cost.toFixed(2)}` : 'N/A'}
              </TableCell>
              <TableCell className="text-right">
                {typeof product.price === 'number' ? `$${product.price.toFixed(2)}` : 'N/A'}
              </TableCell>
              <TableCell className="text-center">{product.inventoryQuantity ?? 'N/A'}</TableCell>
              <TableCell>
                {product.productTags && product.productTags.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-auto py-1 px-2">
                        <TagsIcon className="mr-1 h-3 w-3" /> {product.productTags.length}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Tags</DropdownMenuLabel>
                      {product.productTags.map(tag => <DropdownMenuItem key={tag} disabled>{tag}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : 'N/A'}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => alert('View Details: To be implemented. This could show a modal with full variant and product data.')}>
                      <Eye className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    {product.productHandle && process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN && (
                       <DropdownMenuItem asChild>
                        <a href={`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN}/products/${product.productHandle}`} target="_blank" rel="noopener noreferrer" className="flex items-center w-full">
                          <ExternalLink className="mr-2 h-4 w-4" /> View on Shopify
                        </a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )})}
        </TableBody>
      </Table>
    </div>
  );
}
