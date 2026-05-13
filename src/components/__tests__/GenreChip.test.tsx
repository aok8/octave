/**
 * Tests for the GenreChip component.
 *
 * Acceptance criteria covered:
 *   AC-S2-02 — TrackCard renders with genre chips
 *   AC-S2-08 — Component library renders without crash (genre bucket coverage)
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { GenreBucket } from '../../types';

// Import the component — will fail until Agent A implements it.
// The test file is written ahead of the implementation intentionally.
import GenreChip from '../GenreChip';

// Human-readable labels that should appear for each bucket
const GENRE_LABELS: Record<GenreBucket, string> = {
  hiphop: 'Hip-Hop',
  rnb: 'R&B',
  neosoul: 'Neo-Soul',
  chillpop: 'Chill Pop',
  lofi: 'Lo-Fi',
  nujazz: 'Nu-Jazz',
  other: 'Other',
};

const ALL_GENRES: GenreBucket[] = ['rnb', 'neosoul', 'hiphop', 'chillpop', 'lofi', 'nujazz', 'other'];

describe('GenreChip', () => {
  it('renders genre label correctly', () => {
    render(<GenreChip genre="hiphop" />);
    expect(screen.getByText('Hip-Hop')).toBeInTheDocument();
  });

  it('applies boosted styles when variant="boosted"', () => {
    const { container } = render(<GenreChip genre="hiphop" variant="boosted" />);
    // The boosted chip should have a visual indicator — check for class or data attribute
    const chip = container.firstChild as HTMLElement;
    const hasBoostedIndicator =
      chip.className.includes('boosted') ||
      chip.getAttribute('data-variant') === 'boosted' ||
      chip.querySelector('[data-variant="boosted"]') !== null ||
      // fallback: check inline style for a glow/highlight color
      (chip.style && (chip.style.boxShadow !== '' || chip.style.outline !== ''));
    expect(hasBoostedIndicator).toBe(true);
  });

  it('applies excluded styles when variant="excluded"', () => {
    const { container } = render(<GenreChip genre="hiphop" variant="excluded" />);
    const chip = container.firstChild as HTMLElement;
    // Excluded chips should have strikethrough text or a gray/dimmed appearance
    const hasExcludedIndicator =
      chip.className.includes('excluded') ||
      chip.getAttribute('data-variant') === 'excluded' ||
      chip.querySelector('[data-variant="excluded"]') !== null ||
      (chip.style && chip.style.textDecoration === 'line-through') ||
      (chip.style && chip.style.opacity !== '');
    expect(hasExcludedIndicator).toBe(true);
  });

  it('renders all 7 genre buckets without crashing', () => {
    ALL_GENRES.forEach((genre) => {
      expect(() => {
        const { unmount } = render(<GenreChip genre={genre} />);
        unmount();
      }).not.toThrow();
    });
  });

  it('renders correct label for each genre bucket', () => {
    ALL_GENRES.forEach((genre) => {
      const { unmount } = render(<GenreChip genre={genre} />);
      expect(screen.getByText(GENRE_LABELS[genre])).toBeInTheDocument();
      unmount();
    });
  });
});
