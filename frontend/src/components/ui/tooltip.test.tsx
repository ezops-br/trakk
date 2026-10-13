import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

afterEach(() => {
  cleanup();
});

function ExampleTooltip(): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button type="button">Hover me</button>
      </TooltipTrigger>
      <TooltipContent>Absolute date here</TooltipContent>
    </Tooltip>
  );
}

describe('Tooltip primitive', () => {
  it('(a) renders the trigger only by default (no tooltip content in the DOM)', () => {
    render(<ExampleTooltip />);

    // The trigger is in the document and findable by its accessible name.
    expect(screen.getByRole('button', { name: /hover me/i })).toBeInTheDocument();
    // The tooltip content is not mounted until open.
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('(b) pointerenter on the trigger opens the tooltip with role="tooltip"', () => {
    render(<ExampleTooltip />);
    const trigger = screen.getByRole('button', { name: /hover me/i });

    fireEvent.pointerEnter(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent(/absolute date here/i);
  });

  it('(c) pointerleave on the trigger closes the tooltip', () => {
    render(<ExampleTooltip />);
    const trigger = screen.getByRole('button', { name: /hover me/i });

    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('(d) focus on the trigger opens the tooltip (keyboard accessibility)', () => {
    render(<ExampleTooltip />);
    const trigger = screen.getByRole('button', { name: /hover me/i });

    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('(e) Escape closes the tooltip', () => {
    render(<ExampleTooltip />);
    const trigger = screen.getByRole('button', { name: /hover me/i });

    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('(f) trigger has aria-describedby matching the open content id', () => {
    render(<ExampleTooltip />);
    const trigger = screen.getByRole('button', { name: /hover me/i });

    // Before open: no aria-describedby wired to a tooltip.
    expect(trigger).not.toHaveAttribute('aria-describedby');

    fireEvent.pointerEnter(trigger);
    const tooltip = screen.getByRole('tooltip');

    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(describedBy).toBe(tooltip.id);
  });
});