"use client";

import * as React from "react";
import Link from "next/link";
import { groupForCount } from "@/lib/inventario/conteo";
import { NIVELES, ZONAS, cantidadLegible, guiaNivel, nivelDe, type Nivel, type NivelItem } from "@/lib/inventario/niveles";
import { fechaCorta } from "@/lib/utils";

export interface ExistenciaItem extends NivelItem {
  id: string;
  name: string;
  category_id: string | null;
  ubicacion: string | null;
  /** May be negative: sales that ran ahead of a purchase nobody recorded. */
  stock: number;
}

type Filtro = "todo" | "amarillo" | "rojo";
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "amarillo", label: "Poco" },
  { id: "rojo", label: "Se acabó" },
];

const chip: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: 3, border: "1.5px solid var(--rule)", color: "var(--ink)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", background: "transparent", cursor: "pointer" };

export function ExistenciasScreen({ sedeName, items, categorias, confiable, lastCountDay }: {
  sedeName: string;
  items: ExistenciaItem[];
  categorias: { id: string; label: string }[];
  /** A full count was approved at least once, so the numbers stand on something. */
  confiable: boolean;
  /** Day (YYYY-MM-DD at the sede) of the last quick count. */
  lastCountDay: string | null;
}) {
  const [filtro, setFiltro] = React.useState<Filtro>("todo");
  const rows = React.useMemo(() => items.map((i) => ({ ...i, nivel: nivelDe(i.stock, i.stock_critico, i.stock_min) as Nivel })), [items]);
  const counts = { todo: rows.length, amarillo: rows.filter((r) => r.nivel === "amarillo").length, rojo: rows.filter((r) => r.nivel === "rojo").length };
  const shown = filtro === "todo" ? rows : rows.filter((r) => r.nivel === filtro);
  const groups = groupForCount(shown, categorias, ZONAS);

  return (
    <div className="cmd-paper" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", flexShrink: 0 }}>
        <span className="font-slab" style={{ fontSize: 22 }}>Existencias<span style={{ color: "var(--red)" }}>.</span></span>
        <span className="hidden sm:inline" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".12em", textTransform: "uppercase" }}>{sedeName}</span>
        <Link href="/turno/inventario" style={{ ...chip, marginLeft: "auto" }}>← Inventario</Link>
      </div>

      <div style={{ padding: "16px 20px 40px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
        {!confiable && (
          <div style={{ border: "1px dashed var(--rule)", borderRadius: 6, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)", marginBottom: 14 }}>
            Todavía no se ha aprobado un conteo completo: estas cantidades son las que calcula el sistema y pueden no coincidir con el estante.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} style={{ ...chip, height: 44, background: filtro === f.id ? "var(--ink)" : "transparent", color: filtro === f.id ? "var(--paper-lt)" : "var(--ink)", borderColor: filtro === f.id ? "var(--ink)" : "var(--rule)" }}>
              {f.label} · {counts[f.id]}
            </button>
          ))}
          {lastCountDay && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>último conteo rápido: {fechaCorta(lastCountDay)}</span>}
        </div>

        {groups.length === 0 && <div style={{ padding: "28px 0", fontSize: 13, color: "var(--muted)" }}>Nada en este nivel.</div>}
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "16px 0 6px", borderBottom: "1px solid var(--ink)" }}>{g.label} · {g.items.length}</div>
            {g.items.map((i) => {
              const guia = guiaNivel(i);
              return (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "8px 0", borderBottom: "1px dashed var(--rule)" }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: NIVELES[i.nivel].color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</span>
                    {guia && <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{guia}</span>}
                  </span>
                  <span className="cmd-num" style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{i.stock < 0 ? "sin dato" : cantidadLegible(i.stock, i)}</span>
                  <span style={{ width: 74, textAlign: "right", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: NIVELES[i.nivel].color }}>{i.stock < 0 ? "contar" : NIVELES[i.nivel].short}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
