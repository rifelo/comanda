"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyKey } from "@/components/ui/keypad";
import { nombrePaquete } from "@/lib/inventario/niveles";
import { responder } from "./actions";
import { VERIF_CSS } from "./estilos";
import { conDecimales, fmtNum } from "./formato";

export type TareaVerificar = {
  id: string;
  name: string;
  unit: string;
  ubicacion: string | null;
  /** Stock units per countable piece; null = counted in the unit. */
  pieza: number | null;
  packLabel: string | null;
  /** The owner's rule for counting this item, if any. */
  nota?: string | null;
};

type Campo = "paq" | "sue";

const LISTO_HREF = "/turno/inventario/verificar/listo";

const num = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * «Verificar inventario» on the shop tablet: one item per screen, in the
 * order the assistant chose. Blind — the system's stock is never shown, only
 * what the person types. Items with a piece are counted as whole pieces plus
 * loose units; the total goes to the server in stock units.
 */
export function VerificarScreen({ tareas: inicial }: { tareas: TareaVerificar[] }) {
  const router = useRouter();
  // A snapshot: the server re-renders the page after each answer with fewer
  // tasks, and the walk must keep its own order and count.
  const [tareas] = React.useState(inicial);
  const [idx, setIdx] = React.useState(0);
  const [vals, setVals] = React.useState<Record<Campo, string>>({ paq: "", sue: "" });
  const [activo, setActivo] = React.useState<Campo>(() => (inicial[0]?.pieza ? "paq" : "sue"));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fin, setFin] = React.useState(false);

  // Navigate on a state change, never inside a transition (Next 16 pending lock).
  React.useEffect(() => {
    if (fin) router.push(LISTO_HREF);
  }, [fin, router]);

  const t = tareas[idx];
  if (!t) return null;

  const pieza = t.pieza && t.pieza > 1 ? t.pieza : null;
  const decimal = conDecimales(t.unit);
  const paquetes = capital(t.packLabel ? nombrePaquete({ pack_label: t.packLabel }, 2) : "paquetes");
  const total = Math.round(((pieza ? Math.floor(num(vals.paq)) * pieza : 0) + num(vals.sue)) * 1000) / 1000;
  const escrito = vals.paq !== "" || vals.sue !== "";
  const decimalAqui = decimal && activo === "sue";
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimalAqui ? "," : "C", "0", "⌫"];

  function tecla(k: string) {
    setError(null);
    setVals((v) => ({ ...v, [activo]: applyKey(v[activo], k, 7) }));
  }

  function avanzar() {
    const sig = idx + 1;
    if (sig >= tareas.length) {
      setFin(true);
      return;
    }
    setIdx(sig);
    setVals({ paq: "", sue: "" });
    setActivo(tareas[sig].pieza && (tareas[sig].pieza as number) > 1 ? "paq" : "sue");
  }

  async function enviar(counted: number | null) {
    if (busy || fin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await responder({ tareaId: t.id, counted });
      if (res.ok || res.yaHecha) avanzar();
      else setError(res.error);
    } catch {
      setError("No se pudo guardar. Revisa el internet e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const ayuda = pieza
    ? `Primero lo que está completo: ${nombrePaquete({ pack_label: t.packLabel }, 2)} de ${fmtNum(pieza)} ${t.unit}. Después lo que queda suelto, en ${t.unit}.`
    : `Cuenta todo lo que hay, en ${t.unit}.`;
  const bloqueado = busy || fin;

  return (
    <div className="verif">
      <style>{VERIF_CSS}</style>
      <header className="verif-head">
        <div className="verif-headrow">
          <Link href="/turno/inventario" className="verif-back" aria-label="Volver a inventario">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="verif-h1">Verificar inventario</h1>
            <p className="verif-sub">Insumo {idx + 1} de {tareas.length} · control de inventario</p>
          </div>
        </div>
        <div className="verif-bar" role="img" aria-label={`Insumo ${idx + 1} de ${tareas.length}`}>
          {tareas.map((x, i) => (
            <span key={x.id} data-s={i < idx || fin ? "hecho" : i === idx ? "actual" : undefined} />
          ))}
        </div>
      </header>

      <main className="verif-main">
        <section className="verif-card" aria-labelledby="verif-nombre">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {t.ubicacion && (
              <div className="verif-chips">
                <span className="verif-chip">{t.ubicacion}</span>
              </div>
            )}
            <h2 id="verif-nombre" className="verif-name">{t.name}</h2>
            <p className="verif-help">{ayuda}</p>
            {t.nota ? <p className="verif-nota">{t.nota}</p> : null}
          </div>

          <div className="verif-fields">
            {pieza && (
              <button type="button" className="verif-fld" aria-pressed={activo === "paq"} onClick={() => setActivo("paq")}>
                <span className="verif-fld-label">{paquetes} de {fmtNum(pieza)}</span>
                <span className="verif-fld-num" data-vacio={vals.paq === "" ? "1" : undefined}>{vals.paq || "0"}</span>
              </button>
            )}
            <button type="button" className="verif-fld" aria-pressed={activo === "sue"} onClick={() => setActivo("sue")}>
              <span className="verif-fld-label">{pieza ? `${t.unit} sueltos` : `Cantidad en ${t.unit}`}</span>
              <span className="verif-fld-num" data-vacio={vals.sue === "" ? "1" : undefined}>{vals.sue || "0"}</span>
            </button>
          </div>

          {pieza && (
            <div className="verif-total" aria-live="polite">
              <span>Total que vas a reportar</span>
              <span>{fmtNum(total)} {t.unit}</span>
            </div>
          )}

          <div className="verif-hint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
            <p>No te mostramos lo que dice el sistema: cuenta solo lo que ves.</p>
          </div>
        </section>

        <section className="verif-keys" aria-label="Teclado">
          {teclas.map((k) => (
            <button
              key={k}
              type="button"
              className={k === "C" || k === "⌫" ? "verif-key alt" : "verif-key"}
              onClick={() => tecla(k)}
              aria-label={k === "⌫" ? "Borrar" : k === "C" ? "Limpiar" : k === "," ? "Coma decimal" : k}
              disabled={bloqueado}
            >
              {k}
            </button>
          ))}
        </section>

        {error && <div className="verif-error" role="alert">{error}</div>}

        <div className="verif-actions">
          <button type="button" className="verif-ghost" onClick={() => void enviar(null)} disabled={bloqueado}>
            No lo encuentro
          </button>
          <button type="button" className="verif-solid" onClick={() => void enviar(total)} disabled={bloqueado || !escrito}>
            {busy || fin ? "Guardando…" : idx + 1 === tareas.length ? "Guardar y terminar" : "Guardar y seguir"}
            {!busy && !fin && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
