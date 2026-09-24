import { Stamp } from "@/components/comanda/primitives";

/** Block header: label, dashed rule, count — red when it's the late block. */
export function SectionHead({ label, count, tone, stamp, action }: {
  label: string;
  count?: number;
  tone?: string;
  /** e.g. "AHORA" — a rotated rubber stamp next to the label. */
  stamp?: string;
  action?: React.ReactNode;
}) {
  const color = tone ?? "var(--muted)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 8px", color, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
      <span>{label}</span>
      {stamp && <Stamp size={9} rotate={-6} color={color}>{stamp}</Stamp>}
      {typeof count === "number" && (
        <span className="cmd-num" style={{ minWidth: 26, height: 26, padding: "0 8px", borderRadius: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, background: tone ? tone : "transparent", color: tone ? "var(--paper-lt)" : "var(--muted)", border: tone ? "none" : "1px solid var(--rule)", letterSpacing: 0 }}>
          {count}
        </span>
      )}
      <span style={{ flex: 1, borderTop: `1px dashed ${tone ? tone : "var(--rule)"}`, opacity: tone ? 0.5 : 1 }} />
      {action}
    </div>
  );
}
