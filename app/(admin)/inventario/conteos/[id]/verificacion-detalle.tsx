import { MOTIVOS, type Motivo } from "@/lib/inventario/agente/planificador";
import type { ConteoPanel, LineaPanel } from "@/lib/inventario/agente/db";
import { posMoney } from "@/lib/pos/types";
import { TONO, cantidad, diffDe, nombreCorto, plural, valorDe, type Tono } from "../_lib/formato";
import { RevisionLinea } from "./revision-linea";

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)" };
const pill = (t: Tono): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", background: TONO[t].bg, color: TONO[t].fg });
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 14, verticalAlign: "top" };
const SPARKLE = "M9 4h6v2H9zM7 5H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1M9 13l2 2 4-4";

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

function estadoLinea(l: LineaPanel, c: ConteoPanel): { label: string; tono: Tono } {
  if (l.revision === "revisar") return { label: "Por revisar", tono: "late" };
  if (l.revision === "rechazado") return { label: "Rechazado", tono: "neutral" };
  if (l.revision === "aplicado") return c.auto ? { label: "Se aplicó solo", tono: "ok" } : { label: "Aplicado", tono: "ok" };
  return { label: "—", tono: "neutral" };
}

/** «Por qué los pidió»: the reasons behind the lines, then what happened to them. */
function porQue(c: ConteoPanel): string {
  const grupos = new Map<Motivo | "otro", string[]>();
  for (const l of c.lineas) {
    const k = l.motivo ?? "otro";
    grupos.set(k, [...(grupos.get(k) ?? []), l.name.toLowerCase()]);
  }
  for (const n of c.noEncontrados) grupos.set(n.motivo, [...(grupos.get(n.motivo) ?? []), n.name.toLowerCase()]);
  const frases: string[] = [];
  for (const [m, nombres] of grupos) {
    if (m === "otro") frases.push(`${lista(nombres)}: sin motivo registrado.`);
    else frases.push(`${MOTIVOS[m].label} (${MOTIVOS[m].desc.charAt(0).toLowerCase()}${MOTIVOS[m].desc.slice(1)}): ${lista(nombres)}.`);
  }
  const aplicadas = c.lineas.filter((l) => l.revision === "aplicado").length;
  const revisar = c.lineas.filter((l) => l.revision === "revisar").length;
  const rechazadas = c.lineas.filter((l) => l.revision === "rechazado").length;
  const fin: string[] = [];
  if (aplicadas) fin.push(c.auto && !revisar ? `${aplicadas === 1 ? "La diferencia era normal y se aplicó sola" : `Las diferencias eran normales y las ${aplicadas} se aplicaron solas`}` : `${plural(aplicadas, "ya está", "ya están")} en el inventario`);
  if (revisar) fin.push(`${revisar === 1 ? "1 no cuadró y espera tu revisión" : `${revisar} no cuadraron y esperan tu revisión`}`);
  if (rechazadas) fin.push(plural(rechazadas, "se rechazó", "se rechazaron"));
  return [...frases, fin.length ? `${fin.join("; ")}.` : ""].filter(Boolean).join(" ");
}

