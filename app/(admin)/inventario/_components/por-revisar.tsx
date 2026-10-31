"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { aprobarConteo } from "../conteos/actions";
import { aplicarUbicacion, descartarSugerencia } from "../sugerencias/actions";
import { MOTIVO_MERMA, type MotivoMerma } from "@/lib/inventario/mermas";
import { Button } from "@/components/ui/button";
import { Banner, toast } from "@/components/ui/feedback";
import { CountBadge } from "@/components/ui/pill";
import { cantidad, pesos } from "../../productos/_components/bits";

export interface PorRevisarData {
  negativos: { id: string; name: string; unit: string; stock: number }[];
  sinCosto: { id: string; name: string; unit: string; recetas: number }[];
  conteos: { id: string; kind: string; quien: string | null; cuando: string; lineas: number; conDiferencia: number; neto: number; propuestas: number }[];
  ayerSinConteo: boolean;
  sugerencias: { id: string; tipo: "ubicacion" | "nuevo"; zona: string; nombre: string; quien: string | null }[];
  mermas: { id: string; nombre: string; qty: number; unidad: string; costo: number; motivo: string; cuando: string; quien: string | null }[];
}

export function totalPorRevisar(d: PorRevisarData): number {
  return d.negativos.length + d.sinCosto.length + d.conteos.length + d.sugerencias.length;
}

const LI = "flex items-center gap-3 min-h-[60px] py-2 border-b border-line last:border-b-0";

/**
 * «Por revisar» — what needs the owner before the numbers can be trusted:
 * items below zero (Corregir), counts waiting (one-tap Aprobar), ingredients
 * used in recipes without a cost, the team's suggestions, recent mermas.
 */
