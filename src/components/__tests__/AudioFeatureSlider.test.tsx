/**
 * Tests for the AudioFeatureSlider component.
 *
 * Acceptance criteria covered:
 *   AC-S2-03 — AudioFeatureSlider is interactive; dragging updates displayed value;
 *               gradient fill updates to match thumb position
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Import the component — will fail until Agent A implements it.
import AudioFeatureSlider from '../AudioFeatureSlider';

// Feature types the slider supports per sprint spec
type AudioFeatureKey =
  | 'energy'
  | 'tempo'
  | 'valence'
  | 'danceability'
  | 'acousticness'
  | 'instrumentalness'
  | 'popularity';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioFeatureSlider', () => {
  it('renders label and value', () => {
    render(<AudioFeatureSlider feature="energy" value={0.72} onChange={vi.fn()} />);
    // Label should be "Energy" (human-readable)
    expect(screen.getByText(/Energy/i)).toBeInTheDocument();
    // Value should be visible — either as "0.72" or "72" (percentage) or "72%"
    expect(
      screen.getByText('0.72') ||
      screen.getByText('72') ||
      screen.getByText('72%')
    ).toBeTruthy();
  });

  it('calls onChange when slider is moved', () => {
    const handleChange = vi.fn();
    render(<AudioFeatureSlider feature="energy" value={0.5} onChange={handleChange} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.8' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    // The new value should be approximately 0.8
    const calledWith = handleChange.mock.calls[0][0];
    expect(Number(calledWith)).toBeCloseTo(0.8, 1);
  });

  it('renders correct gradient for energy feature', () => {
    const { container } = render(
      <AudioFeatureSlider feature="energy" value={0.5} onChange={vi.fn()} />
    );
    // The filled-portion div carries the gradient as an inline background style.
    // Query any element in the component that uses a CSS gradient.
    const gradientEl = container.querySelector('[style*="gradient"]') as HTMLElement | null;
    expect(gradientEl).not.toBeNull();
  });

  it('renders tempo with BPM scale (not 0-1)', () => {
    render(<AudioFeatureSlider feature="tempo" value={128} onChange={vi.fn()} />);
    // The value "128" and " BPM" are separate text nodes inside the same span,
    // so the span's full text content is "128 BPM". Match with a regex.
    expect(screen.getByText(/^128/)).toBeInTheDocument();
    // Should NOT display the value as a normalized decimal between 0-1
    expect(screen.queryByText('0.64')).toBeNull();
    expect(screen.queryByText('0.5')).toBeNull();
  });

  it('renders all supported audio feature variants without crashing', () => {
    const features: AudioFeatureKey[] = [
      'energy',
      'tempo',
      'valence',
      'danceability',
      'acousticness',
      'instrumentalness',
      'popularity',
    ];
    features.forEach((feature) => {
      expect(() => {
        const { unmount } = render(
          <AudioFeatureSlider feature={feature} value={0.5} onChange={vi.fn()} />
        );
        unmount();
      }).not.toThrow();
    });
  });
});
