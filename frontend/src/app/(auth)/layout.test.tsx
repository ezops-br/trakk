import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import AuthLayout from './layout';

describe('AuthLayout', () => {
  it('renders children passed to the layout', () => {
    render(
      <AuthLayout>
        <div data-testid="child-content">Hello</div>
      </AuthLayout>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('does not render any wrapper elements around children', () => {
    const { container } = render(
      <AuthLayout>
        <div data-testid="child-slot">child</div>
      </AuthLayout>
    );

    const child = screen.getByTestId('child-slot');
    expect(child.parentElement).toBe(container);
  });
});
