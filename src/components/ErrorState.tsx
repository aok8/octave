
interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      {/* Error icon */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        style={{ opacity: 0.5 }}
      >
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <path
          d="M12 7v5M12 16v.5"
          stroke="rgba(255,255,255,0.50)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Message */}
      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.60)",
          margin: 0,
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>

      {/* Retry button */}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.20)",
            color: "rgba(255,255,255,0.70)",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "rgba(255,255,255,0.35)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "rgba(255,255,255,0.20)";
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
