import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../../firebase/config';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          setError(err as Error);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: '#111', color: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <p>Authenticating (Anonymous)...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: '#111', color: 'white' }}>
        <div style={{ border: '1px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1.5rem', borderRadius: '0.5rem', maxWidth: '400px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Authentication Failed</h2>
          <p style={{ fontSize: '0.875rem' }}>{error.message}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>Please make sure Anonymous Auth is enabled in the Firebase Console.</p>
        </div>
      </div>
    );
  }

  // Pass user context or just render children
  return <>{children}</>;
}
