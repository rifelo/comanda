"use client";

/**
 * 06 · Notificaciones de stock — toggles for alerts + min threshold + lock.
 */
import * as React from "react";
import { NOTIF_ITEMS, type NotifItem } from "@/lib/mock/productos";
import { SectionCrumb } from "../_components/shared";
import { NotifToggle } from "../_components/chip";

const GRID = "1.4fr 1.2fr 1fr 160px 200px";

export function NotificacionesClient() {
  const [items, setItems] = React.useState<NotifItem[]>(NOTIF_ITEMS);

  return (
    <div>
      <SectionCrumb
        section="notificaciones"
        right={
          <>
            <button
              type="button"
              className="cmd-btn ghost sm"
              onClick={() =>
                setItems((s) => s.map((x) => ({ ...x, alert: true })))
              }
            >
              Activar todas
            </button>
            <button type="button" className="cmd-btn sm">
              Guardar cambios
            </button>
          </>
        }
      />

      <div style={{ padding: "20px 28px" }}>
        {/* explainer */}
        <div
          className="cmd-paper-lt"
          style={{
            border: "1px dashed var(--rule)",
            padding: 14,
            marginBottom: 18,
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Cómo funciona
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-2)",
                marginTop: 4,
                maxWidth: 560,
              }}
            >
              Cuando el stock de un item cruza su umbral mínimo, Comanda envía una
              alerta al admin de la sede y marca el producto en el POS. Si{" "}
              <strong>&quot;Prohibir venta sin disponibilidad&quot;</strong> está
              activado, el cajero verá un candado y no podrá cobrar el item.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
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
                Canal de aviso
              </div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Email · WhatsApp · Push
              </div>
            </div>
            <button type="button" className="cmd-btn ghost sm">
              configurar
            </button>
          </div>
        </div>

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
            <span>Alertas</span>
            <span style={{ textAlign: "right" }}>Umbral mínimo</span>
            <span>Bloquear venta</span>
          </div>
          {items.map((it, i) => (
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
              <div style={{ fontSize: 13, fontWeight: 500 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: "var(--ink-2)" }}>
                {it.cat}
              </div>
              <NotifToggle
                on={it.alert}
                label={it.alert ? "Activa" : "Desactivada"}
                onChange={(v) =>
                  setItems((s) =>
                    s.map((x, j) => (j === i ? { ...x, alert: v } : x)),
                  )
                }
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  justifyContent: "flex-end",
                }}
              >
                <StepperBtn
                  onClick={() =>
                    setItems((s) =>
                      s.map((x, j) =>
                        j === i
                          ? { ...x, min: Math.max(0, x.min - 1) }
                          : x,
                      ),
                    )
                  }
                >
                  −
                </StepperBtn>
                <input
                  className="cmd-num bg-paper"
                  value={it.min}
                  readOnly
                  aria-label={`Umbral mínimo de ${it.name}`}
                  style={{
                    width: 50,
                    textAlign: "center",
                    border: "1px solid var(--rule)",
                    padding: "3px 6px",
                    fontSize: 12,
                    color: "var(--ink)",
                    minHeight: 0,
                  }}
                />
                <StepperBtn
                  onClick={() =>
                    setItems((s) =>
                      s.map((x, j) =>
                        j === i ? { ...x, min: x.min + 1 } : x,
                      ),
                    )
                  }
                >
                  +
                </StepperBtn>
              </div>
              <NotifToggle
                on={it.lock}
                label={it.lock ? "🔒 prohibido" : "permitido"}
                onChange={(v) =>
                  setItems((s) =>
                    s.map((x, j) => (j === i ? { ...x, lock: v } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepperBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "1px solid var(--rule)",
        padding: "3px 6px",
        fontSize: 11,
        color: "var(--ink)",
        cursor: "pointer",
        minHeight: 0,
      }}
    >
      {children}
    </button>
  );
}
