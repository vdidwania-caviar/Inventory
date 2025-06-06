
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Vendor } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, BuildingIcon, Link as LinkIcon, Edit, Trash2, Loader2, AlertTriangle, ArrowUpDown, Search, Eye } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, orderBy as firestoreOrderBy, Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { format, parseISO, isValid } from 'date-fns';

type SortKey = 'name' | 'displayId'; // Changed 'id' to 'displayId'
type SortDirection = 'ascending' | 'descending';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

function safeFormatDate(dateInput?: string | { seconds: number; nanoseconds: number } | Timestamp): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return 'Invalid Date String';
      dateToFormat = parsedDate;
    } else if (typeof dateInput === 'object' && 'seconds' in dateInput && typeof dateInput.seconds === 'number') {
      dateToFormat = new Timestamp(dateInput.seconds, dateInput.nanoseconds || 0).toDate();
    } else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'PP'); // e.g., Jul 25, 2024
  } catch {
    return 'Date Error';
  }
}

export function VendorsTable() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'name', direction: 'ascending' });
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Data is fetched sorted by name initially
        const vendorsQuery = query(collection(db, 'vendors'), firestoreOrderBy('name'));
        const vendorsSnapshot = await getDocs(vendorsQuery);
        const fetchedVendors: Vendor[] = vendorsSnapshot.docs.map((doc, index) => {
          const data = doc.data();
          return {
            id: doc.id,
            displayId: `V${String(index + 1).padStart(4, '0')}`, // Assign displayId based on initial sort order
            name: data.name as string || 'N/A',
            contactName: data.contactName as string || undefined,
            email: data.email as string || undefined,
            phone: data.phone as string || undefined,
            address: data.address as string || undefined,
            createdAt: data.createdAt ? safeFormatDate(data.createdAt) : undefined,
            updatedAt: data.updatedAt ? safeFormatDate(data.updatedAt) : undefined,
            linkedCustomerId: data.linkedCustomerId as string || undefined,
          };
        });
        setVendors(fetchedVendors);
      } catch (err: any) {
        console.error("Error fetching vendors:", err);
        setError(`Failed to load vendors. ${err.message}. Check Firestore collection 'vendors' and ensure fields are correctly named (e.g., 'name').`);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      const term = searchTerm.toLowerCase();
      return (
        (vendor.displayId?.toLowerCase() || '').includes(term) ||
        vendor.name.toLowerCase().includes(term) ||
        (vendor.id.toLowerCase() || '').includes(term) || // Keep searching by actual ID if needed
        (vendor.contactName?.toLowerCase() || '').includes(term) ||
        (vendor.email?.toLowerCase() || '').includes(term) ||
        (vendor.phone?.toLowerCase() || '').includes(term)
      );
    });
  }, [vendors, searchTerm]);

  const sortedVendors = useMemo(() => {
    let sortableItems = [...filteredVendors];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        // Use 'displayId' or 'name' for sorting, ensuring they exist
        const aValue = (a[sortConfig.key] || '').toLowerCase();
        const bValue = (b[sortConfig.key] || '').toLowerCase();

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredVendors, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30 group-hover:opacity-100" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <ArrowUpDown className="ml-2 h-3 w-3 transform rotate-180 text-primary" /> : 
      <ArrowUpDown className="ml-2 h-3 w-3 text-primary" />;
  };

  const handleRowClick = (vendorId: string) => {
    // Future: router.push(`/vendors/${vendorId}`);
    alert(`Navigate to vendor detail page for ID: ${vendorId} (to be implemented)`);
  };

  const handleLinkToCustomer = (vendorId: string, vendorName: string) => {
    // Placeholder for actual linking logic
    alert(`Link vendor "${vendorName}" (ID: ${vendorId}) to a customer. (Functionality to be implemented)`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading vendors...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Vendors</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search by Name, ID, Contact, Email, Phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-lg pl-10 pr-4 py-2 border-input rounded-full focus:ring-primary focus:border-primary"
        />
      </div>
       {sortedVendors.length === 0 && !loading && (
        <div className="text-center py-10 text-muted-foreground">
          <BuildingIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold">No Vendors Found</h3>
          <p className="mt-1">
            {vendors.length === 0 ? "Your 'vendors' collection in Firestore might be empty or essential fields are missing (e.g., 'name')." : "No vendors match your search criteria."}
          </p>
        </div>
      )}
      {sortedVendors.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="min-w-full divide-y divide-border">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead 
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 group"
                  onClick={() => requestSort('displayId')}
                >
                  <div className="flex items-center">
                    Vendor ID {getSortIndicator('displayId')}
                  </div>
                </TableHead>
                <TableHead 
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 group"
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center">
                    Name {getSortIndicator('name')}
                  </div>
                </TableHead>
                <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</TableHead>
                <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</TableHead>
                <TableHead className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</TableHead>
                <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-background divide-y divide-border">
              {sortedVendors.map((vendor) => (
                <TableRow 
                  key={vendor.id} 
                  onClick={() => handleRowClick(vendor.id)} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm font-medium text-foreground">{vendor.displayId}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{vendor.name}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{vendor.contactName || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{vendor.email || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{vendor.phone || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRowClick(vendor.id); }}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert(`Edit vendor ${vendor.id} (to be implemented)`); }}>
                          <Edit className="mr-2 h-4 w-4" /> Edit Vendor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleLinkToCustomer(vendor.id, vendor.name); }}>
                          <LinkIcon className="mr-2 h-4 w-4" /> Link to Customer
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); alert(`Delete vendor ${vendor.id} (to be implemented)`); }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Vendor
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
