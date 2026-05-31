/**
 * Shared section header used by the 5 Turnos sub-pages.
 * Mirrors `TurnosHeader` from `comanda-turnos.jsx:74-85`.
 */
export function TurnosHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-end justify-between"
      style={{
        padding: "20px 32px 16px",
        borderBottom: "1.5px solid var(--ink)",
      }}
    >
      <div>
        <div
          className="text-muted"
          style={{ fontSize: 10, letterSpacing: "0.16em" }}
        >
          {kicker}
        </div>
        <h1
          className="font-slab"
          style={{ fontSize: 30, margin: "4px 0 0" }}
        >
          {title}
        </h1>
      </div>
      <div className="flex items-center" style={{ gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
