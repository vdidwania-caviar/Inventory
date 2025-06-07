
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, Loader2, AlertTriangle, User, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Customer, Sale } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';

type SortDirection = 'asc' | 'desc';
type SortConfig = {
  key: 'name' | 'email' | 'totalSpend';
  direction: SortDirection;
} | null;

type DisplayCustomer = {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    totalSpend: number;
};

export function CustomersTable() {
  const [customers, setCustomers] = useState<DisplayCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return; 
    }
    if (!user) {
      setLoading(false);
      setError("Authentication check complete. No user is logged in.");
      return;
    }

    //
    // *** Admin UID Check ***
    //
    console.log("Authenticated User UID:", user.uid);
    //
    
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const salesSnapshot = await getDocs(collection(db, 'sales'));
        const salesList = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));

        const customersSnapshot = await getDocs(collection(db, 'customers'));
        const customersMap = new Map<string, Customer>();
        customersSnapshot.docs.forEach(doc => {
            customersMap.set(doc.id, { id: doc.id, ...doc.data() } as Customer);
        });
        
        const customerSpendData = new Map<string, { totalSpend: number; name: string; email: string; }>();

        for (const sale of salesList) {
            const customerId = sale.customerId || sale.customer_ID;
            if (!customerId) continue;

            let customerInfo = customerSpendData.get(customerId);
            if (!customerInfo) {
                const customerDetails = customersMap.get(customerId);
                customerInfo = {
                    totalSpend: 0,
                    name: customerDetails?.name || sale.Customer || 'Unknown Customer',
                    email: customerDetails?.email || ''
                };
            }
            
            customerInfo.totalSpend += sale.Price || 0;
            customerSpendData.set(customerId, customerInfo);
        }

        const displayList: DisplayCustomer[] = [];
        for (const [id, data] of customerSpendData.entries()) {
            const customerDetails = customersMap.get(id);
            displayList.push({
                id,
                name: data.name,
                email: data.email,
                totalSpend: data.totalSpend,
                avatarUrl: customerDetails?.avatarUrl
            });
        }
        
        setCustomers(displayList);

      } catch (err: any) {
        console.error("Error fetching customer data:", err);
        if (err.code === 'permission-denied') {
             setError("Permission Denied. Please check the UID in your browser console against the admin UID in your firestore.rules file.");
        } else {
             setError(`Failed to load data. ${err.message}`);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [user, authLoading]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    return customers.filter(customer =>
      (customer.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (customer.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [customers, searchTerm]);

  const sortedCustomers = useMemo(() => {
    let sortableItems = [...filteredCustomers];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredCustomers, sortConfig]);

  const requestSort = (key: 'name' | 'email' | 'totalSpend') => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: 'name' | 'email' | 'totalSpend') => {
    if (sortConfig?.key === key) {
      return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
    }
    return null;
  };

  const getInitials = (name?: string) => {
    if (!name) return '';
    const names = name.split(' ');
    return names.map((n) => n[0]).join('').toUpperCase();
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Authenticating and loading customers...</p>
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
      <Input
        placeholder="Search by name or email..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-xl"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('name')}>
                Name {getSortIndicator('name')}
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" onClick={() => requestSort('email')}>
                Email {getSortIndicator('email')}
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button variant="ghost" onClick={() => requestSort('totalSpend')}>
                Total Spend {getSortIndicator('totalSpend')}
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedCustomers.length > 0 ? (
            sortedCustomers.map((customer) => (
              <TableRow 
                key={customer.id} 
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                      <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{customer.name || 'N/A'}</span>
                  </div>
                </TableCell>
                <TableCell>{customer.email || 'N/A'}</TableCell>
                <TableCell className="text-right">${(customer.totalSpend || 0).toFixed(2)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold">No Customers Found</h3>
                <p>No customer data could be loaded from sales records.</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