/** Detail of one assistant verification: why, what was counted, and the lines waiting for the owner. */
export function VerificacionDetalle({ conteo }: { conteo: ConteoPanel }) {
  const revisar = conteo.lineas.filter((l) => l.revision === "revisar");
  const lineas = [...conteo.lineas].sort((a, b) => Number(b.revision === "revisar") - Number(a.revision === "revisar") || valorDe(a) - valorDe(b));
  const quien = conteo.countedBy ? nombreCorto(conteo.countedBy).split(" ")[0] : null;

  return (
    <div className="px-4 sm:px-7 pb-10 grid gap-6 items-start min-[900px]:grid-cols-[minmax(0,1fr)_360px]">
      <main className="flex flex-col gap-4 min-w-0">
        <section className="flex items-start" style={{ ...card, padding: "16px 18px", gap: 14, background: "var(--brand-soft)", borderColor: "var(--brand-soft)" }} aria-labelledby="pq-t">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d={SPARKLE} />
          </svg>
          <div>
            <h2 id="pq-t" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Por qué los pidió</h2>
            <p style={{ margin: "2px 0 0", fontSize: 14, lineHeight: "20px" }}>{porQue(conteo)}</p>
          </div>
        </section>

        <section style={{ ...card, padding: "18px 0 6px" }} aria-labelledby="it-t">
          <h2 id="it-t" style={{ margin: "0 18px 12px", fontSize: 18, fontWeight: 700 }}>Lo que se contó</h2>
          {lineas.length === 0 ? (
            <p style={{ margin: "0 18px 12px", fontSize: 14, color: "var(--muted)" }}>Ningún insumo tiene conteo en esta verificación.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th scope="col" style={th}>Insumo</th>
                    <th scope="col" style={th}>Por qué</th>
                    <th scope="col" style={{ ...th, textAlign: "right" }}>Esperado</th>
                    <th scope="col" style={{ ...th, textAlign: "right" }}>Contado</th>
                    <th scope="col" style={{ ...th, textAlign: "right" }}>Diferencia</th>
                    <th scope="col" style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const d = diffDe(l);
                    const v = valorDe(l);
                    const est = estadoLinea(l, conteo);
                    const color = d === 0 ? "var(--muted)" : d < 0 ? "var(--late)" : "var(--ok)";
                    return (
                      <tr key={l.id} style={{ background: l.revision === "revisar" ? "var(--late-soft)" : undefined, opacity: l.revision === "rechazado" ? 0.6 : 1 }}>
                        <td style={td}>
                          <b style={{ fontWeight: 600 }}>{l.name}</b>
                          {l.ubicacion && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.ubicacion}</span>}
                          {l.note && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>Nota: {l.note}</span>}
                        </td>
                        <td style={{ ...td, color: "var(--muted)", fontSize: 13 }}>{l.detalle ?? (l.motivo ? MOTIVOS[l.motivo].label : "—")}</td>
                        <td className="cmd-num" style={{ ...td, textAlign: "right", color: "var(--muted)", whiteSpace: "nowrap" }}>{cantidad(l.expected, l)}</td>
                        <td className="cmd-num" style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{cantidad(l.counted, l)}</td>
                        <td className="cmd-num" style={{ ...td, textAlign: "right", fontWeight: 600, color, whiteSpace: "nowrap" }}>
                          {d === 0 ? "cuadra" : `${d > 0 ? "+" : ""}${cantidad(d, l)}`}
                          {v < 0 && <span style={{ display: "block", fontSize: 12 }}>−{posMoney(-v)}</span>}
                        </td>
                        <td style={td}>
                          <span style={pill(est.tono)}>{est.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {conteo.noEncontrados.length > 0 && (
          <section style={{ ...card, padding: "16px 18px" }} className="flex flex-col gap-2" aria-labelledby="ne-t">
            <h2 id="ne-t" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>No se encontró</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>El equipo no lo encontró al ir a contarlo. Si debería haber, revisa dónde está guardado.</p>
            {conteo.noEncontrados.map((n, i) => (
              <div key={`${n.name}-${i}`} className="flex items-baseline" style={{ gap: 10, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 14 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{n.name}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{MOTIVOS[n.motivo].label}</span>
              </div>
            ))}
          </section>
        )}
      </main>

      <aside className="flex flex-col gap-3 min-w-0">
        {revisar.map((l) => (
          <RevisionLinea key={l.id} conteoId={conteo.id} linea={l} quien={quien} />
        ))}
        {revisar.length === 0 && (
          <section style={{ ...card, padding: 16 }} className="flex flex-col gap-1.5">
            <span style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Revisión</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>
              {conteo.auto ? "Nada que revisar: todo cuadró dentro de lo normal y se aplicó solo." : "Ya revisaste todo lo de esta verificación."}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
