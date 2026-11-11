"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LineaPanel } from "@/lib/inventario/agente/db";
import { posMoney } from "@/lib/pos/types";
import { Button } from "@/components/ui/button";
import { cantidad, diffDe, valorDe } from "../_lib/formato";
import { revisarLineaAgente } from "../actions";

type Decision = "aceptar" | "rechazar" | "otro_conteo";

const CAUSAS = {
  falta: ["Merma sin registrar (algo se dañó o se botó)", "Las recetas gastan más de lo que dicen", "Una compra cargada dos veces"],
  sobra: ["Una compra que no pasó por «Recibir»", "Las recetas gastan menos de lo que dicen", "Se contó junto con otro insumo parecido"],
};

/** «Necesita tu revisión»: one line the assistant would not apply on its own. */
export function RevisionLinea({ conteoId, linea: l, quien }: { conteoId: string; linea: LineaPanel; quien: string | null }) {
  const router = useRouter();
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState<Decision | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const notaId = React.useId();

  const d = diffDe(l);
  const v = valorDe(l);
  const lado = d < 0 ? "falta" : "sobra";

  async function decidir(decision: Decision) {
    setBusy(decision);
    setError(null);
    const r = await revisarLineaAgente({ lineaId: l.id, conteoId, decision, nota: nota.trim() || undefined });
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  const box: React.CSSProperties = { padding: "10px 12px", borderRadius: 12, background: "var(--surface-2)", minWidth: 0 };
  return (
    <section className="flex flex-col gap-3" style={{ border: "2px solid var(--text)", borderRadius: 16, background: "var(--surface)", padding: 18 }} aria-labelledby={`rv-${l.id}`}>
      <span style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Necesita tu revisión</span>
      <h2 id={`rv-${l.id}`} style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
        {l.name}: {d === 0 ? "cuadra" : `${d < 0 ? "faltan" : "sobran"} ${cantidad(Math.abs(d), l)}`}
      </h2>
      <div className="grid grid-cols-2" style={{ gap: 8 }}>
        <div style={box}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>El sistema</div>
          <b className="cmd-num" style={{ fontSize: 18 }}>{cantidad(l.expected, l)}</b>
        </div>
        <div style={box}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{quien ? `${quien} contó` : "Se contó"}</div>
          <b className="cmd-num" style={{ fontSize: 18 }}>{cantidad(l.counted, l)}</b>
        </div>
      </div>
      {v !== 0 && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>
          La diferencia vale <b className="cmd-num">{posMoney(Math.abs(v))}</b>.
        </p>
      )}
      {d !== 0 && (
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Posibles causas</span>
          {CAUSAS[lado].map((c) => (
            <span key={c} style={{ fontSize: 14 }}>· {c}</span>
          ))}
        </div>
      )}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <label htmlFor={notaId} style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Nota (opcional)</label>
        <input
          id={notaId}
          type="text"
          value={nota}
          maxLength={300}
          onChange={(e) => setNota(e.target.value)}
          placeholder={lado === "falta" ? "Ej.: se dañaron 4 bolsas el domingo" : "Ej.: llegó un pedido sin registrar"}
          style={{ height: 44, boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--line)", borderRadius: 12, font: "inherit", fontSize: 14, color: "var(--text)", background: "var(--surface)" }}
        />
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--late)" }}>{error}</p>}
      <Button size="sm" block loading={busy === "aceptar"} disabled={!!busy} onClick={() => void decidir("aceptar")}>
        Aceptar {cantidad(l.counted, l)} y ajustar
      </Button>
      <div className="flex" style={{ gap: 8 }}>
        <Button size="sm" variant="ghost" className="flex-1" loading={busy === "otro_conteo"} disabled={!!busy} onClick={() => void decidir("otro_conteo")}>
          Pedir otro conteo
        </Button>
        <Button size="sm" variant="ghost" loading={busy === "rechazar"} disabled={!!busy} onClick={() => void decidir("rechazar")}>
          Rechazar
        </Button>
      </div>
      <Link href={`/inventario/kardex/${l.ingredienteId}`} style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
        Ver kardex
      </Link>
    </section>
  );
}
