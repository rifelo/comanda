"use client";

import * as React from "react";
import {
  anularCodigo,
  crearCodigoRegistro,
  desvincularDispositivo,
  renombrarDispositivo,
} from "../_actions";

export type PosDeviceRow = {
  id: string;
  name: string;
  sede: string | null;
  registeredAt: string;
  lastSeenAt: string;
  revoked: boolean;
};

export type PosCodeRow = {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
};

const label: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 8,
};
const formInput: React.CSSProperties = {
  fontSize: 13,
  border: "1px solid var(--ink)",
  background: "var(--paper)",
  padding: "9px 11px",
  color: "var(--ink)",
  outline: "none",
  borderRadius: 2,
  width: "100%",
};
const th: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1.5px solid var(--ink)",
  fontWeight: 400,
};
const td: React.CSSProperties = {
  fontSize: 13,
  padding: "10px 10px",
  borderBottom: "1px solid var(--rule)",
  verticalAlign: "middle",
};

function relTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function untilTime(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  const m = Math.max(0, Math.round(diff / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}

/**
 * Admin UI for POS pairing. Left: generate a code (shown big, once) + pending
 * codes. Right: the org's devices with last-seen, rename, and unlink.
 */
export function PosConfigClient({
  devices,
  codes,
}: {
  devices: PosDeviceRow[];
  codes: PosCodeRow[];
}) {
  const [draftLabel, setDraftLabel] = React.useState("");
  const [fresh, setFresh] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const r = await crearCodigoRegistro({ label: draftLabel || undefined });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      if ("ok" in r && r.ok) {
        setFresh({ code: r.code, expiresAt: r.expiresAt });
        setCopied(false);
        setDraftLabel("");
      }
    });
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.code);
      setCopied(true);
    } catch {
      /* clipboard blocked — the code is still visible on screen */
    }
  }

  function cancel(id: string) {
    startTransition(async () => {
      const r = await anularCodigo({ id });
      if ("error" in r && r.error) setError(r.error);
      if (fresh && codes.find((c) => c.id === id)?.code === fresh.code) setFresh(null);
    });
  }

  function unlink(d: PosDeviceRow) {
    if (!window.confirm(`¿Desvincular "${d.name}"? La caja dejará de funcionar hasta registrarla con un código nuevo.`)) return;
    startTransition(async () => {
      const r = await desvincularDispositivo({ id: d.id });
      if ("error" in r && r.error) setError(r.error);
    });
  }

  function rename(id: string, name: string, prev: string) {
    const next = name.trim();
    if (!next || next === prev) return;
    startTransition(async () => {
      const r = await renombrarDispositivo({ id, name: next });
      if ("error" in r && r.error) setError(r.error);
    });
  }

  const active = devices.filter((d) => !d.revoked);
  const revoked = devices.filter((d) => d.revoked);

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {/* ── 1 · registration code ─────────────────────────────────────── */}
      <section>
        <span className="text-muted" style={label}>Vincular una caja nueva</span>
        <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 14px", maxWidth: 560 }}>
          Genera un código, ábrelo en la tablet en <b style={{ color: "var(--ink)" }}>/pos</b> y escríbelo.
          Cada código sirve una sola vez y expira en 24 horas. La caja queda asociada a esta cuenta
          hasta que la desvincules aquí.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", maxWidth: 560 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className="text-muted" style={label}>Nombre sugerido (opcional)</span>
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              maxLength={60}
              placeholder="Caja 2 · Barra · Domicilios"
              style={formInput}
              onKeyDown={(e) => e.key === "Enter" && !pending && generate()}
            />
          </div>
          <button className="cmd-btn" type="button" onClick={generate} disabled={pending}>
            {pending ? "Generando…" : "Generar código"}
          </button>
        </div>

        {fresh ? (
          <div
            style={{
              marginTop: 18,
              border: "1.5px solid var(--ink)",
              background: "var(--paper-lt)",
              padding: "18px 22px",
              maxWidth: 560,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <span className="text-muted" style={{ ...label, marginBottom: 4 }}>Código de registro</span>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 34,
                  letterSpacing: "0.22em",
                  color: "var(--ink)",
                  lineHeight: 1.1,
                }}
              >
                {fresh.code}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Válido por {untilTime(fresh.expiresAt)} · un solo uso
              </div>
            </div>
            <button className="cmd-btn ghost sm" type="button" onClick={copy}>
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        ) : null}

        {codes.length > 0 ? (
          <div style={{ marginTop: 22, maxWidth: 560 }}>
            <span className="text-muted" style={label}>Códigos pendientes</span>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="text-muted" style={th}>Código</th>
                  <th className="text-muted" style={th}>Nombre</th>
                  <th className="text-muted" style={th}>Expira en</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>{c.code}</td>
                    <td style={td} className={c.label ? undefined : "text-muted"}>{c.label ?? "—"}</td>
                    <td style={td}>{untilTime(c.expiresAt)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button className="cmd-link" type="button" onClick={() => cancel(c.id)} disabled={pending} style={{ fontSize: 11 }}>
                        Anular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* ── 2 · paired devices ────────────────────────────────────────── */}
      <section>
        <span className="text-muted" style={label}>
          Cajas vinculadas · {active.length}
        </span>
        {active.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Aún no hay cajas vinculadas. Genera un código arriba para registrar la primera.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="text-muted" style={th}>Caja</th>
                <th className="text-muted" style={th}>Sede</th>
                <th className="text-muted" style={th}>Última actividad</th>
                <th className="text-muted" style={th}>Registrada</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <tr key={d.id}>
                  <td style={td}>
                    <input
                      defaultValue={d.name}
                      maxLength={60}
                      aria-label="Nombre de la caja"
                      onBlur={(e) => rename(d.id, e.target.value, d.name)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      style={{ fontSize: 13, border: "none", background: "transparent", outline: "none", color: "var(--ink)", width: "100%", padding: 0 }}
                    />
                  </td>
                  <td style={td} className={d.sede ? undefined : "text-muted"}>{d.sede ?? "—"}</td>
                  <td style={td}>{relTime(d.lastSeenAt)}</td>
                  <td style={td} className="text-muted">{new Date(d.registeredAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button className="cmd-link" type="button" onClick={() => unlink(d)} disabled={pending} style={{ fontSize: 11, color: "var(--red)" }}>
                      Desvincular
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {revoked.length > 0 ? (
          <p className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
            {revoked.length} caja{revoked.length === 1 ? "" : "s"} desvinculada{revoked.length === 1 ? "" : "s"}:{" "}
            {revoked.map((d) => d.name).join(", ")}.
          </p>
        ) : null}
      </section>

      {error ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
