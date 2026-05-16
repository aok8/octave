import { useId } from "react";
import type { AudioFeatures } from "../types";

// ── Per-feature config ────────────────────────────────────────────────────────

interface FeatureConfig {
  label: string;
  gradient: string;
  min: number;
  max: number;
  unit?: string;
  decimals: number;
}

const FEATURE_CONFIG: Record<keyof AudioFeatures, FeatureConfig> = {
  energy: {
    label: "Energy",
    gradient: "linear-gradient(to right, #4DB6AC, #FF914D, #FF5757)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  valence: {
    label: "Valence",
    gradient: "linear-gradient(to right, #6A0DAD, #FF6FAE, #FFD93D)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  danceability: {
    label: "Danceability",
    gradient: "linear-gradient(to right, #1DB9FF, #FF6FAE)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  acousticness: {
    label: "Acousticness",
    gradient: "linear-gradient(to right, #4DB6AC, #FFD93D)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  instrumentalness: {
    label: "Instrumentalness",
    gradient: "linear-gradient(to right, #888888, #6A0DAD)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  tempo: {
    label: "Tempo",
    gradient: "linear-gradient(to right, #1DB9FF, #FF5757)",
    min: 60,
    max: 200,
    unit: " BPM",
    decimals: 0,
  },
  // popularity is not in AudioFeatures but we include it for slider use
  speechiness: {
    label: "Speechiness",
    gradient: "linear-gradient(to right, #888888, #FF914D)",
    min: 0,
    max: 1,
    decimals: 2,
  },
  loudness: {
    label: "Loudness",
    gradient: "linear-gradient(to right, #4DB6AC, #FF5757)",
    min: -60,
    max: 0,
    unit: " dB",
    decimals: 1,
  },
  trackId: {
    // not a real slider — fallback
    label: "Track",
    gradient: "linear-gradient(to right, #888, #888)",
    min: 0,
    max: 1,
    decimals: 0,
  },
  key: {
    label: "Key",
    gradient: "linear-gradient(to right, #888888, #1DB9FF)",
    min: 0,
    max: 11,
    decimals: 0,
  },
  mode: {
    label: "Mode",
    gradient: "linear-gradient(to right, #6A0DAD, #FFD93D)",
    min: 0,
    max: 1,
    decimals: 0,
  },
};

// ── Thumb & track CSS injected once ──────────────────────────────────────────

const SLIDER_STYLE_ID = "octave-slider-styles";

function ensureSliderStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SLIDER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SLIDER_STYLE_ID;
  style.textContent = `
    .octave-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
      background: transparent;
    }
    .octave-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ffffff;
      cursor: pointer;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
      transition: transform 150ms ease;
    }
    .octave-slider::-webkit-slider-thumb:hover {
      transform: scale(1.25);
    }
    .octave-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ffffff;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    }
    .octave-slider::-moz-range-track {
      height: 4px;
      border-radius: 2px;
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AudioFeatureSliderProps {
  feature: keyof AudioFeatures | (string & {});
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label?: string;
  median?: number;
}

export function AudioFeatureSlider({
  feature,
  value,
  min: minOverride,
  max: maxOverride,
  onChange,
  label: labelOverride,
  median,
}: AudioFeatureSliderProps) {
  ensureSliderStyles();
  const uid = useId();

  const cfg = FEATURE_CONFIG[feature as keyof AudioFeatures] ?? FEATURE_CONFIG.energy;
  const min = minOverride ?? cfg.min;
  const max = maxOverride ?? cfg.max;
  const label = labelOverride ?? cfg.label;

  // Compute fill % for the gradient overlay
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const displayValue =
    cfg.decimals === 0 ? String(Math.round(value)) : value.toFixed(cfg.decimals);

  return (
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      {/* Label row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <label
          htmlFor={uid}
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.60)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          {label}
          {median !== undefined && (
            <span
              data-testid={`slider-median-${feature}`}
              style={{ color: "rgba(255,255,255,0.35)", marginLeft: 4 }}
            >
              {feature === "tempo"
                ? `· ${Math.round(median)} BPM`
                : `· ${median.toFixed(2)}`}
            </span>
          )}
        </label>
        <span
          style={{
            fontSize: 13,
            color: "#ffffff",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "monospace",
          }}
        >
          {displayValue}
          {cfg.unit ?? ""}
        </span>
      </div>

      {/* Track + thumb */}
      <div style={{ position: "relative", height: 4 }}>
        {/* Gradient background track */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            background: "rgba(255,255,255,0.12)",
          }}
        />
        {/* Filled portion */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${pct}%`,
            height: "100%",
            borderRadius: 2,
            background: cfg.gradient,
            transition: "width 0ms", // real-time feel
          }}
        />
        {/* Range input overlaid */}
        <input
          id={uid}
          type="range"
          className="octave-slider"
          min={min}
          max={max}
          step={cfg.decimals === 0 ? 1 : 0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            transform: "translateY(-50%)",
            margin: 0,
          }}
        />
      </div>
    </div>
  );
}

export default AudioFeatureSlider;
