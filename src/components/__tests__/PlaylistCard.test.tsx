/**
 * Tests for the PlaylistCard component.
 *
 * Acceptance criteria covered:
 *   AC-S2-02 — PlaylistCard renders playlist metadata
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Playlist } from '../../types';

// Import the component — will fail until Agent A implements it.
import PlaylistCard from '../PlaylistCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_PLAYLIST: Playlist = {
  id: 'pl_test_1',
  name: 'My Chill Playlist',
  description: 'A great chill collection',
  coverUrl: 'https://example.com/playlist_cover.jpg',
  trackCount: 42,
  isPublic: false,
  snapshotId: 'snap_abc123',
  cachedAt: Date.now(),
};

const MOCK_PLAYLIST_NO_COVER: Playlist = {
  id: 'pl_no_cover',
  name: 'No Cover Playlist',
  description: '',
  coverUrl: undefined,
  trackCount: 15,
  isPublic: true,
  snapshotId: undefined,
  cachedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaylistCard', () => {
  it('renders playlist name and track count', () => {
    render(<PlaylistCard playlist={MOCK_PLAYLIST} />);
    expect(screen.getByText('My Chill Playlist')).toBeInTheDocument();
    // Track count should appear as "42" or "42 tracks" etc.
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<PlaylistCard playlist={MOCK_PLAYLIST} onClick={handleClick} />);

    // Try button role first, then fall back to any clickable container
    const button = screen.queryByRole('button');
    if (button) {
      fireEvent.click(button);
    } else {
      const card = screen.getByTestId?.('playlist-card') ||
        document.querySelector('[data-testid="playlist-card"]');
      if (card) {
        fireEvent.click(card as HTMLElement);
      } else {
        // Last resort: click first child
        const { container } = render(<PlaylistCard playlist={MOCK_PLAYLIST} onClick={handleClick} />);
        fireEvent.click(container.firstChild as HTMLElement);
      }
    }
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders fallback when no cover art', () => {
    expect(() => {
      render(<PlaylistCard playlist={MOCK_PLAYLIST_NO_COVER} />);
    }).not.toThrow();

    // Playlist name should still be rendered
    expect(screen.getByText('No Cover Playlist')).toBeInTheDocument();

    // Verify no image with an undefined/empty src (broken image)
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      // src should either be null (not an img) or a valid placeholder, not undefined string
      expect(src).not.toBe('undefined');
      expect(src).not.toBe('');
    });
  });

  it('renders track count with correct number', () => {
    render(<PlaylistCard playlist={MOCK_PLAYLIST} />);
    // Should show "42" somewhere (as a count label)
    const trackCountEl = screen.getByText(/42/);
    expect(trackCountEl).toBeInTheDocument();
  });
});
