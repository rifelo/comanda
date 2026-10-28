"use client";

import * as React from "react";
import Link from "next/link";
import { Wordmark } from "@/components/comanda/primitives";
import { teclear, type Tecla } from "@/lib/caja/movimientos";
import { signOutTurno } from "../../auth-actions";
import { subirFotoCaja } from "../actions";
import { IcoAtras, IcoBorrar, IcoCamara } from "./icons";
import { fechaLarga, hora, iniciales, plata } from "./model";

/** The tablet's top bar, as the rest of /turno: sede, clock, who is signed in, the modules. Inside a flow it shows the crumb instead. */
export function CajaHead({ sedeName, today, tz, actorName, crumb, cajaDot }: { sedeName: string; today: string; tz: string; actorName: string; crumb?: string; cajaDot?: boolean }) {
  const [now, setNow] = React.useState<string | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(hora(new Date().toISOString(), tz));
    tick();
    const t = window.setInterval(tick, 15_000);
    return () => window.clearInterval(t);
  }, [tz]);
  return (
    <header className="cj-head">
      <Wordmark size={22} />
      <div className="cj-head-sede">
        <span className="cj-lab">{sedeName}</span>
        <span>{fechaLarga(today)}</span>
      </div>
      <span className="cj-slab cj-clock" suppressHydrationWarning>{now ?? ""}</span>
      <div className="cj-grow" />
      <span className="cj-who" title={actorName}>
        <span className="cj-avatar">{iniciales(actorName)}</span>
        <span className="cj-who-name">{actorName}</span>
      </span>
      {crumb ? (
        <span className="cj-crumb">Caja › {crumb}</span>
      ) : (
        <>
          <form action={signOutTurno}>
            <button type="submit" className="cj-salir" title="Cerrar sesión en esta tablet">Salir</button>
          </form>
          <span className="cj-sep" />
          <nav aria-label="Módulos" className="cj-nav">
            <Link href="/turno" className="cj-tab">Turno</Link>
            <Link href="/turno/inventario" className="cj-tab">Inventario</Link>
            <Link href="/turno/caja" className="cj-tab" aria-current="page">
              Caja{cajaDot && <span className="cj-tab-dot" aria-label="Pendiente" />}
            </Link>
            <Link href="/pos" className="cj-tab">POS →</Link>
          </nav>
        </>
      )}
    </header>
  );
}

export type StepState = "on" | "done" | "todo";

