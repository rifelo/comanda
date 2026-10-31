"use client";

import { useCallback, useSyncExternalStore } from "react";
import { posMoney } from "@/lib/pos/types";
import { METODOS, METODO_LABEL } from "@/lib/numeros/dia";
import type { MetodoPago } from "@/lib/caja/arqueo";

type Conteo = Partial<Record<MetodoPago, string>>;

const listeners = new Set<() => void>();
function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode / storage full: the numbers still work for this visit
  }
  listeners.forEach((l) => l());
}

const digits = (text: string) => text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
const dots = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * The owner's own end-of-day check: type what was really counted for each
 * method and see it against what the system says came in. A scratchpad, not a
 * record — it stays on this device (per day), nothing is sent.
 */
export function VerificarConteo({
  date,
  esperado,
  hints,
}: {
  date: string;
  esperado: Record<MetodoPago, number>;
  hints: Record<MetodoPago, string>;
}) {
  const key = `numeros:conteo:${date}`;
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "");
  let conteo: Conteo = {};
  try {
    conteo = raw ? (JSON.parse(raw) as Conteo) : {};
  } catch {
    conteo = {};
  }
  const set = (m: MetodoPago, text: string) => write(key, JSON.stringify({ ...conteo, [m]: digits(text) }));

  const filas = METODOS.map((m) => {
    const d = conteo[m] ?? "";
    const contado = d === "" ? null : Number(d);
    return { m, d, contado, diff: contado == null ? null : contado - esperado[m] };
  });
  const llenas = filas.filter((f) => f.contado != null);
  const totalDiff = llenas.reduce((s, f) => s + (f.diff ?? 0), 0);
  const completo = llenas.length === filas.length;

  return (
    <div>
      <div style={{ display: "grid", gap: 12 }}>
        {filas.map((f) => (
          <div key={f.m}>
            <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
              <label htmlFor={`conteo-${f.m}`} style={{ fontSize: 15, fontWeight: 600 }}>
                {METODO_LABEL[f.m]}
              </label>
              <span className="text-muted ui-num" style={{ fontSize: 13 }}>
                sistema {posMoney(esperado[f.m])}
              </span>
            </div>
            <div className="flex items-center" style={{ border: "1px solid var(--line)", background: "var(--surface)", padding: "0 10px", height: 52, marginTop: 6, borderRadius: 12 }}>
              <span className="text-muted" style={{ marginRight: 4 }}>$</span>
              <input
                id={`conteo-${f.m}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="lo que contaste"
                value={dots(f.d)}
                onChange={(e) => set(f.m, e.target.value)}
                className="ui-num"
                style={{ flex: 1, width: 0, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 17, fontWeight: 600 }}
              />
            </div>
            <div className="flex items-baseline justify-between" style={{ gap: 10, marginTop: 4 }}>
              <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{hints[f.m]}</span>
              <Veredicto diff={f.diff} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)", gap: 10 }}>
        <span style={{ fontSize: 14 }}>
          {llenas.length === 0
            ? "Escribe lo que contaste para comparar."
            : completo
              ? totalDiff === 0
                ? "Todo el día cuadra."
                : "Diferencia total del día"
              : `Diferencia en ${llenas.length} de ${filas.length} métodos`}
        </span>
        <span className="flex items-center" style={{ gap: 10 }}>
          {llenas.length > 0 ? <Veredicto diff={totalDiff} /> : null}
          {llenas.length > 0 ? (
            <button type="button" className="text-muted underline bg-transparent border-0 cursor-pointer" style={{ fontSize: 12.5, minHeight: 0 }} onClick={() => write(key, "")}>
              borrar
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** ✓ cuadra / faltan / sobran: icon + words, the colour only reinforces. */
function Veredicto({ diff }: { diff: number | null }) {
  if (diff == null) return null;
  const tone = diff === 0 ? "var(--ok)" : diff < 0 ? "var(--late)" : "var(--brand)";
  const text = diff === 0 ? "✓ cuadra" : diff < 0 ? `▼ faltan ${posMoney(-diff)}` : `▲ sobran ${posMoney(diff)}`;
  return (
    <span className="ui-num" style={{ fontSize: 13.5, fontWeight: 700, color: tone, textAlign: "right", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}
