/** Same rule as lib/db/roster.ts `makeInitials` (that module is server-only). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const base = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
  return base.length === 2 ? base : "XX";
}

export function Avatar({ initials, size }: { initials: string; size: number }) {
  return (
    <span className="inline-flex items-center justify-center" style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper)", fontSize: Math.round(size * 0.32), fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </span>
  );
}

export const linkChip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", height: 36, padding: "0 12px", borderRadius: 3,
  border: "1.5px solid var(--rule)", color: "var(--ink-2)", fontSize: 11, letterSpacing: ".1em",
  textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap",
};
