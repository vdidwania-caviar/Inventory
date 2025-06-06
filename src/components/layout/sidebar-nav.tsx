
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Truck, 
  ShoppingBag, 
  BarChart3, 
  Users, 
  Building, 
  FileText, 
  Lightbulb,
  Store,
  CreditCard,
  FileSpreadsheet // Icon for Invoices
} from 'lucide-react';
import type { NavItem } from '@/lib/types';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Inventory', href: '/inventory', icon: Package },
  { title: 'Sales', href: '/sales', icon: ShoppingCart },
  { title: 'Shopify Sales', href: '/shopify-sales', icon: Store }, // New Item
  { title: 'Invoices', href: '/invoices', icon: FileSpreadsheet },
  { title: 'Purchase Orders', href: '/purchase-orders', icon: Truck },
  { title: 'Purchases', href: '/purchases', icon: ShoppingBag },
  { title: 'Payments', href: '/payments', icon: CreditCard },
  { title: 'Revenue', href: '/revenue', icon: BarChart3 },
  { title: 'Customers', href: '/customers', icon: Users },
  { title: 'Vendors', href: '/vendors', icon: Building },
  { title: 'Receipts', href: '/receipts', icon: FileText },
  { title: 'Shopify Products', href: '/shopify', icon: Store }, // Original Shopify page, renamed for clarity
  { title: 'AI Insights', href: '/ai-insights', icon: Lightbulb },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <Link href={item.href} passHref legacyBehavior>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
              className={cn(
                "justify-start",
                (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))) && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
              )}
              tooltip={{ children: item.title, side: 'right', align: 'center' }}
            >
              <a>
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.title}</span>
              </a>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
