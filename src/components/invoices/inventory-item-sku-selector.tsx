
'use client';

import * as React from 'react';
import Image from 'next/image';
import { Check, ChevronsUpDown, Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { InventoryItem } from '@/lib/types';

interface InventoryItemSkuSelectorProps {
  inventoryItems: InventoryItem[];
  value?: string; // Selected SKU
  onChange: (sku: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function getFirstValidImageSrc(images?: string[] | string, defaultPlaceholder = "https://placehold.co/40x40.png") {
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


export function InventoryItemSkuSelector({
  inventoryItems,
  value,
  onChange,
  disabled,
  placeholder = "Select SKU...",
}: InventoryItemSkuSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const selectedItem = inventoryItems.find((item) => item.sku === value);

  // Custom filter function for CMDK Command
  const filterFunction = (itemValue: string, search: string): number => {
    // itemValue in this context is the `value` prop of CommandItem, which is item.sku
    const item = inventoryItems.find(inv => inv.sku.toLowerCase() === itemValue.toLowerCase());
    if (!item) return 0; // Should not happen if inventoryItems is consistent

    const searchTerm = search.toLowerCase();
    const searchableText = `${item.sku} ${item.productTitle} ${item.variant || ''}`.toLowerCase();
    
    return searchableText.includes(searchTerm) ? 1 : 0;
  };


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedItem ? (
            <div className="flex items-center">
              <Image
                src={getFirstValidImageSrc(selectedItem.images)}
                alt={selectedItem.productTitle || 'Item image'}
                width={20}
                height={20}
                className="mr-2 h-5 w-5 rounded-sm object-cover"
                data-ai-hint={selectedItem.dataAiHint || "product"}
              />
              <span className="truncate">{selectedItem.sku} - {selectedItem.productTitle}</span>
            </div>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command filter={filterFunction}>
          <CommandInput
            placeholder="Search SKU or name..."
            className="h-9"
            icon={<SearchIcon className="h-4 w-4" />}
          />
          <CommandList>
            <CommandEmpty>No inventory item found.</CommandEmpty>
            <CommandGroup>
              {inventoryItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.sku} // CMDK uses this value for filtering with the custom filter
                  onSelect={(currentSku) => {
                    onChange(currentSku === value ? '' : currentSku);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center w-full">
                     <Image
                        src={getFirstValidImageSrc(item.images)}
                        alt={item.productTitle || 'Item image'}
                        width={24}
                        height={24}
                        className="mr-3 h-6 w-6 rounded-sm object-cover"
                        data-ai-hint={item.dataAiHint || "product"}
                      />
                    <div className="flex-1 overflow-hidden">
                        <div className="font-medium truncate">{item.productTitle}</div>
                        <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>
                    </div>
                  </div>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      value === item.sku ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
