
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import type { Customer, Sale } from '@/lib/types';

// Helper to parse numeric values safely
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

// This function is not needed for the customer detail view as per the new logic,
// but we'll leave it for other potential uses.
export async function getCustomerById(id: string): Promise<Customer | null> {
  const customersRef = collection(db, 'customers');
  const q = query(customersRef, where('CustomerID', '==', id), limit(1));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    const customerSnap = querySnapshot.docs[0];
    return { id: customerSnap.id, ...customerSnap.data() } as Customer;
  }
  return null;
}

// This function will now correctly query sales by the 'customer_ID' or 'customerId' field
// and parse Quantity.
export async function getSalesByCustomerId(id: string): Promise<Sale[]> {
  const salesRef = collection(db, 'sales');

  // There may be inconsistencies in the customer ID field in your sales data.
  // To handle this, we will search for both 'customerId' and 'customer_ID'.
  const q1 = query(salesRef, where('customerId', '==', id));
  const q2 = query(salesRef, where('customer_ID', '==', id));

  const [snapshot1, snapshot2] = await Promise.all([
      getDocs(q1),
      getDocs(q2),
  ]);

  const salesMap = new Map<string, Sale>();

  const processDoc = (doc: any) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      Quantity: parseNumeric(data.Quantity), // Ensure Quantity is a number
      Price: parseNumeric(data.Price),       // Also good practice for Price
    } as Sale;
  };

  snapshot1.docs.forEach(doc => {
      salesMap.set(doc.id, processDoc(doc));
  });
  snapshot2.docs.forEach(doc => {
      if (!salesMap.has(doc.id)) {
          salesMap.set(doc.id, processDoc(doc));
      }
  });

  if (salesMap.size === 0) {
    console.warn(`No sales found with customerId or customer_ID matching: ${id}`);
    return [];
  }

  return Array.from(salesMap.values());
}
