"use client";

/**
 * 11 · Combos — card editor with native HTML5 drag-and-drop reorder of
 * linked products. No external DnD library — the prototype's spec was a
 * simple "drag the handle to reorder", which native dataTransfer covers.
 */
import * as React from "react";
import {
  COMBOS,
  type Combo,
  type ComboLinked,
  fmtCOP,
} from "@/lib/mock/productos";
import { Scribble, Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, Thumb } from "../_components/shared";
import { Chip } from "../_components/chip";

export function CombosClient() {
  const [combos, setCombos] = React.useState<Combo[]>(COMBOS);

  const reorder = (comboId: string, from: number, to: number) => {
    setCombos((cs) =>
      cs.map((c) => {
        if (c.id !== comboId) return c;
        const arr = c.linked.slice();
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return { ...c, linked: arr };
      }),
    );
  };

  return (
    <div>
      <SectionCrumb
        section="combos"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Ver inactivos
            </button>
            <button type="button" className="cmd-btn sm">
              + Crear combo
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px 28px" }}>
        <div
          className="cmd-paper-lt"
          style={{
            border: "1px dashed var(--rule)",
            padding: "12px 16px",
            marginBottom: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--ink-2)", flex: 1, minWidth: 280 }}>
            Los combos son productos vinculados que se cobran como uno solo. Al
            venderlos, Comanda descuenta el stock de cada producto enlazado por
            separado.
          </div>
          <div className="flex" style={{ gap: 10 }}>
            <Chip active>Todos</Chip>
            <Chip>Activos</Chip>
            <Chip>Borradores</Chip>
            <Chip>Programados</Chip>
          </div>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {combos.map((c) => (
            <ComboCard key={c.id} combo={c} onReorder={reorder} />
          ))}

          {/* "new combo" placeholder card */}
          <button
            type="button"
            style={{
              border: "2px dashed var(--ink)",
              background: "transparent",
              minHeight: 360,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              gap: 10,
              cursor: "pointer",
              padding: 16,
            }}
          >
            <div
              className="font-slab"
              style={{ fontSize: 32, color: "var(--ink)" }}
            >
              +
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Crear combo
            </div>
            <div
              style={{
                fontSize: 10,
                maxWidth: 220,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              busca un producto principal y arrastra vinculados desde el catálogo
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function ComboCard({
  combo,
  onReorder,
}: {
  combo: Combo;
  onReorder: (comboId: string, from: number, to: number) => void;
}) {
  const sumIndividual =
    combo.main.price + combo.linked.reduce((s, x) => s + x.qty * x.price, 0);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);

  return (
    <div
      className="cmd-noise cmd-paper-lt relative flex flex-col"
      style={{
        border: "1.5px solid var(--ink)",
        opacity: combo.active ? 1 : 0.62,
      }}
    >
      {/* header */}
      <div
        className="bg-paper"
        style={{
          padding: "14px 16px 12px",
          borderBottom: "1.5px solid var(--ink)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Combo · #{combo.id.toUpperCase()}
          </div>
          <div
            className="font-slab"
            style={{ fontSize: 22, marginTop: 2, lineHeight: 1.05 }}
          >
            {combo.name}
          </div>
          <div
            style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4 }}
          >
            <Scribble size={13} rotate={-1}>
              {combo.sub}
            </Scribble>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Stamp
            rotate={-3}
            color={combo.active ? "var(--green)" : "var(--muted)"}
          >
            {combo.active ? "activo" : "borrador"}
          </Stamp>
        </div>
      </div>

      {/* main */}
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px dashed var(--rule)",
        }}
      >
        <Thumb w={54} h={54} label={combo.main.name.split(" ")[0]} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Producto principal
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {combo.main.name}
          </div>
        </div>
        <div className="cmd-num" style={{ fontSize: 14, fontWeight: 500 }}>
          ${fmtCOP(combo.main.price)}
        </div>
      </div>

      {/* linked */}
      <div style={{ padding: "12px 16px 6px", flex: 1 }}>
        <div
          className="text-muted"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Vinculados · arrastra para reordenar
        </div>
        {combo.linked.map((p, i) => (
          <LinkedRow
            key={`${combo.id}-${i}-${p.name}`}
            combo={combo}
            row={p}
            idx={i}
            last={i === combo.linked.length - 1}
            dragIdx={dragIdx}
            overIdx={overIdx}
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragOverRow={(e) => {
              e.preventDefault();
              if (dragIdx == null) return;
              setOverIdx(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx == null || dragIdx === i) return;
              onReorder(combo.id, dragIdx, i);
              setDragIdx(null);
              setOverIdx(null);
            }}
          />
        ))}
        <button
          type="button"
          style={{
            background: "none",
            border: "1px dashed var(--rule)",
            padding: "6px 10px",
            fontSize: 10,
            color: "var(--muted)",
            cursor: "pointer",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginTop: 8,
            width: "100%",
            minHeight: 0,
          }}
        >
          + agregar producto vinculado
        </button>
      </div>

      {/* totals */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--paper-dk)",
          borderTop: "1.5px solid var(--ink)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          fontSize: 11,
        }}
      >
        <div className="text-muted">Suma individual</div>
        <div
          className="cmd-num text-muted"
          style={{ textAlign: "right", textDecoration: "line-through" }}
        >
          ${fmtCOP(sumIndividual)}
        </div>
        <div style={{ color: "var(--ink)", fontWeight: 600 }}>Precio combo</div>
        <div
          className="cmd-num font-slab"
          style={{
            textAlign: "right",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--ink)",
          }}
        >
          ${fmtCOP(combo.comboPrice)}
        </div>
        <div
          style={{
            color: "var(--green)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontSize: 10,
          }}
        >
          Ahorra
        </div>
        <div
          className="cmd-num"
          style={{
            textAlign: "right",
            color: "var(--green)",
            fontWeight: 600,
          }}
        >
          − ${fmtCOP(combo.saving)}
        </div>
      </div>
    </div>
  );
}

