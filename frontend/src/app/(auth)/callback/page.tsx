'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import type { User } from '@/lib/types';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function verifySession() {
      try {
        await apiClient.get<User>('/api/v1/auth/me');
        router.push('/dashboard');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login?error=auth_failed');
        } else {
          router.push('/login?error=auth_failed');
        }
      }
    }

    verifySession();
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        role="progressbar"
        aria-label="Loading"
        aria-busy="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-trakk-accent border-t-transparent"
      />
      <p className="text-trakk-muted text-sm">Redirecting...</p>
    </div>
  );
}
