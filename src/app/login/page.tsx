'use client';

import { LoginForm } from '@/components/auth/login-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/'); // Redirect if already logged in
    }
  }, [user, isLoading, router]);

  if (isLoading || (!isLoading && user)) {
    // Show loading or null if redirecting to prevent form flash
    return null; 
  }

  return (
    <div className="flex min-h-[calc(100vh-theme(spacing.16))] flex-col items-center justify-center py-12">
      <LoginForm />
    </div>
  );
}
