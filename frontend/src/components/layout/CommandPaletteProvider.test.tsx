import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// CommandPaletteProvider.tsx does not exist yet — tests fail with "Cannot find module".
import {
  CommandPaletteProvider,
  useCommandPalette,
} from '@/components/layout/CommandPaletteProvider';

// Helper component to expose context state via the DOM
function Probe() {
  const { isOpen } = useCommandPalette();
  return <div data-testid="probe" data-open={String(isOpen)} />;
}

function renderWithProvider() {
  render(
    <CommandPaletteProvider>
      <Probe />
    </CommandPaletteProvider>,
  );
}

function isOpen(): boolean {
  return screen.getByTestId('probe').getAttribute('data-open') === 'true';
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CommandPaletteProvider', () => {
  it('opens the palette on Cmd+K (metaKey + k)', () => {
    // Arrange
    renderWithProvider();
    expect(isOpen()).toBe(false);

    // Act
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });

    // Assert
    expect(isOpen()).toBe(true);
  });

  it('opens the palette on Ctrl+K (ctrlKey + k)', () => {
    // Arrange
    renderWithProvider();
    expect(isOpen()).toBe(false);

    // Act
    act(() => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });

    // Assert
    expect(isOpen()).toBe(true);
  });

  it('toggles closed on second Cmd+K when palette is already open', () => {
    // Arrange
    renderWithProvider();

    // Open
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });
    expect(isOpen()).toBe(true);

    // Act — second Cmd+K
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
    });

    // Assert
    expect(isOpen()).toBe(false);
  });

  it('does not open when isComposing=true (IME guard)', () => {
    // Arrange
    renderWithProvider();
    expect(isOpen()).toBe(false);

    // Act — IME composition in progress
    act(() => {
      fireEvent.keyDown(window, { key: 'k', metaKey: true, isComposing: true });
    });

    // Assert — palette must stay closed
    expect(isOpen()).toBe(false);
  });
});
