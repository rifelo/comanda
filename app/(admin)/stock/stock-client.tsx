"use client";

/**
 * 04 · Control de Stock — tabs (productos · ingredientes), KPI cards, stock list.
 * Modal "Ajuste manual" lives inline and is opened per-row.
 */
import * as React from "react";
import { STOCK_ITEMS, type StockItem } from "@/lib/mock/productos";
import { Stamp } from "@/components/comanda/primitives";
import { SectionCrumb, StockBar } from "../_components/shared";

const GRID = "1.6fr 1fr 90px 110px 1.2fr 130px 180px";

export function StockClient() {
  const [tab, setTab] = React.useState<"productos" | "ingredientes">(
    "productos",
  );
  const [adjust, setAdjust] = React.useState<StockItem | null>(null);

  const items = STOCK_ITEMS[tab];
  const total = items.length;
  const okCount = items.filter((i) => i.current >= i.min).length;
  const lowCount = items.filter((i) => i.current > 0 && i.current < i.min).length;
  const outCount = items.filter((i) => i.current <= 0).length;

  return (
    <div>
      <SectionCrumb
        section="stock"
        right={
          <>
            <button type="button" className="cmd-btn ghost sm">
              Ver historial
            </button>
            <button type="button" className="cmd-btn sm">
              Ajuste masivo
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        {/* tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1.5px solid var(--ink)",
            marginBottom: 18,
          }}
        >
          {(
            [
              {
                id: "productos" as const,
                label: `Productos · ${STOCK_ITEMS.productos.length}`,
              },
              {
                id: "ingredientes" as const,
                label: `Ingredientes · ${STOCK_ITEMS.ingredientes.length}`,
              },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? "var(--ink)" : "transparent",
                color: tab === t.id ? "var(--paper-lt)" : "var(--ink)",
                border: "none",
                borderBottom:
                  tab === t.id ? "2px solid var(--red)" : "none",
                padding: "8px 16px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                minHeight: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI cards */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <KpiCard label="Stock OK" value={okCount} caption={`de ${total} items`} color="var(--green)" />
          <KpiCard label="Stock bajo" value={lowCount} caption="requiere reposición" color="var(--amber)" />
          <KpiCard
            label="Sin stock"
            value={outCount}
            caption="bloqueado en POS"
            color="var(--red)"
            stamp={outCount > 0 ? "urgente" : undefined}
          />
        </div>

        {/* list */}
        <div
          className="cmd-paper-lt"
          style={{ border: "1.5px solid var(--ink)" }}
        >
          <div
            className="bg-paper"
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: 12,
              padding: "8px 14px",
              borderBottom: "1.5px solid var(--ink)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            <span>Item</span>
            <span>Categoría</span>
            <span style={{ textAlign: "right" }}>Actual</span>
            <span style={{ textAlign: "right" }}>Mín · Unidad</span>
            <span>Nivel de stock</span>
            <span>Actualizado</span>
            <span>Acciones</span>
          </div>
          {items.map((it, i) => {
            const max = Math.max(it.min * 2.5, it.current * 1.15);
            return (
              <div
                key={it.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  gap: 12,
                  padding: "12px 14px",
                  alignItems: "center",
                  borderBottom: "1px dashed var(--rule-soft)",
                  background:
                    i % 2 ? "var(--paper-lt)" : "var(--paper)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {it.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {it.cat}
                </div>
                <div
                  className="cmd-num"
                  style={{
                    textAlign: "right",
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      it.current <= 0
                        ? "var(--red)"
                        : it.current < it.min
                          ? "var(--amber)"
                          : "var(--ink)",
                  }}
                >
                  {it.current}
                </div>
                <div
                  className="cmd-num text-muted"
                  style={{ textAlign: "right", fontSize: 11 }}
                >
                  {it.min} {it.unit}
                </div>
                <StockBar
                  value={it.current}
                  min={it.min}
                  max={max}
                  unit={it.unit}
                />
                <div className="text-muted" style={{ fontSize: 10 }}>
                  {it.updated}
                </div>
                <div className="flex" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="cmd-btn ghost sm"
                    style={{ padding: "5px 8px" }}
                    onClick={() => setAdjust(it)}
                  >
                    ± ajustar
                  </button>
                  <button
                    type="button"
                    className="cmd-btn ghost sm"
                    style={{ padding: "5px 8px" }}
                  >
                    historial
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adjust ? (
        <AdjustModal item={adjust} onClose={() => setAdjust(null)} />
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  caption,
  color,
  stamp,
}: {
  label: string;
  value: number;
  caption: string;
  color: string;
  stamp?: string;
}) {
  return (
    <div
      className="cmd-paper-lt relative"
      style={{ border: `1.5px solid ${color}`, padding: 14 }}
    >
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        className="cmd-num font-slab"
        style={{ fontSize: 34, lineHeight: 1, marginTop: 4, color }}
      >
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
        {caption}
      </div>
      {stamp ? (
        <div style={{ position: "absolute", top: -10, right: 14 }}>
          <Stamp color={color} rotate={-5}>
            {stamp}
          </Stamp>
        </div>
      ) : null}
    </div>
  );
}

function AdjustModal({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const [delta, setDelta] = React.useState("0");
  const [reason, setReason] = React.useState("merma");
  const parsed = Number(delta);
  const nextBal = Number.isFinite(parsed) ? item.current + parsed : item.current;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ajuste manual · ${item.name}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31,26,20,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="cmd-paper-lt"
        onClick={(e) => e.stopPropagation()}
        style={{
          border: "1.5px solid var(--ink)",
          maxWidth: 460,
          width: "100%",
          boxShadow: "4px 4px 0 rgba(0,0,0,.12)",
        }}
      >
        <div
          className="bg-paper"
          style={{
            padding: "14px 16px",
            borderBottom: "1.5px solid var(--ink)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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
              Ajuste manual
            </div>
            <div className="font-slab" style={{ fontSize: 20, marginTop: 2 }}>
              {item.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cmd-link"
            style={{
              fontSize: 13,
              background: "none",
              border: "none",
              minHeight: 0,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 18 }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Saldo actual
              </div>
              <div
                className="cmd-num"
                style={{ fontSize: 22, marginTop: 2 }}
              >
                {item.current} {item.unit}
              </div>
            </div>
            <div>
              <div
                className="text-muted"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Nuevo saldo
              </div>
              <div
                className="cmd-num"
                style={{
                  fontSize: 22,
                  marginTop: 2,
                  color:
                    nextBal < 0
                      ? "var(--red)"
                      : nextBal < item.min
                        ? "var(--amber)"
                        : "var(--green)",
                }}
              >
                {nextBal} {item.unit}
              </div>
            </div>
          </div>
          <label
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 4,
            }}
          >
            Δ Cantidad (puede ser negativa)
          </label>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="cmd-num bg-paper"
            style={{
              width: "100%",
              border: "1px solid var(--ink)",
              padding: "8px 10px",
              fontSize: 16,
              color: "var(--ink)",
              outline: "none",
            }}
          />
          <label
            className="text-muted"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              display: "block",
              margin: "12px 0 4px",
            }}
          >
            Motivo
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-paper"
            style={{
              width: "100%",
              border: "1px solid var(--ink)",
              padding: "8px 10px",
              fontSize: 13,
              color: "var(--ink)",
              outline: "none",
            }}
          >
            <option value="merma">Merma / pérdida</option>
            <option value="recepcion">Recepción de proveedor</option>
            <option value="conteo">Ajuste por conteo físico</option>
            <option value="produccion">Producción interna</option>
            <option value="otro">Otro</option>
          </select>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              className="cmd-btn ghost sm"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button type="button" className="cmd-btn sm" onClick={onClose}>
              Guardar ajuste
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
