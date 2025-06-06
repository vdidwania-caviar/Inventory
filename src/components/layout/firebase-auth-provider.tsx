
'use client';

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true });

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('FirebaseAuthProvider: useEffect - Component is mounting. Setting up onAuthStateChanged listener.');
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log('FirebaseAuthProvider: onAuthStateChanged - User IS signed in. UID:', firebaseUser.uid, 'Email:', firebaseUser.email);
        setUser(firebaseUser);
      } else {
        console.log('FirebaseAuthProvider: onAuthStateChanged - User IS signed out.');
        setUser(null);
      }
      setIsLoading(false);
      console.log('FirebaseAuthProvider: onAuthStateChanged - isLoading set to false.');
    }, (error) => {
      // This error callback for onAuthStateChanged is for unexpected errors in the listener itself,
      // not typically for auth failures like token expiry.
      console.error('FirebaseAuthProvider: onAuthStateChanged - Error callback triggered:', error);
      setUser(null);
      setIsLoading(false);
      console.error('FirebaseAuthProvider: onAuthStateChanged - isLoading set to false due to error.');
    });

    // Cleanup subscription on unmount
    return () => {
      console.log('FirebaseAuthProvider: useEffect - Component is unmounting. Unsubscribing from onAuthStateChanged.');
      unsubscribe();
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleanup on unmount

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen w-screen fixed inset-0 bg-background z-[200]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg text-foreground">Authenticating...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
