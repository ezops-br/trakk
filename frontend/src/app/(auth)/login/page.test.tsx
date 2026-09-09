import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API client
vi.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    status: number;
    details?: string;
    constructor(status: number, message: string, details?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }
  return {
    ApiError,
    apiClient: {
      post: vi.fn(),
    },
  };
});

import LoginPage from './page';
import { apiClient, ApiError } from '@/lib/api-client';

const mockApiPost = apiClient.post as ReturnType<typeof vi.fn>;

describe('LoginPage — email/password form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Login navigates via a hard `window.location.href` assignment, not
    // router.push (see page.tsx) — jsdom doesn't implement real navigation,
    // so replace `location` with a writable stand-in to observe it.
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
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

  // --- Form fields ---

  it('renders email and password inputs and a submit button', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  // --- Successful submit ---

  it('submits email/password to the API client and navigates to /dashboard on success', async () => {
    mockApiPost.mockResolvedValue({
      id: 'user-1',
      email: 'alice@test.com',
      displayName: 'Alice',
      avatarUrl: null,
      themePreference: 'light',
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'alice@test.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(window.location.href).toBe('/dashboard');
    });
  });

  it('shows a loading state and disables the submit button while submitting', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    mockApiPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const button = await screen.findByRole('button', { name: /signing in/i });
    expect(button).toBeDisabled();

    resolvePost({
      id: 'user-1',
      email: 'alice@test.com',
      displayName: 'Alice',
      avatarUrl: null,
      themePreference: 'light',
    });

    await waitFor(() => expect(window.location.href).toBe('/dashboard'));
  });

  // --- Failed submit ---

  it('shows an inline error and does not navigate on 401 failure', async () => {
    mockApiPost.mockRejectedValue(
      new ApiError(401, 'Invalid email or password')
    );

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/invalid email or password/i);
    expect(window.location.href).toBe('');
  });

  // --- Gradient accent bar inside card ---

  it('renders a gradient accent bar as the first child inside the card', () => {
    const { container } = render(<LoginPage />);

    const accentBar = container.querySelector('.h-0\\.5.w-full');
    expect(accentBar).toBeInTheDocument();
  });
});
