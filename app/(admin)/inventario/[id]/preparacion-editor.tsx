"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui";
import { costoPorUnidad, costoTanda } from "@/lib/inventario/preparaciones";
import { guardarPreparacion } from "./preparacion-actions";

interface Opcion { id: string; name: string; unit: string; costo: number }
interface Linea { ingredienteId: string; name: string; unit: string; qty: string; costo: number }

// Deterministic (no Intl): SSR and the browser must print the same string.
const money = (n: number) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const money2 = (n: number) => `$${(Math.round(n * 100) / 100).toString().replace(".", ",")}`;
const parse = (s: string) => {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const input = "min-h-11 px-3 rounded-xl border border-line bg-surface text-text text-[16px]";

/**
 * «Preparación de la casa» on an insumo's page: what one batch yields and
 * takes. With it, the tablet's «Preparaciones» registers batches (ingredients
 * out, yield in) and the insumo's cost follows its ingredients.
 */
export function PreparacionEditor({ id, unit, rinde: rindeInicial, lineas: inicial, opciones }: {
  id: string;
  unit: string;
  rinde: number | null;
  lineas: { ingredienteId: string; name: string; unit: string; qty: number; costo: number }[];
  opciones: Opcion[];
}) {
  const router = useRouter();
  const [activa, setActiva] = React.useState(rindeInicial != null);
  const [rinde, setRinde] = React.useState(rindeInicial != null ? String(rindeInicial).replace(".", ",") : "");
  const [lineas, setLineas] = React.useState<Linea[]>(inicial.map((l) => ({ ...l, qty: String(l.qty).replace(".", ",") })));
  const [buscar, setBuscar] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const usadas = new Set(lineas.map((l) => l.ingredienteId));
  const t = buscar.trim().toLowerCase();
  const hits = t ? opciones.filter((o) => !usadas.has(o.id) && o.name.toLowerCase().includes(t)).slice(0, 8) : [];
  const nums = lineas.map((l) => ({ qty: parse(l.qty), costo: l.costo }));
  const tanda = costoTanda(nums);
  const porUnidad = costoPorUnidad(nums, parse(rinde));

  async function guardar(quitar = false) {
    setBusy(true);
    setError(null);
    const r = await guardarPreparacion(
      quitar ? { id, rinde: null, lineas: [] } : { id, rinde: parse(rinde), lineas: lineas.map((l) => ({ ingredienteId: l.ingredienteId, qty: parse(l.qty) })) },
    );
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(quitar ? "Ya no es una preparación" : `Preparación guardada · ${money2(r.costo ?? 0)} / ${unit}`);
    if (quitar) {
      setActiva(false);
      setLineas([]);
      setRinde("");
    }
    router.refresh();
  }

  if (!activa) {
    return (
      <div className="bg-surface border border-line rounded-card p-4 flex flex-wrap items-center gap-3">
        <p className="ui-sub m-0 flex-1 min-w-[220px]">Si este insumo lo preparan ustedes (chantilly, jarabe, cold foam…), di qué lleva una tanda y cuánto rinde. La tablet registra cada tanda y el costo sale de sus ingredientes.</p>
        <Button size="sm" variant="ghost" onClick={() => setActiva(true)}>
          Es una preparación de la casa
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card p-4 flex flex-col gap-4">
      <label className="flex flex-wrap items-center gap-3">
        <span className="ui-label">Una tanda rinde</span>
        <input id="prep-rinde" value={rinde} onChange={(e) => setRinde(e.target.value)} inputMode="decimal" className={`${input} w-28 text-right ui-num`} aria-label="Rinde" />
        <span className="ui-sub">{unit}</span>
      </label>

      <div className="flex flex-col">
        {lineas.length === 0 ? <p className="ui-sub m-0">Agrega los ingredientes de una tanda.</p> : null}
        {lineas.map((l, i) => (
          <div key={l.ingredienteId} className="flex flex-wrap items-center gap-3 py-2 border-b border-line last:border-b-0">
            <span className="flex-1 min-w-[180px] ui-title">{l.name}</span>
            <input
              id={`prep-qty-${l.ingredienteId}`}
              value={l.qty}
              onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              inputMode="decimal"
              className={`${input} w-24 text-right ui-num`}
              aria-label={`Cantidad de ${l.name}`}
            />
            <span className="ui-sub w-10">{l.unit}</span>
            <span className="ui-num ui-sub w-24 text-right">{money(parse(l.qty) * l.costo)}</span>
            <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label={`Quitar ${l.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted bg-transparent border-0 cursor-pointer">
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="relative">
        <input id="prep-buscar" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Agregar ingrediente (whip, leche, vainilla…)" className={`${input} w-full`} aria-label="Buscar ingrediente" />
        {hits.length ? (
          <ul className="m-0 mt-1 p-0 list-none border border-line rounded-xl overflow-hidden">
            {hits.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className="w-full text-left min-h-11 px-3 bg-surface hover:bg-surface-2 border-0 border-b border-line cursor-pointer text-text"
                  onClick={() => {
                    setLineas((ls) => [...ls, { ingredienteId: o.id, name: o.name, unit: o.unit, qty: "", costo: o.costo }]);
                    setBuscar("");
                  }}
                >
                  {o.name} <span className="ui-sub">· {o.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 ui-num">
        <span>Costo de una tanda: <strong>{money(tanda)}</strong></span>
        <span>
          Costo por {unit}: <strong>{money2(porUnidad)}</strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => guardar()} loading={busy} disabled={busy}>
          Guardar preparación
        </Button>
        {rindeInicial != null ? (
          <Button size="sm" variant="ghost" onClick={() => guardar(true)} disabled={busy}>
            Ya no es una preparación
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setActiva(false)} disabled={busy}>
            Cancelar
          </Button>
        )}
        {error ? (
          <span role="alert" className="text-late text-[14px]">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
