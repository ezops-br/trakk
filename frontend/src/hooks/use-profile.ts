'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/lib/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface UseProfileReturn {
  profile: User | null;
  loading: boolean;
  error: string | null;
  updateDisplayName: (name: string) => Promise<void>;
  uploadAvatar: (blob: Blob, filename: string) => Promise<void>;
  removeAvatar: () => Promise<void>;
  disconnectGoogle: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<User>('/api/v1/auth/me')
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDisplayName = useCallback(
    async (name: string) => {
      if (!profile) return;
      const previous = profile.displayName;
      // Optimistic update
      setProfile((prev) => (prev ? { ...prev, displayName: name } : prev));
      try {
        const updated = await apiClient.patch<User>('/api/v1/auth/me', { displayName: name });
        setProfile(updated);
      } catch (err) {
        // Rollback on failure
        setProfile((prev) => (prev ? { ...prev, displayName: previous } : prev));
        throw err;
      }
    },
    [profile],
  );

  const uploadAvatar = useCallback(
    async (blob: Blob, filename: string) => {
      const formData = new FormData();
      formData.append('avatar', blob, filename);

      const res = await fetch(`${BASE_URL}/api/v1/auth/me/avatar`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        let message = 'Avatar upload failed';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(message);
      }

      const data = (await res.json()) as { avatarUrl: string };
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
    },
    [],
  );

  const removeAvatar = useCallback(async () => {
    const updated = await apiClient.del<User>('/api/v1/auth/me/avatar');
    setProfile(updated);
  }, []);

  const disconnectGoogle = useCallback(async () => {
    await apiClient.post('/api/v1/auth/google/disconnect');
    router.push('/login');
  }, [router]);

  const deleteAccount = useCallback(async () => {
    await apiClient.del('/api/v1/auth/me');
    router.push('/login');
  }, [router]);

  return {
    profile,
    loading,
    error,
    updateDisplayName,
    uploadAvatar,
    removeAvatar,
    disconnectGoogle,
    deleteAccount,
  };
}
