'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import type { User } from '@/lib/types';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<User>('/api/v1/auth/me');
      setUser(data);
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status === 401) {
        setError(null);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // best-effort — redirect regardless
    }
    router.push('/login');
  }, [router]);

  const refetch = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  return { user, loading, error, logout, refetch };
}
