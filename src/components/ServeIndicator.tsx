type ServeSide = "left" | "right";

type Props = {
  side: ServeSide;
  className?: string;
  /** default: 28px。toolbar: ツールバー行用。hero: 約56px */
  size?: "default" | "hero" | "toolbar";
};

export function ServeIndicator({ side, className = "", size = "default" }: Props) {
  const rotate = side === "left" ? "rotate-180" : "";
  const px = size === "hero" ? 56 : size === "toolbar" ? 40 : 28;
  const strokeW = size === "hero" ? 2.5 : size === "toolbar" ? 2.25 : 2;
  const accent =
    size === "hero"
      ? "text-[#D7FF5B] drop-shadow-[0_0_12px_rgba(215,255,91,0.55)]"
      : size === "toolbar"
        ? "text-[#D7FF5B] drop-shadow-[0_0_10px_rgba(215,255,91,0.45)]"
        : "text-foreground/85";

  return (
    <div
      className={`inline-flex items-center justify-center ${accent} ${className}`}
      aria-label={side === "left" ? "サーブ権：左" : "サーブ権：右"}
      role="img"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rotate}
        aria-hidden
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </div>
  );
}
