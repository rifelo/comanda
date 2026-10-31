"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cantidadLegible, nombrePaquete, piezaDe } from "@/lib/inventario/niveles";
import { cantidadDesdeTeclado, MOTIVO_CORRECCION, MOTIVOS_CORRECCION, planCorreccion, tecladoDesdeCantidad, valorCambio, type MotivoCorreccion } from "@/lib/inventario/corregir";
import { Button } from "@/components/ui/button";
import { Chip, Chips } from "@/components/ui/chips";
import { toast } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { applyKey, Keypad } from "@/components/ui/keypad";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { corregirStock } from "../actions";
import { cantidad, pesos } from "../../productos/_components/bits";

export interface InsumoCorregir {
  id: string;
  name: string;
  unit: string;
  stock_current: number;
  cost_cop: number;
  pack_qty: number | null;
  pack_label: string | null;
  pieza_qty: number | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];

/**
 * «Corregir» — «¿Cuánto hay?» on a keypad (the total, never a delta; in
 * bolsas when the item is counted by the piece), a reason chip and one
 * «Guardar». The reason decides the movement (lib/inventario/corregir).
 * `recetaHref` is where «Error de receta» sends the owner next.
 */
export function CorregirSheet({ item, onClose, recetaHref }: { item: InsumoCorregir; onClose: () => void; recetaHref?: string | null }) {
  const router = useRouter();
  const pieza = piezaDe(item);
  const [enPiezas, setEnPiezas] = React.useState(pieza != null);
  const unidadTeclado = enPiezas && pieza ? nombrePaquete(item, 2) : item.unit;
  const [texto, setTexto] = React.useState("");
  const [motivo, setMotivo] = React.useState<MotivoCorreccion | null>(null);
  const [precio, setPrecio] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hecho, setHecho] = React.useState<null | { motivo: MotivoCorreccion }>(null);

  const piezaActiva = enPiezas ? pieza : null;
  const nuevo = cantidadDesdeTeclado(texto, piezaActiva);
  const precioNum = precio ? Number(precio.replace(/\./g, "").replace(",", ".")) : null;
  const plan = nuevo != null && motivo ? planCorreccion({ actual: item.stock_current, nuevo, motivo, costoUnit: item.cost_cop, precio: precioNum }) : null;
  const delta = nuevo != null ? Math.round((nuevo - item.stock_current) * 1000) / 1000 : null;

  function cambiarUnidad(v: "pieza" | "unidad") {
    const piezas = v === "pieza";
    if (piezas === enPiezas) return;
    if (nuevo != null) setTexto(tecladoDesdeCantidad(nuevo, piezas ? pieza : null));
    setEnPiezas(piezas);
  }

  async function save() {
    setError(null);
    if (!plan) return setError(nuevo == null ? "Escribe cuánto hay." : "Elige por qué cambia.");
    if (!plan.ok) return setError(plan.error);
    setSaving(true);
    const r = await corregirStock({ id: item.id, nuevo, motivo, precio: motivo === "compra" ? precioNum : null, nota: nota || undefined });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(`${item.name}: ahora hay ${cantidadLegible(r.stock, item)}`, "ok");
    router.refresh();
    if (motivo === "receta" && recetaHref) setHecho({ motivo });
    else onClose();
  }

  const actualTxt = item.stock_current < 0 ? `−${cantidadLegible(-item.stock_current, item)}` : cantidadLegible(item.stock_current, item);

  if (hecho) {
    return (
      <Sheet open onClose={onClose} title="Corrección guardada" side="center">
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[17px]">El inventario de {item.name} ya está bien. Si las ventas lo vuelven a descuadrar, el problema es la receta: revisa cuánto lleva.</p>
          <Button href={recetaHref!} block>
            Revisar la receta
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            Listo
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Corregir ${item.name}`}
      footer={
        <Button block size="lg" onClick={save} loading={saving} disabled={nuevo == null || !motivo} data-testid="corregir-guardar">
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="ui-sub m-0">
          El sistema dice <b className={cn("text-text", item.stock_current < 0 && "text-late")}>{actualTxt}</b>
          {pieza ? (
            <>
              {" "}
              ({cantidad(item.stock_current)} {item.unit})
            </>
          ) : null}
          .
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="ui-title">¿Cuánto hay?</span>
            {pieza ? (
              <Segmented
                size="sm"
                label="Unidad"
                value={enPiezas ? "pieza" : "unidad"}
                onChange={cambiarUnidad}
                options={[
                  { value: "pieza", label: nombrePaquete(item, 2) },
                  { value: "unidad", label: item.unit },
                ]}
              />
            ) : null}
          </div>
          <div className="h-[72px] rounded-btn bg-surface-2 border border-line flex items-baseline justify-end gap-2 px-5" aria-live="polite" data-testid="corregir-valor">
            <span className="ui-big ui-num leading-[72px]">{texto || "0"}</span>
            <span className="ui-title text-muted">{unidadTeclado}</span>
          </div>
          {nuevo != null && delta != null ? (
            <p className="ui-sub m-0 text-right ui-num">
              {piezaActiva ? `= ${cantidad(nuevo)} ${item.unit} · ` : ""}
              {delta === 0 ? "sin cambio" : `${delta > 0 ? "+" : "−"}${cantidad(Math.abs(delta))} ${item.unit} (${pesos(valorCambio(delta, item.cost_cop))})`}
            </p>
          ) : null}
          <Keypad keys={KEYS} onKey={(k) => setTexto((t) => applyKey(t, k, 9))} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="ui-title">¿Por qué?</span>
          <Chips label="Motivo">
            {MOTIVOS_CORRECCION.map((m) => (
              <Chip key={m} pressed={motivo === m} onClick={() => setMotivo(m)} data-testid={`motivo-${m}`}>
                {MOTIVO_CORRECCION[m].label}
              </Chip>
            ))}
          </Chips>
          {motivo ? <p className="ui-sub m-0">{MOTIVO_CORRECCION[motivo].hint}</p> : null}
        </div>

        {motivo === "compra" ? (
          <Field
            id="corr-precio"
            label="¿Cuánto costó? (opcional)"
            inputMode="numeric"
            value={precio}
            onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ""))}
            hint={plan?.ok && plan.plan.unitCost > 0 && precioNum ? `${pesos(plan.plan.unitCost, { unit: true })} por ${item.unit}: queda como último costo` : "El total pagado; si lo pones, actualiza el costo del insumo."}
          />
        ) : null}
        {motivo ? <Field id="corr-nota" label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={120} placeholder={motivo === "receta" ? "El latte lleva 230 ml, no 200" : ""} /> : null}
        {motivo === "receta" && recetaHref ? (
          <p className="ui-sub m-0">
            Después de guardar te llevamos a{" "}
            <Link href={recetaHref} className="text-text font-semibold">
              la receta que más lo usa
            </Link>
            .
          </p>
        ) : null}

        {error || (plan && !plan.ok) ? <p className="m-0 text-[15px] font-semibold text-late" role="alert">{error ?? (plan && !plan.ok ? plan.error : "")}</p> : null}
      </div>
    </Sheet>
  );
}
