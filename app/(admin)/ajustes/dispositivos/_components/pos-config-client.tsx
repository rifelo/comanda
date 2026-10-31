"use client";

import * as React from "react";
import {
  anularCodigo,
  crearCodigoRegistro,
  desvincularDispositivo,
  renombrarDispositivo,
} from "../_actions";
import {
  BROWSER_LABEL,
  STARTUP_FILE,
  STARTUP_FOLDER,
  launchCommand,
  startupBatch,
  type DesktopBrowser,
} from "@/lib/pwa/launch";
import { Button, Card, EmptyState, Field, Pill, Segmented } from "@/components/ui";
import { fechaCorta } from "@/lib/utils";

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
    <div className="flex flex-col gap-6">
      {/* ── 1 · código de emparejamiento ── */}
      <Card aria-labelledby="vincular">
        <div>
          <h2 id="vincular" className="ui-title m-0">
            Emparejar una tablet o una caja
          </h2>
          <p className="ui-sub m-0 mt-1 leading-snug">
            Genera un código y, en el dispositivo nuevo, abre <b className="text-text">/emparejar</b> y escríbelo. Cada código sirve una sola
            vez y vence en 24 horas. El dispositivo queda en esta sede hasta que lo desvincules aquí; después cada persona entra con su ficha.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field
            label="Nombre sugerido (opcional)"
            className="flex-1"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            maxLength={60}
            placeholder="Tablet barra · Caja 2"
            onKeyDown={(e) => e.key === "Enter" && !pending && generate()}
          />
          <Button type="button" onClick={generate} loading={pending}>
            Generar código
          </Button>
        </div>

        {fresh ? (
          <div className="rounded-card bg-brand-soft px-5 py-4 flex flex-wrap items-center justify-between gap-4" data-testid="codigo-nuevo">
            <div>
              <span className="ui-label">Código</span>
              <div className="font-mono text-[34px] tracking-[0.22em] leading-tight">{fresh.code}</div>
              <p className="ui-sub m-0 text-[13px]">Vence en {untilTime(fresh.expiresAt)} · un solo uso · se escribe en /emparejar</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={copy}>
              {copied ? "Copiado ✓" : "Copiar"}
            </Button>
          </div>
        ) : null}

        {codes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="ui-label">Códigos sin usar</span>
            <ul className="m-0 p-0 list-none border border-line rounded-card overflow-hidden">
              {codes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 min-h-14 px-4 border-b border-line last:border-b-0">
                  <span className="font-mono tracking-[0.12em] text-[16px]">{c.code}</span>
                  <span className={c.label ? "flex-1 min-w-0 truncate" : "flex-1 text-muted"}>{c.label ?? "—"}</span>
                  <span className="ui-sub text-[13px] whitespace-nowrap">vence en {untilTime(c.expiresAt)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => cancel(c.id)} disabled={pending}>
                    Anular
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* ── 2 · dispositivos emparejados ── */}
      <section aria-labelledby="emparejados" className="flex flex-col gap-2.5">
        <h2 id="emparejados" className="ui-h2 m-0">
          Emparejados · {active.length}
        </h2>
        {active.length === 0 ? (
          <EmptyState title="Ningún dispositivo emparejado" text="Genera un código arriba para emparejar la tablet o la caja." />
        ) : (
          <ul className="m-0 p-0 list-none bg-surface border border-line rounded-card overflow-hidden">
            {active.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-line last:border-b-0">
                <input
                  defaultValue={d.name}
                  maxLength={60}
                  aria-label="Nombre del dispositivo"
                  onBlur={(e) => rename(d.id, e.target.value, d.name)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="flex-1 min-w-[160px] h-11 bg-transparent border-0 rounded-btn px-2 -mx-2 text-[17px] font-semibold text-text hover:bg-surface-2 focus:bg-surface-2"
                />
                <Pill>{d.sede ?? "sin sede"}</Pill>
                <span className="ui-sub text-[13px] basis-full sm:basis-auto">
                  activo {relTime(d.lastSeenAt)} · desde {fechaCorta(d.registeredAt.slice(0, 10))}
                </span>
                <Button type="button" variant="ghost" size="sm" className="text-late" onClick={() => unlink(d)} disabled={pending}>
                  Desvincular
                </Button>
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 ? (
          <p className="ui-sub m-0 text-[13px]">
            {revoked.length} desvinculado{revoked.length === 1 ? "" : "s"}: {revoked.map((d) => d.name).join(", ")}.
          </p>
        ) : null}
      </section>

      {/* ── 3 · app de escritorio en el PC de la caja ── */}
      <InstallSection />

      {error ? (
        <p role="alert" className="m-0 text-late font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * How to run the POS as a desktop app on the register PC. The install button
 * itself lives in /pos (the browser installs the manifest of the page that
 * fires `beforeinstallprompt`, and this page links the staff app's). What we
 * can do here is hand over the exact Startup command for this origin.
 */
const noop = () => () => {};
function InstallSection() {
  // "" on the server, the real origin after hydration — no setState-in-effect.
  const origin = React.useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [browser, setBrowser] = React.useState<DesktopBrowser>("edge");
  const [copied, setCopied] = React.useState<"cmd" | "bat" | null>(null);

  async function copyText(kind: "cmd" | "bat", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked — the text is visible on screen */
    }
  }

  const cmd = origin ? launchCommand(browser, origin) : "";
  const bat = origin ? startupBatch(browser, origin) : "";

  return (
    <Card aria-labelledby="escritorio">
      <div>
        <h2 id="escritorio" className="ui-title m-0">
          App de escritorio en el PC de la caja
        </h2>
        <p className="ui-sub m-0 mt-1 leading-snug">
          En el PC de la caja abre <b className="text-text">{origin ? `${origin}/pos` : "/pos"}</b> en Edge o Chrome y toca{" "}
          <b className="text-text">instalar</b> en la barra de direcciones. Queda como app propia, sin barra de direcciones.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="ui-label">Iniciar con Windows, a pantalla completa</span>
        <p className="ui-sub m-0 text-[14px] leading-snug">
          Guarda este comando como <b className="text-text">{STARTUP_FILE}</b> en la carpeta de inicio (Win+R →{" "}
          <b className="text-text">shell:startup</b>). Al encender el PC se abre el POS solo.
        </p>
        <Segmented<DesktopBrowser>
          label="Navegador"
          value={browser}
          onChange={setBrowser}
          options={(["edge", "chrome"] as DesktopBrowser[]).map((b) => ({ value: b, label: BROWSER_LABEL[b] }))}
        />
        <code className="block font-mono text-[12.5px] leading-relaxed px-3 py-2.5 rounded-btn bg-surface-2 whitespace-pre-wrap break-all">{bat || "…"}</code>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="strong" onClick={() => copyText("bat", bat)} disabled={!bat}>
            {copied === "bat" ? "Copiado ✓" : `Copiar ${STARTUP_FILE}`}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => copyText("cmd", cmd)} disabled={!cmd}>
            {copied === "cmd" ? "Copiado ✓" : "Copiar sólo el comando"}
          </Button>
        </div>
        <p className="ui-sub m-0 text-[13px]">
          Carpeta de inicio: <span className="text-text">{STARTUP_FOLDER}</span>.
        </p>
      </div>
    </Card>
  );
}
