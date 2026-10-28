"use client";

import * as React from "react";
import type { ValidarBaseInput } from "@/lib/caja/cierres";
import type { CajaCierre } from "@/lib/types";
import { fechaCorta } from "@/lib/utils";
import { IcoAlerta, IcoCheck, IcoArriba, IcoAbajo } from "./icons";
import { hora, plata } from "./model";
import { Keypad } from "./parts";

const FRASES = ["Lo conté dos veces", "Había un billete de menos", "Sobraba", "El sobre estaba abierto"];
const STATUS: Record<CajaCierre["status"], string> = { pendiente: "arqueo pendiente de aprobar", aprobado: "arqueo aprobado", rechazado: "arqueo rechazado" };

/**
 * Before opening the drawer: the base the previous close left, piece by
 * piece. «Está completa», or «Encontré otra cantidad» with the amount on the
 * keypad and the why — the difference stays on the previous turno.
 */
export function ValidarBase({ cierre, tz, online, validate, onDone, onLater }: { cierre: CajaCierre; tz: string; online: boolean; validate: (input: ValidarBaseInput) => Promise<{ ok: true } | { ok: false; error: string }>; onDone: () => void; onLater: () => void }) {
  const [otra, setOtra] = React.useState(false);
  const [monto, setMonto] = React.useState("");
  const [porque, setPorque] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const base = cierre.base_dejada_cop;
  const n = monto ? Number(monto) : 0;
  const dif = n - base;
  const fecha = cierre.shift_date ?? cierre.submitted_at.slice(0, 10);

  async function send(ok: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await validate({ cierreId: cierre.id, ok, encontrado: ok ? undefined : n, nota: ok ? undefined : porque.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone();
  }

  return (
    <>
      <div className="cj-band amber" role="status">
        <IcoAlerta />
        <b>Valida la base que dejaron antes de abrir la caja.</b>
        <button type="button" className="cj-btn xs" style={{ marginLeft: "auto" }} onClick={onLater}>Ahora no</button>
      </div>
      <div className="cj-split" style={{ ["--cj-aside" as string]: otra ? "620px" : "440px" }}>
        <section className="cj-col">
          <div className="cj-card">
            <span className="cj-lab">Dejaron en el cajón</span>
            <span className="cj-slab cj-big">{plata(base)}</span>
            <span className="cj-mute" style={{ fontSize: 13 }}>
              {cierre.counted_by_name ?? "—"} · {fechaCorta(fecha)} {hora(cierre.submitted_at, tz)} · {STATUS[cierre.status]}
              {cierre.base_confirmada_at ? "" : " · quien cerró no confirmó la base"}
            </span>
            {cierre.base_denominaciones.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 16px", fontSize: 15, borderTop: "1.5px solid var(--rule)", paddingTop: 10 }}>
                {cierre.base_denominaciones.map((l) => (
                  <span key={l.valor}><b>{l.cantidad} ×</b> {plata(l.valor)}</span>
                ))}
              </div>
            ) : (
              <span className="cj-mute" style={{ fontSize: 13 }}>Ese cierre no guardó las piezas; valida solo el monto.</span>
            )}
          </div>
          <span className="cj-lab">Cuéntala y dinos</span>
          {error && <div role="alert" className="cj-warn red"><IcoAlerta />{error}</div>}
          {!online && <div className="cj-warn amber"><IcoAlerta />Sin internet: valida cuando vuelva.</div>}
          <button type="button" className="cj-btn green tall" disabled={busy || !online} onClick={() => void send(true)}><IcoCheck size={24} w={3} />{busy && !otra ? "Guardando…" : "Está completa"}</button>
          <button type="button" className="cj-btn tall" aria-expanded={otra} onClick={() => setOtra((o) => !o)}>{otra ? <IcoArriba /> : <IcoAbajo />}Encontré otra cantidad</button>
        </section>

        {otra ? (
          <section className="cj-validar-otra">
            <div className="cj-card" style={{ gap: 12 }}>
              <span className="cj-lab">¿Cuánto encontraste?</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span className="cj-slab" style={{ fontSize: 40, lineHeight: 1 }}>{plata(n)}</span>
                {monto && dif !== 0 && <span style={{ fontWeight: 800, color: dif < 0 ? "var(--red)" : "var(--amber)" }}>{dif < 0 ? `Faltan ${plata(-dif)}` : `Sobran ${plata(dif)}`}</span>}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="cj-lab">¿Por qué? · obligatorio</span>
                <input className="cj-field sm" value={porque} onChange={(e) => setPorque(e.target.value.slice(0, 300))} aria-label="Por qué la base es distinta" />
              </label>
              <div className="cj-chips">
                {FRASES.map((f) => (
                  <button key={f} type="button" className="cj-chip" style={{ minHeight: 48, fontSize: 13, padding: "6px 12px" }} aria-pressed={porque === f} onClick={() => setPorque(f)}>{f}</button>
                ))}
              </div>
              <button type="button" className="cj-btn red tall" disabled={busy || !online || !monto || porque.trim().length < 3} onClick={() => void send(false)}>
                {busy ? "Guardando…" : `Abrir caja con ${plata(n)}`}
              </button>
              <span className="cj-fine">El dueño lo ve en el panel. La diferencia queda a nombre del turno anterior, no del tuyo.</span>
            </div>
            <Keypad value={monto} onChange={setMonto} sinLimpiar label="Teclado de la base encontrada" />
          </section>
        ) : (
          <aside className="cj-aside">
            <div className="cj-info">Cuenta los billetes y monedas del cajón antes de la primera venta. Si coincide, toca «Está completa». Si no, escribe cuánto encontraste.</div>
          </aside>
        )}
      </div>
    </>
  );
}
