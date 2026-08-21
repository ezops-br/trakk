'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:    "Sign-in was cancelled. Try again when you're ready.",
  csrf_mismatch:    'Something went wrong. Please try again.',
  state_mismatch:   'Invalid request. A security check failed — please try again.',
  auth_failed:      'Authentication failed. Please try signing in again.',
  account_conflict: 'Account conflict. This email is already registered with another account.',
};
const FALLBACK_ERROR = 'Sign-in failed. Please try again.';
const GOOGLE_AUTH_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/google`;

function LoginContent() {
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const errorCode = searchParams.get('error');
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR) : null;

  function handleSignIn() {
    setIsRedirecting(true);
    window.location.href = GOOGLE_AUTH_URL;
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

            {/* Google sign-in button — Google brand compliant */}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isRedirecting}
              aria-label="Sign in with Google"
              className="w-full h-10 flex items-center justify-center gap-3 rounded-badge border text-sm font-medium transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trakk-teal focus-visible:ring-offset-2 disabled:pointer-events-none google-sign-in-btn"
            >
              {isRedirecting ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Redirecting...
                </>
              ) : (
                <>
                  {/* Official Google G SVG — multicolor */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>

            {/* Error callout — only when errorMessage is non-null */}
            {errorMessage && (
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
                  {errorMessage}
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
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </>
  );
}