/** «− Nueva salida  [Pago de domicilio]   ① Motivo — ② Monto — ③ ¿Por qué?» */
export function FlowBar({ back, onBack, title, tone, pick, steps, children }: { back: string; onBack: () => void; title: string; tone: "in" | "out" | "ink"; pick?: React.ReactNode; steps?: Array<{ label: string; s: StepState }>; children?: React.ReactNode }) {
  return (
    <div className="cj-flowbar">
      <button type="button" className="cj-btn sm" onClick={onBack}><IcoAtras />{back}</button>
      <h1 className={`cj-slab cj-h1 ${tone === "in" ? "cj-in" : tone === "out" ? "cj-out" : ""}`}>{title}</h1>
      {pick && <span className="cj-pick">{pick}</span>}
      {children}
      {steps && (
        <div className="cj-steps">
          {steps.map((st, i) => (
            <React.Fragment key={st.label}>
              {i > 0 && <span className="cj-step-line" />}
              <span className="cj-step" data-s={st.s}><i>{st.s === "done" ? "✓" : i + 1}</i>{st.label}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** The on-screen numeric keypad (no Android keyboard over the amount). */
export function Keypad({ value, onChange, label = "Teclado numérico", sinLimpiar }: { value: string; onChange: (v: string) => void; label?: string; sinLimpiar?: boolean }) {
  const press = (t: Tecla) => onChange(teclear(value, t));
  return (
    <section aria-label={label} className="cj-keypad">
      {(["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).map((k) => (
        <button key={k} type="button" className="cj-key" onClick={() => press(k)}>{k}</button>
      ))}
      <button type="button" className="cj-key" style={{ fontSize: 22 }} onClick={() => press("000")}>000</button>
      <button type="button" className="cj-key" onClick={() => press("0")}>0</button>
      <button type="button" className="cj-key alt" aria-label="Borrar" onClick={() => press("borrar")}><IcoBorrar /></button>
      {!sinLimpiar && <button type="button" className="cj-key wide" onClick={() => press("limpiar")}>Borrar todo</button>}
    </section>
  );
}

/** − n + for one denomination; the number can also be typed. */
export function Contador({ value, onChange, label, editable = true }: { value: number; onChange: (n: number) => void; label: string; editable?: boolean }) {
  return (
    <>
      <button type="button" className="cj-step-btn" aria-label={`Menos ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      {editable ? (
        <input
          className="cj-den-n"
          inputMode="numeric"
          aria-label={label}
          value={value ? String(value) : ""}
          placeholder="0"
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "").slice(0, 5);
            onChange(t ? Number(t) : 0);
          }}
        />
      ) : (
        <span className="cj-den-n ro cj-slab" aria-label={label}>{value}</span>
      )}
      <button type="button" className="cj-step-btn" aria-label={`Más ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </>
  );
}

/** A photo for a movement: uploaded right away when there is internet, kept on the tablet (shrunk) when not. */
export interface FotoValor {
  path: string | null;
  data: string | null;
  preview: string | null;
}
export const FOTO_VACIA: FotoValor = { path: null, data: null, preview: null };

async function achicar(file: File, max: number, q: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", q));
}

const comoDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** Upload a photo kept on the tablet (data URL) once the internet is back. */
export async function subirDataUrl(data: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const blob = await (await fetch(data)).blob();
  const fd = new FormData();
  fd.set("file", blob, "caja.jpg");
  return subirFotoCaja(fd);
}

export function FotoCaptura({ label, obligatoria, value, onChange, online, hint }: { label: string; obligatoria?: boolean; value: FotoValor; onChange: (v: FotoValor) => void; online: boolean; hint?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (online) {
        const blob = await achicar(file, 1600, 0.8);
        const fd = new FormData();
        fd.set("file", blob, "caja.jpg");
        const r = await subirFotoCaja(fd).catch(() => null);
        if (r?.ok) {
          onChange({ path: r.path, data: null, preview: URL.createObjectURL(blob) });
          return;
        }
        if (r && !r.ok && navigator.onLine) throw new Error(r.error);
      }
      // No internet: keep a smaller copy on the tablet; it goes up with the movement.
      const small = await achicar(file, 1100, 0.7);
      const data = await comoDataUrl(small);
      onChange({ path: null, data, preview: data });
    } catch (err) {
      setError(err instanceof Error && err.message !== "toBlob" ? err.message : "No se pudo leer la foto.");
    } finally {
      setBusy(false);
    }
  }

  const has = !!(value.path || value.data);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="cj-lab">{label} · {obligatoria ? "obligatoria" : "opcional"}</span>
      <div className="cj-foto">
        <input ref={ref} type="file" accept="image/*" capture="environment" onChange={(e) => void elegir(e)} aria-label={label} style={{ display: "none" }} />
        <button type="button" className={`cj-btn cj-foto-btn ${has ? "" : "dark"}`} disabled={busy} onClick={() => ref.current?.click()}>
          <IcoCamara size={32} w={2} />
          {busy ? "Guardando…" : has ? "Tomar otra" : "Tomar foto"}
        </button>
        <div className="cj-foto-box" data-tone={has ? "ok" : obligatoria ? "bad" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the photo just taken */}
          {value.preview ? <img src={value.preview} alt={label} /> : <span>{hint ?? "Sin foto todavía."}</span>}
        </div>
      </div>
      {value.data && !value.path && <span className="cj-fine" style={{ textAlign: "left" }}>Guardada en la tablet: se sube cuando vuelva el internet.</span>}
      {error && <span role="alert" className="cj-warn red">{error}</span>}
    </div>
  );
}

/** The big amount on top of a keypad screen. */
export function MontoGrande({ label, value, tone, sub }: { label: string; value: string; tone: "in" | "out"; sub?: React.ReactNode }) {
  const n = value ? Number(value) : 0;
  return (
    <div className="cj-card" style={{ padding: "20px 24px", gap: 8 }}>
      <span className="cj-lab">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className={`cj-slab cj-amount ${tone === "in" ? "cj-in" : "cj-out"}`} aria-live="polite">{plata(n)}</span>
        <span className="cj-caret" style={{ background: tone === "in" ? "var(--green)" : "var(--red)" }} />
      </div>
      {sub && <span className="cj-mute" style={{ fontSize: 13 }}>{sub}</span>}
    </div>
  );
}
