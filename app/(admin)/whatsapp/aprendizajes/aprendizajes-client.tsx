"use client";

import { useState, useTransition } from "react";
import { Button, TextArea, toast } from "@/components/ui";
import type { MetricasDia } from "@/lib/whatsapp/aprendizajes";
import { decidirLeccion, revisarAhora } from "./actions";

export type LeccionVista = {
  id: string;
  texto: string;
  motivo: string | null;
  ejemplo: string | null;
  estado: "propuesta" | "aprobada";
  fecha_origen: string | null;
  created_at: string;
};
export type RevisionVista = { fecha: string; resumen: string | null; metricas: MetricasDia };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «2026-11-16» → «16 nov», by hand so server and browser agree. */
const dia = (fecha: string | null) => {
  if (!fecha) return "";
  const [, m, d] = fecha.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

export function AprendizajesClient({
  propuestas,
  activas,
  revisiones,
}: {
  propuestas: LeccionVista[];
  activas: LeccionVista[];
  revisiones: RevisionVista[];
}) {
  const [revisando, startRevision] = useTransition();
  return (
    <div className="flex flex-col" style={{ gap: 28 }}>
      <section>
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 12, marginBottom: 12 }}>
          <h2 className="ui-title m-0">Propuestas por revisar {propuestas.length ? `(${propuestas.length})` : ""}</h2>
          <Button
            variant="ghost"
            size="sm"
            loading={revisando}
            onClick={() =>
              startRevision(async () => {
                const r = await revisarAhora();
                toast(r.ok ? r.mensaje ?? "Listo." : r.error, r.ok ? "ok" : "late");
              })
            }
          >
            Revisar las conversaciones de hoy
          </Button>
        </div>
        {propuestas.length === 0 ? (
          <p className="text-muted m-0">
            No hay propuestas pendientes. Cada noche, a las 11:50 p. m., se revisan las conversaciones del día.
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: 12 }}>
            {propuestas.map((l) => (
              <Propuesta key={l.id} leccion={l} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="ui-title m-0" style={{ marginBottom: 4 }}>
          Lo que el agente sigue ahora ({activas.length})
        </h2>
        <p className="text-muted m-0" style={{ fontSize: 14, marginBottom: 12 }}>
          Entran a sus instrucciones en la siguiente respuesta. Retira las que ya no apliquen.
        </p>
        {activas.length === 0 ? (
          <p className="text-muted m-0">Todavía ninguna.</p>
        ) : (
          <ol className="m-0 p-0 flex flex-col" style={{ listStyle: "none", gap: 8 }}>
            {activas.map((l) => (
              <Activa key={l.id} leccion={l} />
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="ui-title m-0" style={{ marginBottom: 12 }}>
          Cómo le fue cada día
        </h2>
        {revisiones.length === 0 ? (
          <p className="text-muted m-0">Aún no hay revisiones.</p>
        ) : (
          <div className="flex flex-col" style={{ gap: 12 }}>
            {revisiones.map((r) => (
              <Revision key={r.fecha} r={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Propuesta({ leccion }: { leccion: LeccionVista }) {
  const [texto, setTexto] = useState(leccion.texto);
  const [pendiente, start] = useTransition();
  const decidir = (estado: "aprobada" | "descartada") =>
    start(async () => {
      const r = await decidirLeccion({ id: leccion.id, estado, ...(estado === "aprobada" ? { texto } : {}) });
      toast(r.ok ? (estado === "aprobada" ? "Aprobada: el agente ya la sigue." : "Descartada.") : r.error, r.ok ? "ok" : "late");
    });
  return (
    <div className="rounded-card border border-line bg-surface flex flex-col" style={{ padding: 16, gap: 10 }}>
      <TextArea
        label={`Lección propuesta${leccion.fecha_origen ? ` · conversaciones del ${dia(leccion.fecha_origen)}` : ""}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={400}
      />
      {leccion.motivo ? (
        <p className="m-0" style={{ fontSize: 14 }}>
          <span className="font-semibold">Por qué: </span>
          {leccion.motivo}
        </p>
      ) : null}
      {leccion.ejemplo ? (
        <blockquote
          className="m-0 text-muted rounded-btn"
          style={{ fontSize: 14, padding: "8px 12px", background: "var(--surface-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {leccion.ejemplo}
        </blockquote>
      ) : null}
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        <Button size="sm" loading={pendiente} disabled={texto.trim().length < 5} onClick={() => decidir("aprobada")}>
          {texto.trim() === leccion.texto.trim() ? "Aprobar" : "Aprobar con cambios"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => decidir("descartada")}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

function Activa({ leccion }: { leccion: LeccionVista }) {
  const [pendiente, start] = useTransition();
  return (
    <li className="rounded-card border border-line bg-surface flex items-start justify-between" style={{ padding: "10px 14px", gap: 12 }}>
      <span style={{ fontSize: 15 }}>{leccion.texto}</span>
      <Button
        size="sm"
        variant="ghost"
        loading={pendiente}
        onClick={() =>
          start(async () => {
            const r = await decidirLeccion({ id: leccion.id, estado: "retirada" });
            toast(r.ok ? "Retirada." : r.error, r.ok ? "ok" : "late");
          })
        }
      >
        Retirar
      </Button>
    </li>
  );
}

function Revision({ r }: { r: RevisionVista }) {
  const m = r.metricas;
  const datos: [string, string | number, boolean?][] = [
    ["Conversaciones", m.conversaciones ?? 0],
    ["Con pedido", `${m.conPedido ?? 0} · ${pct(m.conPedido ?? 0, m.conversaciones ?? 0)}`],
    ["Pasadas a persona", m.traspasos ?? 0],
    ["Intervino el equipo", m.intervenciones ?? 0],
    ["Sin respuesta", m.sinRespuesta ?? 0, (m.sinRespuesta ?? 0) > 0],
    ["No entregadas", m.fallidas ?? 0, (m.fallidas ?? 0) > 0],
  ];
  return (
    <div className="rounded-card border border-line bg-surface flex flex-col" style={{ padding: 16, gap: 10 }}>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
        <span className="font-bold" style={{ fontSize: 17 }}>{dia(r.fecha)}</span>
        {m.versiones?.length ? (
          <span className="text-muted cmd-num" style={{ fontSize: 12 }}>Versión {m.versiones.join(", ")}</span>
        ) : null}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {datos.map(([label, valor, alerta]) => (
          <div key={label} className="rounded-btn" style={{ padding: "8px 10px", background: "var(--surface-2)" }}>
            <div className="text-muted" style={{ fontSize: 12 }}>{label}</div>
            <div className="cmd-num font-bold" style={{ fontSize: 18, color: alerta ? "var(--red)" : undefined }}>{valor}</div>
          </div>
        ))}
      </div>
      {r.resumen ? <p className="m-0" style={{ fontSize: 15 }}>{r.resumen}</p> : null}
    </div>
  );
}
