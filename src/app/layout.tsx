import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseAuthProvider } from '@/components/layout/firebase-auth-provider';

export const metadata: Metadata = {
  title: 'InventoryTest App',
  description: 'Manage your inventory and sales with AI insights.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <FirebaseAuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </FirebaseAuthProvider>
      </body>
    </html>
  );
}
