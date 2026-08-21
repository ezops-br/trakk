import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock next/navigation before importing the component
const mockGet = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

// window.location.href assignment must be writable
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

import LoginPage from './page';

describe('LoginPage — redesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // default: no error query param
    window.location.href = '';
  });

  // --- Brand & copy ---

  it('renders "TRAKK" or "Trakk" as an h1 heading', () => {
    render(<LoginPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/trakk/i);
  });

  it('renders the tagline "Issue tracking for teams that ship"', () => {
    render(<LoginPage />);

    expect(
      screen.getByText(/issue tracking for teams that ship/i)
    ).toBeInTheDocument();
  });

  it('renders a <title> element containing "Sign in" and "Trakk"', () => {
    const { container } = render(<LoginPage />);

    // The spec requires an inline <title> in JSX.
    // In jsdom, React renders <title> into the component tree (not hoisted to <head>).
    // We query both locations to handle either behaviour.
    const titleInTree = container.querySelector('title');
    const titleInHead = document.querySelector('title');
    const titleEl = titleInTree ?? titleInHead;
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toMatch(/sign in/i);
    expect(titleEl?.textContent).toMatch(/trakk/i);
  });

  // --- Gradient h1 ---

  it('the h1 heading uses gradient text classes (bg-clip-text and text-transparent)', () => {
    render(<LoginPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toMatch(/bg-clip-text/);
    expect(heading.className).toMatch(/text-transparent/);
  });

  // --- Sign-in button ---

  it('renders a button with aria-label "Sign in with Google"', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('button', { name: /sign in with google/i })
    ).toBeInTheDocument();
  });

  it('clicking the sign-in button sets window.location.href to the Google OAuth URL', () => {
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    fireEvent.click(button);

    expect(window.location.href).toMatch(/\/api\/v1\/auth\/google/);
  });

  it('Google SVG icon inside button has aria-hidden="true"', () => {
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    const svg = button.querySelector('svg[aria-hidden="true"]');
    expect(svg).toBeInTheDocument();
  });

  // --- Loading state ---

  it('button shows "Redirecting..." and is disabled after click', async () => {
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: /sign in with google/i });

    await act(async () => {
      fireEvent.click(button);
    });

    // After click: button text changes to "Redirecting..." and is disabled.
    // The button retains aria-label="Sign in with Google" which overrides accessible name,
    // so we check the visible text via textContent and disabled state directly.
    expect(button.textContent).toMatch(/redirecting/i);
    expect(button).toBeDisabled();
  });

  // --- Error callout: no error ---

  it('does NOT show a role="alert" when no error param is present', () => {
    mockGet.mockReturnValue(null);

    render(<LoginPage />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // --- Error callout: known codes ---

  it('shows callout with "Sign-in was cancelled" for ?error=access_denied', () => {
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'access_denied' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/sign-in was cancelled/i);
  });

  it('shows callout with "Something went wrong" for ?error=csrf_mismatch', () => {
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'csrf_mismatch' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/something went wrong/i);
  });

  it('shows callout with "Invalid request" for ?error=state_mismatch', () => {
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'state_mismatch' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/invalid request/i);
  });

  it('shows callout with "Authentication failed" for ?error=auth_failed', () => {
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'auth_failed' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/authentication failed/i);
  });

  it('shows callout with "Account conflict" for ?error=account_conflict', () => {
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'account_conflict' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/account conflict/i);
  });

  // --- Error callout: unknown code (Risk 1 — fallback behaviour) ---

  it('shows callout with fallback message for an unknown error code', () => {
    // Risk 1 decision: unknown codes now show the fallback, not "nothing"
    mockGet.mockImplementation((key: string) =>
      key === 'error' ? 'totally_unknown_error_xyz' : null
    );

    render(<LoginPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/sign-in failed/i);
  });

  // --- Gradient accent bar inside card (Risk 2) ---

  it('renders a gradient accent bar as the first child inside the card', () => {
    const { container } = render(<LoginPage />);

    // The spec requires div.h-0.5.w-full inside the card wrapper
    const accentBar = container.querySelector('.h-0\\.5.w-full');
    expect(accentBar).toBeInTheDocument();
  });
});
