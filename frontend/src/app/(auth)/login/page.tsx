'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import type { User } from '@/lib/types';

const FALLBACK_ERROR = 'Sign-in failed. Please try again.';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post<User>('/api/v1/auth/login', { email, password });
      // Hard navigation, not router.push: the dashboard layout is a Server
      // Component gated on the session cookie, and the App Router's client-side
      // Router Cache can replay a stale pre-login redirect-to-/login response
      // for up to 30s after a push, silently bouncing the user back with no
      // visible error. A full navigation always hits the server fresh.
      window.location.href = '/dashboard';
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || FALLBACK_ERROR);
      } else {
        setError(FALLBACK_ERROR);
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-trakk-bg">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none auth-bg-grid" aria-hidden="true" />
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none auth-bg-glow" aria-hidden="true" />

      {/* Card wrapper with entrance animation */}
      <div className="relative z-10 w-full max-w-[440px] login-card-enter">
        <div className="rounded-card bg-trakk-surface border border-trakk-border shadow-card overflow-hidden">

          {/* Gradient top accent bar — 2px, first child inside card */}
          <div
            className="h-0.5 w-full"
            style={{ background: 'var(--trakk-gradient)' }}
            aria-hidden="true"
          />

          {/* Card body */}
          <div className="p-8 sm:p-12 flex flex-col items-center">

            {/* Wordmark — T1: Barlow Condensed 900, gradient text */}
            <h1
              className="font-display font-black text-6xl tracking-tight leading-none bg-clip-text text-transparent"
              style={{ background: 'var(--trakk-gradient)', WebkitBackgroundClip: 'text' }}
            >
              TRAKK
            </h1>

            {/* Gradient divider */}
            <div
              className="w-10 h-0.5 my-3"
              style={{ background: 'var(--trakk-gradient)' }}
              aria-hidden="true"
            />

            {/* Eyebrow — M1: Space Mono 400, 10px, 3px tracking, uppercase, teal */}
            <p className="font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal">
              ISSUE TRACKING
            </p>

            {/* Headline — B1: Barlow 300, 18–20px, secondary color */}
            <p className="font-body font-light text-lg text-trakk-text-secondary text-center max-w-[280px] mt-3 mb-8">
              Issue tracking for teams that ship.
            </p>

            {/* Email + password sign-in form */}
            <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
              <div className="space-y-2 text-left">
                <label
                  htmlFor="email"
                  className="block text-[13px] font-body font-medium text-trakk-text-secondary"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 text-left">
                <label
                  htmlFor="password"
                  className="block text-[13px] font-body font-medium text-trakk-text-secondary"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-10"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            {/* Error callout — only when error is non-null */}
            {error && (
              <div
                role="alert"
                className="w-full mt-4 rounded-callout px-4 py-3 flex items-start gap-2 error-callout-enter"
                style={{
                  borderLeft: '3px solid var(--trakk-error)',
                  background: 'var(--trakk-surface-alt)',
                }}
              >
                <AlertCircle
                  size={16}
                  className="text-status-error shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="font-body font-normal text-[13px] text-trakk-text-secondary">
                  {error}
                </p>
              </div>
            )}

            {/* Footer */}
            <p className="font-body font-normal text-[13px] text-trakk-text-secondary text-center mt-6">
              By signing in, you agree to our{' '}
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-trakk-teal hover:underline"
              >
                Terms of Service
              </a>
              {' '}and{' '}
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-trakk-teal hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <title>Sign in — Trakk</title>
      <LoginContent />
    </>
  );
}
