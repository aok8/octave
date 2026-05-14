/**
 * Tests for the LoadingState component.
 *
 * Covers the shimmer skeleton types: list, card, chart, and the new track type.
 */

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingState } from '../LoadingState';

describe('LoadingState', () => {
  it('renders list skeleton type', () => {
    const { container } = render(<LoadingState type="list" rows={3} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders card skeleton type', () => {
    const { container } = render(<LoadingState type="card" rows={3} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders chart skeleton type', () => {
    const { container } = render(<LoadingState type="chart" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders track skeleton type', () => {
    const { container } = render(<LoadingState type="track" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders track skeleton with multiple rows', () => {
    const { container } = render(<LoadingState type="track" rows={3} />);
    expect(container.firstChild).toBeInTheDocument();
    // Each row has a thumbnail and two text lines — verify the inner wrapper
    const trackRows = container.querySelectorAll('[style*="width: 40px"]');
    expect(trackRows.length).toBe(3);
  });
});
