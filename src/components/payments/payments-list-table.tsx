
'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Payment } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Loader2, AlertTriangle, CreditCard, ArrowUpDown } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { db } from '@/lib/firebase';
import { collection, query, orderBy as firestoreOrderBy, getDocs, Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

function safeFormatDate(dateInput?: string | Timestamp): string {
  if (!dateInput) return 'N/A';
  try {
    let dateToFormat: Date;
    if (dateInput instanceof Timestamp) {
      dateToFormat = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      const parsedDate = parseISO(dateInput);
      if (!isValid(parsedDate)) return 'Invalid Date String';
      dateToFormat = parsedDate;
    } else {
      return 'Invalid Date Object';
    }
    if (!isValid(dateToFormat)) return 'Invalid Date Value';
    return format(dateToFormat, 'PP');
  } catch {
    return 'Date Error';
  }
}

function formatCurrency(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return `$${amount.toFixed(2)}`;
}

type SortKey = 'paymentDate' | 'invoiceNumber' | 'amount';
type SortDirection = 'ascending' | 'descending';
interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function PaymentsListTable() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'paymentDate', direction: 'descending' });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const q = query(collection(db, 'payments'), firestoreOrderBy('paymentDate', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedPayments: Payment[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            invoiceNumber: String(data.invoiceNumber),
            referenceSku: data.referenceSku ? String(data.referenceSku) : undefined,
            paymentDate: data.paymentDate instanceof Timestamp ? data.paymentDate.toDate().toISOString() : String(data.paymentDate),
            method: data.method,
            amount: Number(data.amount),
            transactionType: data.transactionType,
            person: data.person ? String(data.person) : undefined,
            notes: data.notes ? String(data.notes) : undefined,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : String(data.createdAt),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : String(data.updatedAt),
          } as Payment;
        });
        setPayments(fetchedPayments);
      } catch (err: any) {
        setError(`Failed to load payments. ${err.message}`);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter(p =>
      p.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.referenceSku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      p.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.transactionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.person?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      p.amount.toString().includes(searchTerm)
    );
  }, [payments, searchTerm]);

  const sortedPayments = useMemo(() => {
    let sortableItems = [...filteredPayments];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key];
        let bValue: any = b[sortConfig.key];

        if (sortConfig.key === 'paymentDate') {
          aValue = a.paymentDate ? new Date(a.paymentDate) : new Date(0);
          bValue = b.paymentDate ? new Date(b.paymentDate) : new Date(0);
        }
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredPayments, sortConfig]);

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


  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading payments...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Payments</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  const colSpan = 8;

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search Payments..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-lg"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer hover:bg-muted/50 group" onClick={() => requestSort('invoiceNumber')}>
                <div className="flex items-center">Invoice/PO # {getSortIndicator('invoiceNumber')}</div>
            </TableHead>
            <TableHead>Ref. SKU</TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 group" onClick={() => requestSort('paymentDate')}>
                <div className="flex items-center">Payment Date {getSortIndicator('paymentDate')}</div>
            </TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right cursor-pointer hover:bg-muted/50 group" onClick={() => requestSort('amount')}>
                 <div className="flex items-center justify-end">Amount {getSortIndicator('amount')}</div>
            </TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Person</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPayments.length > 0 ? sortedPayments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="font-medium">{payment.invoiceNumber}</TableCell>
              <TableCell>{payment.referenceSku || 'N/A'}</TableCell>
              <TableCell>{safeFormatDate(payment.paymentDate)}</TableCell>
              <TableCell>{payment.method}</TableCell>
              <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
              <TableCell>
                <Badge variant={payment.transactionType === 'Sale' ? 'default' : 'secondary'}>
                  {payment.transactionType}
                </Badge>
              </TableCell>
              <TableCell>{payment.person || 'N/A'}</TableCell>
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
                    <DropdownMenuItem onClick={() => alert(`View payment ${payment.id} (to be implemented)`)}>
                      <Eye className="mr-2 h-4 w-4" /> View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => alert(`Edit payment ${payment.id} (to be implemented)`)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit Payment
                    </DropdownMenuItem>
                     <DropdownMenuItem 
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        onClick={() => alert(`Delete payment ${payment.id} (to be implemented)`)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Payment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
             <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
                {payments.length === 0 ? "No payments recorded yet." : "No payments match your search."}
                </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