function LinkedRow({
  row,
  idx,
  last,
  dragIdx,
  overIdx,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDrop,
}: {
  combo: Combo;
  row: ComboLinked;
  idx: number;
  last: boolean;
  dragIdx: number | null;
  overIdx: number | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverRow: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const isDragging = dragIdx === idx;
  const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverRow}
      onDrop={onDrop}
      style={{
        display: "grid",
        gridTemplateColumns: "14px 32px 1fr 80px 80px 18px",
        gap: 10,
        alignItems: "center",
        padding: "7px 0",
        borderBottom: last ? "none" : "1px dashed var(--rule-soft)",
        background: isOver ? "rgba(176,58,46,0.08)" : "transparent",
        opacity: isDragging ? 0.45 : 1,
        cursor: "grab",
      }}
    >
      <span
        className="text-muted"
        style={{ fontSize: 12, cursor: "grab" }}
        aria-label="reordenar"
      >
        ⋮⋮
      </span>
      <Thumb w={32} h={32} label={row.name.split(" ")[0]} />
      <div style={{ fontSize: 12 }}>{row.name}</div>
      <div
        className="flex items-center"
        style={{ gap: 4, justifyContent: "flex-end" }}
      >
        <QtyBtn>−</QtyBtn>
        <span
          className="cmd-num"
          style={{ fontSize: 12, minWidth: 14, textAlign: "center" }}
        >
          {row.qty}
        </span>
        <QtyBtn>+</QtyBtn>
      </div>
      <div
        className="cmd-num text-muted"
        style={{ fontSize: 12, textAlign: "right" }}
      >
        ${fmtCOP(row.price)}
      </div>
      <span
        className="text-muted"
        style={{ fontSize: 12, cursor: "pointer" }}
      >
        ✕
      </span>
    </div>
  );
}

function QtyBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      style={{
        background: "none",
        border: "1px solid var(--rule)",
        padding: "1px 5px",
        fontSize: 10,
        cursor: "pointer",
        minHeight: 0,
      }}
    >
      {children}
    </button>
  );
}
