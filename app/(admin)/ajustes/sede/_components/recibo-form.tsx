"use client";

import * as React from "react";
import { updateRecibo } from "../_actions";
import { Button, Field, TextArea } from "@/components/ui";

export type ReciboInitial = {
  recibo_encabezado: string;
  recibo_pie: string;
  transferencia_llave: string;
  transferencia_titular: string;
  datafono_liquidacion: string;
};

/**
 * What the POS prints on the customer's receipt (80 mm printer) and shows on
 * the payment pages. Empty fields are simply left off.
 */
export function ReciboForm({ initial }: { initial: ReciboInitial }) {
  const [v, setV] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const field = (k: keyof ReciboInitial) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setSaved(false); setV((p) => ({ ...p, [k]: e.target.value })); },
  });

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateRecibo(v);
      if ("error" in r && r.error) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <TextArea
        label="Encabezado del recibo"
        hint="Va debajo del nombre: NIT, dirección, teléfono… una cosa por línea."
        rows={4}
        maxLength={300}
        placeholder={"NIT 123.456.789-0\nCalle 00 # 00-00, Barrio\nTel. 300 000 0000"}
        {...field("recibo_encabezado")}
      />
      <TextArea
        label="Pie del recibo"
        hint="El cierre: «¡Gracias por tu visita!», tu Instagram, la clave del wifi…"
        rows={2}
        maxLength={200}
        placeholder="¡Gracias por tu visita! · @cafepayo"
        {...field("recibo_pie")}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-line pt-5">
        <Field label="Llave Bre-B / cuenta" hint="Se muestra al cobrar por transferencia." maxLength={80} {...field("transferencia_llave")} />
        <Field label="Titular de la cuenta" maxLength={80} {...field("transferencia_titular")} />
        <Field label="Datáfono: cuándo llega la plata" hint="Ej.: 1–2 días hábiles." maxLength={60} {...field("datafono_liquidacion")} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} loading={pending}>Guardar</Button>
        {saved ? <span className="text-ok font-semibold">✓ Cambios guardados</span> : null}
        {error ? <span role="alert" className="text-late font-semibold">{error}</span> : null}
      </div>
    </div>
  );
}
