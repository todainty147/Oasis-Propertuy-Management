const TIER_COLORS = {
  strong:   "#10b981",
  moderate: "#3b82f6",
  elevated: "#f59e0b",
  critical: "#ef4444",
};

const TIER_TRACK = {
  strong:   "#d1fae5",
  moderate: "#dbeafe",
  elevated: "#fef3c7",
  critical: "#fee2e2",
};

// Half-circle gauge using SVG stroke-dasharray on a semicircle arc.
// viewBox 200×110 — the semicircle sits with its diameter on y=100.
export default function ShieldScoreGauge({ score, tier, size = 160 }) {
  const r = 78;
  const cx = 100;
  const cy = 100;
  const arcLength = Math.PI * r; // ≈ 245
  const safeScore = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const filled = (safeScore / 100) * arcLength;
  const color = TIER_COLORS[tier] ?? TIER_COLORS.elevated;
  const trackColor = TIER_TRACK[tier] ?? TIER_TRACK.elevated;

  // M cx-r,cy  A r,r 0 0,1  cx+r,cy  — left→right semicircle going above the chord
  const path = `M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`;

  return (
    <svg
      viewBox="0 0 200 110"
      width={size}
      height={Math.round(size * 0.6)}
      role="img"
      aria-label={`Shield score ${safeScore} out of 100`}
      data-testid="shield-score-gauge"
    >
      {/* Track */}
      <path
        d={path}
        fill="none"
        stroke={trackColor}
        strokeWidth="15"
        strokeLinecap="round"
      />
      {/* Score arc */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="15"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${arcLength}`}
      />
      {/* Numeric label */}
      <text
        x={cx}
        y={cy - 14}
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="currentColor"
        className="dark:fill-white"
      >
        {safeScore}
      </text>
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="11"
        fill="#94a3b8"
      >
        / 100
      </text>
    </svg>
  );
}
