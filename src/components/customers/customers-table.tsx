
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Loader2, AlertTriangle, UsersIcon, DollarSign, ArrowUpDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SortKey = 'customerID' | 'name' | 'totalSpend';
type SortDirection = 'ascending' | 'descending';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
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

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CustomersTable() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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
        const salesQuery = query(collection(db, 'sales'));
        const salesSnapshot = await getDocs(salesQuery);
        const spendByCustomerId = new Map<string, number>();

        salesSnapshot.forEach((doc) => {
          const data = doc.data();
          const customerIdFromSale = data.customer_ID as string || '';
          const revenue = parseNumeric(data.Revenue || data.Price || data.totalAmount);

          if (customerIdFromSale && typeof revenue === 'number') {
            spendByCustomerId.set(
              customerIdFromSale,
              (spendByCustomerId.get(customerIdFromSale) || 0) + revenue
            );
          }
        });

        const customersQuery = query(collection(db, 'customers')); // Removed default sort here, will apply client-side
        const customersSnapshot = await getDocs(customersQuery);
        const fetchedCustomers: Customer[] = [];
        customersSnapshot.forEach((doc) => {
          const data = doc.data();
          const customerID = data.CustomerID as string || doc.id;
          
          fetchedCustomers.push({
            id: doc.id,
            customerID: customerID,
            name: data.CustomerName as string || 'N/A',
            email: data.Email as string || undefined,
            phone: data.Phone as string || undefined,
            shopifyCustomerId: data.ShopifyCustomerID as string || undefined,
            totalSpend: spendByCustomerId.get(customerID) || 0,
          });
        });
        setCustomers(fetchedCustomers);

      } catch (err: any) {
        console.error("Error fetching customer or sales data:", err);
        setError(`Failed to load data. ${err.message}. Check Firestore collections 'customers' and 'sales', and ensure fields like 'CustomerName', 'CustomerID' (customers) and 'customer_ID', 'Revenue'/'Price' (sales) exist.`);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const term = searchTerm.toLowerCase();
      return (
        customer.name.toLowerCase().includes(term) ||
        (customer.customerID?.toLowerCase() || '').includes(term) ||
        (customer.email?.toLowerCase() || '').includes(term) ||
        (customer.phone?.toLowerCase() || '').includes(term) ||
        (customer.totalSpend?.toString().includes(term))
      );
    });
  }, [customers, searchTerm]);

  const sortedCustomers = useMemo(() => {
    let sortableItems = [...filteredCustomers];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: string | number | undefined;
        let bValue: string | number | undefined;

        if (sortConfig.key === 'totalSpend') {
          aValue = a.totalSpend ?? 0;
          bValue = b.totalSpend ?? 0;
        } else {
          aValue = a[sortConfig.key] || '';
          bValue = b[sortConfig.key] || '';
        }
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          if (aValue.toLowerCase() < bValue.toLowerCase()) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValue.toLowerCase() > bValue.toLowerCase()) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredCustomers, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-3 w-3 opacity-30" />;
    }
    return sortConfig.direction === 'ascending' ? 
      <ArrowUpDown className="ml-2 h-3 w-3 transform rotate-180" /> : 
      <ArrowUpDown className="ml-2 h-3 w-3" />;
  };

  const handleRowClick = (customerId: string) => {
    // Future: router.push(`/customers/${customerId}`);
    alert(`Navigate to customer detail page for ID: ${customerId} (to be implemented)`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading customers and calculating spend...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="relative">
        <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search by Name, ID, Email, Phone, Total Spend..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-lg pl-10 pr-4 py-2 border-gray-300 rounded-full focus:ring-primary focus:border-primary"
        />
      </div>
       {sortedCustomers.length === 0 && !loading && (
        <div className="text-center py-10 text-muted-foreground">
          <UsersIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold">No Customers Found</h3>
          <p className="mt-1">
            {customers.length === 0 ? "Your 'customers' collection in Firestore might be empty or essential fields are missing (e.g., 'CustomerName', 'CustomerID'). Also ensure 'sales' collection is accessible with 'customer_ID' and 'Revenue'/'Price' fields." : "No customers match your search criteria."}
          </p>
        </div>
      )}
      {sortedCustomers.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <Table className="min-w-full divide-y divide-gray-200">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => requestSort('customerID')}
                >
                  <div className="flex items-center">
                    Customer ID {getSortIndicator('customerID')}
                  </div>
                </TableHead>
                <TableHead 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center">
                    Name {getSortIndicator('name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => requestSort('totalSpend')}
                >
                  <div className="flex items-center justify-end">
                    Total Spend {getSortIndicator('totalSpend')}
                  </div>
                </TableHead>
                <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</TableHead>
                <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</TableHead>
                <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white divide-y divide-gray-200">
              {sortedCustomers.map((customer) => (
                <TableRow 
                  key={customer.id} 
                  onClick={() => handleRowClick(customer.id)} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{customer.customerID || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{customer.name}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                    <div className="flex items-center justify-end">
                      <DollarSign className="h-4 w-4 text-green-500 mr-1 opacity-70" />
                      {formatCurrency(customer.totalSpend)}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{customer.email || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{customer.phone || 'N/A'}</TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRowClick(customer.id); }}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert(`Edit customer ${customer.id} (to be implemented)`); }}>
                          <Edit className="mr-2 h-4 w-4" /> Edit Customer
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); alert(`Delete customer ${customer.id} (to be implemented)`); }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Customer
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
