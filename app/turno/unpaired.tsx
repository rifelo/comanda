import Link from "next/link";

/** Shown on the tablet routes when neither a paired device nor a signed-in user is present. */
export function TurnoUnpaired({ next = "/turno" }: { next?: string }) {
  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 440, border: "1.5px solid var(--ink)", borderRadius: 10, padding: "28px 28px 24px", background: "var(--paper-lt)" }}>
        <div className="font-slab" style={{ fontSize: 28 }}>Turno<span style={{ color: "var(--red)" }}>.</span></div>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
          Esta tablet no está emparejada. Empareja el dispositivo con un código desde
          Configuración → Punto de venta, o inicia sesión.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Link href="/pos" className="cmd-btn" style={{ textDecoration: "none" }}>Emparejar en /pos →</Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="cmd-btn ghost" style={{ textDecoration: "none" }}>Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
