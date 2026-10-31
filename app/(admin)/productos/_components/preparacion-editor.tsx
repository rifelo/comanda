"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Banner, toast } from "@/components/ui/feedback";
import { TextArea } from "@/components/ui/field";
import { updatePreparacion } from "../receta-actions";

/**
 * Preparation steps, one per line (the POS recipe sheet numbers them).
 * Explicit save — a half-typed step never reaches the bar.
 */
export function PreparacionEditor({ productoId, initial }: { productoId: string; initial: string }) {
  const router = useRouter();
  const [text, setText] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = text.trim() !== initial.trim();
  const pasos = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await updatePreparacion({ producto_id: productoId, preparacion: text });
    setSaving(false);
    if ("error" in r && r.error) return setError(r.error);
    toast("Pasos guardados", "ok");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Banner tone="late" onClose={() => setError(null)}>
          {error}
        </Banner>
      ) : null}
      <TextArea
        id="prep"
        label="Un paso por línea"
        hint="El barista los ve numerados al mantener presionado el producto en el POS."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(14, Math.max(5, pasos.length + 2))}
        maxLength={2000}
        placeholder={"Muele 18 g y extrae 36 g en 28 s\nTexturiza 150 ml de leche a 60 °C\nSirve en vaso de 12 oz"}
      />
      {pasos.length ? (
        <ol className="m-0 pl-0 list-none flex flex-col gap-2" aria-label="Vista previa">
          {pasos.map((p, i) => (
            <li key={i} className="flex gap-3 items-start bg-surface border border-line rounded-btn px-4 py-3">
              <span className="size-7 shrink-0 rounded-full bg-strong text-on-strong text-sm font-bold flex items-center justify-center ui-num">{i + 1}</span>
              <span className="text-[16px] leading-snug">{p}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="sticky bottom-3 z-10">
        <Button block onClick={save} disabled={!dirty} loading={saving}>
          {dirty ? "Guardar pasos" : "Sin cambios"}
        </Button>
      </div>
    </div>
  );
}