export function PorRevisar({ d, onCorregir, onEditar }: { d: PorRevisarData; onCorregir: (id: string) => void; onEditar: (id: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [todosNeg, setTodosNeg] = React.useState(false);
  const total = totalPorRevisar(d);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; adjusted: number }>, ok: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast("error" in r && r.error ? r.error : "No se pudo.", "late");
    toast(ok, "ok");
    router.refresh();
  }

  if (total === 0 && d.mermas.length === 0 && !d.ayerSinConteo) {
    return (
      <section aria-label="Por revisar" className="bg-ok-soft rounded-card px-5 py-4">
        <p className="m-0 ui-title text-ok">Nada por revisar</p>
        <p className="m-0 ui-sub mt-0.5">Sin negativos, sin conteos esperando y todos los insumos con costo.</p>
      </section>
    );
  }

  const negVisibles = todosNeg ? d.negativos : d.negativos.slice(0, 5);
  return (
    <section aria-labelledby="pr-h" className="flex flex-col gap-3" data-testid="por-revisar">
      <h2 id="pr-h" className="ui-h2 m-0 flex items-center gap-2">
        Por revisar {total ? <CountBadge value={total} /> : null}
      </h2>

      {d.ayerSinConteo ? <Banner tone="brand">Ayer nadie hizo el conteo de cierre.</Banner> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {d.negativos.length ? (
          <Bloque titulo="En negativo" sub="Se vendió más de lo que entró: corrige con lo que hay" n={d.negativos.length} tono="late">
            <ul className="m-0 p-0 list-none">
              {negVisibles.map((i) => (
                <li key={i.id} className={LI}>
                  <Link href={`/inventario/${i.id}`} className="flex-1 min-w-0 text-text no-underline">
                    <span className="ui-title block truncate">{i.name}</span>
                    <span className="ui-sub ui-num text-late">
                      {cantidad(i.stock)} {i.unit}
                    </span>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => onCorregir(i.id)} data-testid={`corregir-neg-${i.id}`}>
                    Corregir
                  </Button>
                </li>
              ))}
            </ul>
            {d.negativos.length > 5 ? (
              <button type="button" onClick={() => setTodosNeg((v) => !v)} className="min-h-11 bg-transparent border-0 text-text font-semibold cursor-pointer px-0 text-left">
                {todosNeg ? "Ver menos" : `Ver los ${d.negativos.length}`}
              </button>
            ) : null}
          </Bloque>
        ) : null}

        {d.conteos.length ? (
          <Bloque titulo="Conteos por aprobar" sub="Al aprobar, las diferencias ajustan el inventario" n={d.conteos.length}>
            <ul className="m-0 p-0 list-none">
              {d.conteos.map((c) => (
                <li key={c.id} className={LI}>
                  <Link href={`/inventario/conteos/${c.id}`} className="flex-1 min-w-0 text-text no-underline">
                    <span className="ui-title block truncate">
                      Conteo {c.kind} · {c.quien ?? "equipo"}
                    </span>
                    <span className="ui-sub ui-num">
                      {c.cuando} · {c.lineas} ítems · {c.conDiferencia} con diferencia · {pesos(c.neto)}
                    </span>
                  </Link>
                  {c.propuestas > 0 ? (
                    <Button size="sm" variant="ghost" href={`/inventario/conteos/${c.id}`}>
                      Revisar
                    </Button>
                  ) : (
                    <Button size="sm" loading={busy === c.id} onClick={() => run(c.id, () => aprobarConteo({ id: c.id }), "Conteo aprobado")}>
                      Aprobar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>
        ) : null}

        {d.sinCosto.length ? (
          <Bloque titulo="Sin costo" sub="Están en recetas a $0: el margen miente" n={d.sinCosto.length}>
            <ul className="m-0 p-0 list-none">
              {d.sinCosto.slice(0, 6).map((i) => (
                <li key={i.id} className={LI}>
                  <span className="flex-1 min-w-0">
                    <span className="ui-title block truncate">{i.name}</span>
                    <span className="ui-sub">
                      {i.recetas} receta{i.recetas === 1 ? "" : "s"} · por {i.unit}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onEditar(i.id)}>
                    Poner costo
                  </Button>
                </li>
              ))}
            </ul>
            {d.sinCosto.length > 6 ? <p className="ui-sub m-0 mt-1">y {d.sinCosto.length - 6} más (filtra «Sin costo» abajo).</p> : null}
          </Bloque>
        ) : null}

        {d.sugerencias.length ? (
          <Bloque titulo="Sugerencias del equipo" sub="Desde la tablet: dónde va un ítem o qué falta en la lista" n={d.sugerencias.length} href="/inventario/sugerencias">
            <ul className="m-0 p-0 list-none">
              {d.sugerencias.slice(0, 5).map((s) => (
                <li key={s.id} className={LI}>
                  <span className="flex-1 min-w-0">
                    <span className="ui-title block truncate">{s.nombre}</span>
                    <span className="ui-sub">
                      {s.tipo === "ubicacion" ? `Va en ${s.zona}` : `Falta en ${s.zona}`}
                      {s.quien ? ` · ${s.quien}` : ""}
                    </span>
                  </span>
                  {s.tipo === "ubicacion" ? (
                    <>
                      <Button size="sm" variant="ghost" loading={busy === `d${s.id}`} onClick={() => run(`d${s.id}`, () => descartarSugerencia({ id: s.id }), "Descartada")}>
                        No
                      </Button>
                      <Button size="sm" loading={busy === s.id} onClick={() => run(s.id, () => aplicarUbicacion({ id: s.id }), `Movido a ${s.zona}`)}>
                        Mover
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" href="/inventario/sugerencias">
                      Ver
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>
        ) : null}

        {d.mermas.length ? (
          <Bloque titulo="Mermas de la semana" sub={`${pesos(d.mermas.reduce((n, m) => n + m.costo, 0))} perdidos`} href="/inventario/mermas">
            <ul className="m-0 p-0 list-none">
              {d.mermas.map((m) => (
                <li key={m.id} className={LI}>
                  <span className="flex-1 min-w-0">
                    <span className="ui-title block truncate">
                      {cantidad(m.qty)} {m.unidad} · {m.nombre}
                    </span>
                    <span className="ui-sub">
                      {MOTIVO_MERMA[m.motivo as MotivoMerma]?.label ?? m.motivo} · {m.cuando}
                      {m.quien ? ` · ${m.quien}` : ""}
                    </span>
                  </span>
                  <span className="ui-num ui-title">{pesos(m.costo)}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        ) : null}
      </div>
    </section>
  );
}

function Bloque({ titulo, sub, n, tono, href, children }: { titulo: string; sub?: string; n?: number; tono?: "late"; href?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-card px-4 sm:px-5 py-4 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {tono === "late" ? <AlertTriangle size={20} aria-hidden className="text-late mt-0.5 shrink-0" /> : null}
        <div className="flex-1 min-w-0">
          <h3 className="ui-title m-0 flex items-center gap-2">
            {titulo} {n ? <span className="ui-num text-muted">· {n}</span> : null}
          </h3>
          {sub ? <p className="ui-sub m-0">{sub}</p> : null}
        </div>
        {href ? (
          <Link href={href} aria-label={`Ver ${titulo}`} className="size-11 min-h-11 -mr-2 -mt-2 flex items-center justify-center text-muted">
            <ChevronRight size={20} aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}
