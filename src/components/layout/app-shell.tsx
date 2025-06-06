import React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link'; // Changed from NextLink and ensured standard import
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { SidebarNav } from './sidebar-nav';
import { UserNav } from './user-nav';
import { Button } from '@/components/ui/button';
import { Bell, Search } from 'lucide-react';
import { Input } from '../ui/input';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="p-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg text-primary">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-primary">
                <path d="M12.378 1.602a.75.75 0 00-.756 0L3.366 6.044a.75.75 0 00.378.966l8.25 3.043a.75.75 0 00.756 0l8.25-3.043a.75.75 0 00.378-.966L12.378 1.602zM3.75 7.906l7.5 2.77V14.25l-7.5-2.771V7.906zm8.25 2.77l7.5-2.77v3.574l-7.5 2.771V10.676zM3 15.75a.75.75 0 00.378.966l8.25 3.043a.75.75 0 00.756 0l8.25-3.043a.75.75 0 00.378-.966V18a.75.75 0 00-.75-.75h-15a.75.75 0 00-.75.75v-2.25z"/>
             </svg>
            <span className="font-headline">InventoryTest</span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter className="p-4 border-t">
          <UserNav />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="w-full flex-1">
            {/* Optional: Search or page title */}
             <form>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products..."
                  className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
                />
              </div>
            </form>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Toggle notifications</span>
          </Button>
        </header>
        <main className="flex-1 p-6 space-y-6 bg-background/50">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Removed custom Link component definition that was previously here
