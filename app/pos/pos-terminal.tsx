"use client";

/**
 * Punto de venta (POS) + asistente de IA — live.
 *
 * Two linked touchscreens share one module-level store so the client display
 * mirrors the cashier in real time: the cashier terminal (catalog · order
 * ticket · AI panel) and the client-facing screen.
 *
 * Wiring (was a scripted demo, now live):
 *  · Catalog — productos / combos / modificadores fetched server-side and
 *    handed in as `catalog` (see lib/pos/catalog.ts), exposed via context.
 *  · Orders — "Cobrar y enviar" persists through the crearOrden server action
 *    and shows the real folio.
 *  · Assistant — the cashier's microphone (MediaRecorder → Groq Whisper via the
 *    transcribeAudio server action) feeds a transcript; debounced calls to the
 *    posSuggest server action ask Claude for suggestions whose actions reference
 *    live catalog ids. A typed fallback input is always available.
 *
 * Design tokens map straight onto the app's CSS variables (C.ink → var(--ink)).
 */

import * as React from "react";
import Link from "next/link";
import {
  Stamp,
  Folio,
  PhotoPlaceholder,
} from "@/components/comanda/primitives";
import {
  posMoney,
  POS_KIND_LABEL,
  FAV_CAT,
  COMBO_CAT,
  type PosCatalog,
  type PosMenuItem,
  type PosCombo,
  type PosModGroup,
  type PosSuggest,
  type PosSuggestKind,
  type PosAct,
} from "@/lib/pos/types";
import { crearOrden, posSuggest, transcribeAudio } from "./actions";

// ── design tokens → app CSS variables ───────────────────────────
const C = {
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  paper: "var(--paper)",
  paperLt: "var(--paper-lt)",
  paperDk: "var(--paper-dk)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  ruleSoft: "var(--rule-soft)",
  red: "var(--red)",
  green: "var(--green)",
  amber: "var(--amber)",
} as const;
const F = {
  mono: "var(--font-mono)",
  slab: "var(--font-slab)",
  script: "var(--font-script)",
} as const;

// ── one-time CSS (equalizer + listening pulse + button reset) ───
const POS_CSS = `
  @keyframes pos-eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
  @keyframes pos-rec { 0%,100%{opacity:1} 50%{opacity:.25} }
  @keyframes pos-in  { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  .pos-root button:not(.cmd-btn){min-height:0}
  .pos-root a{min-height:0}
  .pos-eq i{display:inline-block;width:3px;height:14px;background:currentColor;transform-origin:bottom;
    animation:pos-eq .9s ease-in-out infinite}
  .pos-eq i:nth-child(2){animation-delay:.15s} .pos-eq i:nth-child(3){animation-delay:.3s}
  .pos-eq i:nth-child(4){animation-delay:.45s} .pos-eq i:nth-child(5){animation-delay:.6s}
  .pos-eq.paused i{animation-play-state:paused;transform:scaleY(.4);opacity:.45}
  .pos-rec{animation:pos-rec 1.3s ease-in-out infinite}
  .pos-card{animation:pos-in .35s ease both}
  @keyframes pos-hl { 0%,100%{box-shadow:0 0 0 0 rgba(176,58,46,0)} 50%{box-shadow:0 0 0 5px rgba(176,58,46,.16)} }
  .pos-hl{animation:pos-hl 1.6s ease-in-out infinite}
  .pos-scroll::-webkit-scrollbar{width:8px} .pos-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:8px}
`;

// ── catalog context (stable, SSR-correct — no flash) ────────────
const EMPTY_CATALOG: PosCatalog = {
  cats: [],
  menu: [],
  combos: [],
  modGroups: {},
  byId: {},
  comboById: {},
  catLabel: {},
  orgName: "comanda",
};
const CatalogCtx = React.createContext<PosCatalog>(EMPTY_CATALOG);
const useCatalog = () => React.useContext(CatalogCtx);

// ── store ───────────────────────────────────────────────────────
type ModSelection = Record<string, string | string[] | null>;

interface OrderLine {
  id: string;
  name: string;
  qty: number;
  kind: "item" | "combo";
  basePrice?: number;
  price?: number;
  gluten?: boolean;
  items?: string[];
  mods?: ModSelection;
  hasMods?: boolean;
  expanded?: boolean;
}
type SuggestionCardState = PosSuggest & {
  uid: string;
  status: "open" | "done" | "dismissed";
};
interface TranscriptLine {
  who: string;
  text: string;
  time: string;
}
interface PosState {
  order: OrderLine[];
  orderType: "aqui" | "llevar" | "domicilio";
  cat: string;
  highlightId: string | null;
  catSource: "manual" | "ia";
  listening: boolean;
  thinking: boolean;
  micNote: string | null;
  /** Live (not-yet-final) speech being recognized, shown under the transcript. */
  interim: string;
  transcript: TranscriptLine[];
  suggestions: SuggestionCardState[];
  flags: string[];
  noteSinGluten: boolean;
  loyalty: boolean;
  sending: boolean;
  sendError: string | null;
  sent: boolean;
  orderNo: string;
  /** Set once on mount so imperative actions can read the catalog. */
  catalog: PosCatalog;
}

const POS_INITIAL: PosState = {
  order: [],
  orderType: "aqui",
  cat: FAV_CAT,
  highlightId: null,
  catSource: "manual",
  listening: false,
  thinking: false,
  micNote: null,
  interim: "",
  transcript: [],
  suggestions: [],
  flags: [],
  noteSinGluten: false,
  loyalty: false,
  sending: false,
  sendError: null,
  sent: false,
  orderNo: "Nuevo",
  catalog: EMPTY_CATALOG,
};

type StateUpdater = Partial<PosState> | ((s: PosState) => PosState);
const posStore = (() => {
  let state: PosState = { ...POS_INITIAL };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (u: StateUpdater) => {
      state = typeof u === "function" ? u(state) : { ...state, ...u };
      subs.forEach((f) => f());
    },
    sub: (f: () => void) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
})();

function usePos(): PosState {
  return React.useSyncExternalStore(posStore.sub, posStore.get, () => POS_INITIAL);
}

const fmtTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ── order helpers (pure; catalog passed in) ─────────────────────
function posDefaultMods(p: PosMenuItem, catalog: PosCatalog): ModSelection {
  const out: ModSelection = {};
  p.mods.forEach((gid) => {
    const g = catalog.modGroups[gid];
    if (!g) return;
    out[gid] = g.type === "single" ? (g.required ? g.options[0]?.name ?? null : null) : [];
  });
  return out;
}
function posMakeLine(p: PosMenuItem, catalog: PosCatalog): OrderLine {
  return {
    id: p.id,
    name: p.name,
    basePrice: p.price,
    qty: 1,
    gluten: p.gluten,
    kind: "item",
    mods: posDefaultMods(p, catalog),
    hasMods: p.mods.length > 0,
    expanded: false,
  };
}
function modLinePrice(line: OrderLine, catalog: PosCatalog): number {
  if (line.kind === "combo") return line.price ?? 0;
  let extra = 0;
  if (line.mods) {
    for (const gid in line.mods) {
      const g = catalog.modGroups[gid];
      if (!g) continue;
      const sel = line.mods[gid];
      const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
      names.forEach((n) => {
        const o = g.options.find((o) => o.name === n);
        if (o) extra += o.delta;
      });
    }
  }
  return (line.basePrice != null ? line.basePrice : line.price ?? 0) + extra;
}
interface ModChip {
  name: string;
  delta: number;
  group: string;
}
function modSummary(line: OrderLine, catalog: PosCatalog): ModChip[] {
  const out: ModChip[] = [];
  if (!line.mods) return out;
  for (const gid in line.mods) {
    const g = catalog.modGroups[gid];
    if (!g) continue;
    const sel = line.mods[gid];
    const names = Array.isArray(sel) ? sel : sel ? [sel] : [];
    names.forEach((n) => {
      const o = g.options.find((o) => o.name === n);
      if (!o) return;
      out.push({ name: n, delta: o.delta, group: gid });
    });
  }
  return out;
}
const orderTotal = (order: OrderLine[], catalog: PosCatalog): number =>
  order.reduce((s, l) => s + modLinePrice(l, catalog) * l.qty, 0);

// ── imperative cart actions (read catalog from the store) ───────
function addItem(id: string) {
  posStore.set((s) => {
    const p = s.catalog.byId[id];
    if (!p) return s;
    const hasMods = p.mods.length > 0;
    const i = hasMods ? -1 : s.order.findIndex((l) => l.id === id && l.kind === "item");
    let order: OrderLine[];
    if (i >= 0) order = s.order.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
    else order = [...s.order, posMakeLine(p, s.catalog)];
    return { ...s, order, sent: false, highlightId: s.highlightId === id ? null : s.highlightId };
  });
}
function addCombo(comboId: string) {
  posStore.set((s) => {
    const c = s.catalog.comboById[comboId];
    if (!c) return s;
    return {
      ...s,
      order: [...s.order, { id: c.id, name: c.name, price: c.price, qty: 1, kind: "combo", items: c.items }],
      sent: false,
      highlightId: s.highlightId === comboId ? null : s.highlightId,
    };
  });
}
function swapCombo(removeId: string, comboId: string) {
  posStore.set((s) => {
    const c = s.catalog.comboById[comboId];
    if (!c) return s;
    let removed = false;
    const order = s.order.filter((l) => {
      if (!removed && l.kind === "item" && l.id === removeId) {
        if (l.qty > 1) {
          l.qty -= 1;
          return true;
        }
        removed = true;
        return false;
      }
      return true;
    });
    return {
      ...s,
      order: [...order, { id: c.id, name: c.name, price: c.price, qty: 1, kind: "combo", items: c.items }],
      sent: false,
      highlightId: s.highlightId === comboId ? null : s.highlightId,
    };
  });
}
function changeQty(idx: number, d: number) {
  posStore.set((s) => {
    const order = s.order
      .map((l, k) => (k === idx ? { ...l, qty: l.qty + d } : l))
      .filter((l) => l.qty > 0);
    return { ...s, order, sent: false };
  });
}
function toggleLineExpanded(idx: number) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => (k === idx ? { ...l, expanded: !l.expanded } : l)),
  }));
}
function setLineSingle(idx: number, gid: string, name: string) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => (k === idx ? { ...l, mods: { ...l.mods, [gid]: name } } : l)),
    sent: false,
  }));
}
function toggleLineMulti(idx: number, gid: string, name: string) {
  posStore.set((s) => ({
    ...s,
    order: s.order.map((l, k) => {
      if (k !== idx) return l;
      const cur = l.mods?.[gid];
      const arr = Array.isArray(cur) ? cur : [];
      const has = arr.includes(name);
      return { ...l, mods: { ...l.mods, [gid]: has ? arr.filter((x) => x !== name) : [...arr, name] } };
    }),
    sent: false,
  }));
}
function applyModsToLine(productId: string, set: Record<string, string | string[]>) {
  posStore.set((s) => {
    let order = [...s.order];
    let idx = order.findIndex((l) => l.kind === "item" && l.id === productId);
    if (idx < 0) {
      const p = s.catalog.byId[productId];
      if (!p) return s;
      order = [...order, posMakeLine(p, s.catalog)];
      idx = order.length - 1;
    }
    const line: OrderLine = { ...order[idx], mods: { ...order[idx].mods }, expanded: true };
    for (const gid in set) line.mods![gid] = set[gid];
    order[idx] = line;
    return { ...s, order, sent: false, highlightId: s.highlightId === productId ? null : s.highlightId };
  });
}

// ── AI suggestion actions ───────────────────────────────────────
function applyAct(act?: PosAct) {
  if (!act) return;
  if (act.type === "add") addItem(act.id);
  else if (act.type === "combo") addCombo(act.id);
  else if (act.type === "swapCombo") swapCombo(act.removeId, act.comboId);
  else if (act.type === "mods") applyModsToLine(act.id, act.set);
  else if (act.type === "flag") posStore.set((s) => ({ ...s, noteSinGluten: true }));
  else if (act.type === "loyalty") posStore.set((s) => ({ ...s, loyalty: true }));
}
function dismissSuggestion(uid: string, accepted: boolean) {
  posStore.set((s) => ({
    ...s,
    suggestions: s.suggestions.map((g) =>
      g.uid === uid ? { ...g, status: accepted ? "done" : "dismissed" } : g,
    ),
  }));
}

// ── live assistant: transcript + debounced suggestions ──────────
let suggestTimer: ReturnType<typeof setTimeout> | null = null;
let suggestSeq = 0;

function appendTranscript(who: string, text: string) {
  posStore.set((s) => ({ ...s, transcript: [...s.transcript, { who, text, time: fmtTime() }] }));
  scheduleSuggest();
}
function scheduleSuggest(delay = 350) {
  // Short debounce: VAD already cuts on a pause, so each transcript line is a
  // finished phrase — fire fast, just coalescing back-to-back segments.
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(runSuggest, delay);
}
async function runSuggest() {
  const s = posStore.get();
  if (!s.transcript.length || s.sent) return;
  const seq = ++suggestSeq;
  posStore.set({ thinking: true });
  const cart = s.order.map((l) => ({
    name: l.name,
    qty: l.qty,
    mods: modSummary(l, s.catalog).map((m) => m.name),
  }));
  const res = await posSuggest({
    transcript: s.transcript.map((t) => ({ who: t.who, text: t.text })),
    cart,
    orderType: s.orderType,
    sinGluten: s.noteSinGluten,
  });
  if (seq !== suggestSeq) return; // a newer request superseded this one
  posStore.set((st) => {
    if (!res.ok) {
      return { ...st, thinking: false, micNote: res.missingKey ? res.error : st.micNote };
    }
    const seen = new Set(st.suggestions.map((g) => g.title));
    const fresh = res.suggestions
      .filter((g) => !seen.has(g.title))
      .map((g, i) => ({ ...g, uid: `sg${seq}_${i}`, status: "open" as const }));
    let cat = st.cat,
      highlightId = st.highlightId,
      catSource = st.catSource;
    const f = fresh.find((g) => g.focus);
    if (f?.focus) {
      if (f.focus.catId) {
        cat = f.focus.catId;
        catSource = "ia";
      }
      if ("highlightId" in f.focus) highlightId = f.focus.highlightId ?? null;
    }
    return { ...st, thinking: false, suggestions: [...fresh, ...st.suggestions], cat, highlightId, catSource };
  });
}
function resetConversation() {
  posStore.set((s) => ({ ...POS_INITIAL, catalog: s.catalog, listening: s.listening }));
}

async function sendOrder() {
  const s = posStore.get();
  if (!s.order.length || s.sending) return;
  posStore.set({ sending: true, sendError: null });
  const lines = s.order.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty, mods: l.mods ?? {} }));
  const res = await crearOrden({ orderType: s.orderType, sinGluten: s.noteSinGluten, lines });
  if (res.ok) posStore.set({ sent: true, sending: false, orderNo: res.folio });
  else posStore.set({ sending: false, sendError: res.error });
}

// ── cloud speech-to-text (MediaRecorder + VAD → Groq Whisper) ───
// We record the mic continuously but cut a segment the moment the speaker
// pauses (voice-activity detection via Web Audio), so each utterance is sent
// to the transcribeAudio server action right after it ends — snappy, and we
// never send silent clips (which Whisper would hallucinate text for). The
// browser's own Web Speech API is avoided: it relies on Google's backend,
// which is blocked on some networks.
const MIN_SEGMENT_BYTES = 1600; // skip near-empty blobs
const VAD_RMS_THRESHOLD = 0.018; // loudness above this counts as speech
const VAD_SILENCE_MS = 600; // a pause this long ends an utterance
const VAD_MIN_UTTERANCE_MS = 350; // ignore blips shorter than this
const VAD_MAX_SEGMENT_MS = 9000; // flush long continuous speech anyway

function pickAudioMime(): string {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR) return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MR.isTypeSupported(m)) return m;
  }
  return "";
}

// When Groq's free-tier rate limit (429) hits, pause uploads until this time
// instead of hammering the quota every utterance.
let sttCooldownUntil = 0;

async function sendSegment(blob: Blob) {
  if (blob.size < MIN_SEGMENT_BYTES) return;
  if (Date.now() < sttCooldownUntil) return; // backing off after a 429
  posStore.set({ interim: "Transcribiendo…" });
  try {
    const fd = new FormData();
    fd.append("audio", blob, "segment.webm");
    const res = await transcribeAudio(fd);
    if (res.ok) {
      const t = res.text.trim();
      if (t) appendTranscript("cliente", t);
      // A success clears any lingering rate-limit / error note.
      if (posStore.get().micNote) posStore.set({ micNote: null });
    } else if (res.fatal) {
      posStore.set({ listening: false, micNote: res.error });
    } else if (res.rateLimited) {
      sttCooldownUntil = Date.now() + (res.retryAfterMs ?? 6000);
      posStore.set({ micNote: res.error });
    } else if (res.error) {
      posStore.set({ micNote: res.error });
    }
  } catch (err) {
    console.warn("[pos stt] segment failed:", err);
  } finally {
    if (posStore.get().interim === "Transcribiendo…") posStore.set({ interim: "" });
  }
}

function micErrorNote(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Micrófono bloqueado. Toca el candado 🔒 junto a la URL → Micrófono → Permitir, y reactiva el micrófono.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No se detectó ningún micrófono. Conecta uno y reactiva el micrófono.";
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "El micrófono solo funciona en HTTPS (o localhost). Ábrelo en el sitio seguro, o escribe abajo.";
  return "No se pudo acceder al micrófono. Revisa los permisos, o escribe la conversación abajo.";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function useMicTranscribe(listening: boolean) {
  React.useEffect(() => {
    if (!listening) return;
    const AudioCtx =
      typeof window !== "undefined"
        ? window.AudioContext || (window as any).webkitAudioContext
        : undefined;
    if (typeof window === "undefined" || !navigator.mediaDevices || !window.MediaRecorder || !AudioCtx) {
      posStore.set({
        listening: false,
        micNote: "Este navegador no permite grabar audio. Usa un navegador moderno, o escribe abajo.",
      });
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let audioCtx: AudioContext | null = null;
    let raf = 0;
    const mime = pickAudioMime();

    // VAD state for the current segment.
    let chunks: BlobPart[] = [];
    let segStart = 0;
    let hadSpeech = false;
    let silenceSince = 0;

    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    const startSegment = () => {
      if (cancelled || !stream) return;
      chunks = [];
      hadSpeech = false;
      silenceSince = 0;
      segStart = now();
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const sawSpeech = hadSpeech;
        const blob = new Blob(chunks, { type: recorder?.mimeType || mime || "audio/webm" });
        // Open the next segment immediately so we never miss the next utterance.
        if (!cancelled && posStore.get().listening) startSegment();
        // Only transcribe segments that actually contained speech — sending
        // silence makes Whisper hallucinate phantom phrases.
        if (sawSpeech) void sendSegment(blob);
      };
      recorder.start();
    };

    const cutSegment = () => {
      if (recorder && recorder.state === "recording") recorder.stop();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        posStore.set({ micNote: null });

        audioCtx = new AudioCtx();
        if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        startSegment();

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = (buf[i] - 128) / 128;
            sum += x * x;
          }
          const rms = Math.sqrt(sum / buf.length);
          const t = now();

          if (rms > VAD_RMS_THRESHOLD) {
            hadSpeech = true;
            silenceSince = 0;
            if (posStore.get().interim !== "Escuchando…") posStore.set({ interim: "Escuchando…" });
          } else if (hadSpeech && !silenceSince) {
            silenceSince = t;
          }

          const endedByPause =
            hadSpeech && silenceSince && t - silenceSince > VAD_SILENCE_MS && t - segStart > VAD_MIN_UTTERANCE_MS;
          const tooLong = t - segStart > VAD_MAX_SEGMENT_MS;
          if (endedByPause || tooLong) cutSegment();

          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        console.warn("[pos stt] getUserMedia failed:", err);
        posStore.set({ listening: false, micNote: micErrorNote(err) });
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = null;
          recorder.stop();
        }
      } catch {}
      if (audioCtx) audioCtx.close().catch(() => {});
      if (stream) stream.getTracks().forEach((t) => t.stop());
      posStore.set({ interim: "" });
    };
  }, [listening]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════════════════════════════
// Tablet bezel
// ════════════════════════════════════════════════════════════════
function Tablet({
  width,
  height,
  children,
  label,
  facing,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
  label?: string;
  facing?: "cajero" | "cliente";
}) {
  return (
    <div>
      {label && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".14em", textTransform: "uppercase" }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: facing === "cliente" ? C.green : C.red }} />
          {label}
        </div>
      )}
      <div style={{ width, height, background: "#171310", borderRadius: 26, padding: 14, boxShadow: "0 24px 60px -28px rgba(20,14,8,.6)" }}>
        <div className="cmd-paper" style={{ width: "100%", height: "100%", borderRadius: 13, overflow: "hidden", background: C.paper, position: "relative", display: "flex" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const POS_TABLET_W = 1320,
  POS_TABLET_H = 864,
  POS_CLIENT_W = 900;

// ════════════════════════════════════════════════════════════════
// Cashier terminal
// ════════════════════════════════════════════════════════════════
function PosCashier() {
  const s = usePos();
  useMicTranscribe(s.listening);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", fontFamily: F.mono }}>
      <CatalogColumn />
      <OrderColumn />
      <AiPanel />
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 8px", fontFamily: F.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted }}>
      <span>{children}</span>
      <span style={{ flex: 1, borderTop: `1px dashed ${C.rule}` }} />
    </div>
  );
}

function CatalogColumn() {
  const s = usePos();
  const catalog = useCatalog();
  const cat = s.cat || FAV_CAT;
  const gridRef = React.useRef<HTMLDivElement>(null);
  const hlRef = React.useRef<HTMLButtonElement>(null);

  const setCat = (id: string) => posStore.set({ cat: id, catSource: "manual", highlightId: null });

  let sections: { label: string | null; items?: PosMenuItem[]; combos?: PosCombo[] }[];
  if (cat === COMBO_CAT) sections = [{ label: null, combos: catalog.combos }];
  else if (cat === FAV_CAT) sections = [{ label: null, items: catalog.menu.filter((p) => p.fav) }];
  else {
    const items = catalog.menu.filter((p) => p.catId === cat);
    const subs = [...new Set(items.map((p) => p.sub))];
    sections = subs.map((sub) => ({
      label: subs.length > 1 && sub ? sub : null,
      items: items.filter((p) => p.sub === sub),
    }));
  }

  React.useEffect(() => {
    if (s.highlightId && hlRef.current && gridRef.current) {
      const g = gridRef.current,
        el = hlRef.current;
      g.scrollTop = Math.max(0, el.offsetTop - g.offsetTop - 16);
    }
  }, [s.highlightId, cat]);

  return (
    <div style={{ width: 556, height: "100%", display: "flex", flexDirection: "column", borderRight: `1.5px solid ${C.ink}`, background: C.paperLt }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: `1.5px solid ${C.ink}`, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: F.slab, fontSize: 25, color: C.ink, lineHeight: 1 }}>
          comanda<span style={{ color: C.red }}>.</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, marginLeft: 8, letterSpacing: ".12em" }}>CAJA 01</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>{catalog.orgName}</div>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "11px 14px", flexWrap: "wrap" }}>
        {catalog.cats.map((c) => {
          const on = cat === c.id;
          const iaOn = on && s.catSource === "ia";
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              fontFamily: F.mono, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", padding: "7px 11px", borderRadius: 2, cursor: "pointer",
              border: `1px solid ${on ? (iaOn ? C.red : C.ink) : C.rule}`, background: on ? (iaOn ? C.red : C.ink) : "transparent", color: on ? C.paperLt : C.ink2,
            }}>{c.label}</button>
          );
        })}
      </div>
      {s.catSource === "ia" && (
        <div className="pos-card" style={{ margin: "0 14px 4px", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", border: `1px solid ${C.red}`, background: C.paper, borderRadius: 3 }}>
          <span style={{ width: 18, height: 18, borderRadius: 18, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>IA</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2, lineHeight: 1.4 }}>
            El asistente abrió <strong>{catalog.catLabel[cat] ?? cat}</strong> porque lo pidió el cliente{s.highlightId ? " y dejó una opción lista 👇" : "."}
          </span>
        </div>
      )}
      <div ref={gridRef} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 14px 16px" }}>
        {catalog.menu.length === 0 && cat !== COMBO_CAT && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontFamily: F.mono, fontSize: 12, lineHeight: 1.7 }}>
            No hay productos en el catálogo todavía.<br />Créalos en Catálogo para venderlos aquí.
          </div>
        )}
        {sections.map((sec, si) => (
          <div key={si} style={{ marginTop: si === 0 ? 4 : 14 }}>
            {sec.label && <SubLabel>{sec.label}</SubLabel>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, alignContent: "start" }}>
              {sec.combos
                ? sec.combos.map((c) => <PosComboCard key={c.id} c={c} hl={s.highlightId === c.id} hlRef={s.highlightId === c.id ? hlRef : undefined} />)
                : sec.items!.map((p) => <PosProductCard key={p.id} p={p} hl={s.highlightId === p.id} hlRef={s.highlightId === p.id ? hlRef : undefined} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PosProductCard({ p, hl, hlRef }: { p: PosMenuItem; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  const out = p.stock === "sin";
  return (
    <button ref={hlRef} disabled={out} onClick={() => addItem(p.id)} className={hl ? "pos-hl" : ""} style={{
      textAlign: "left", padding: "11px 12px 10px", borderRadius: 3, cursor: out ? "not-allowed" : "pointer",
      border: `1.5px solid ${hl ? C.red : C.rule}`, background: hl ? C.paper : out ? C.paperDk : C.paperLt,
      opacity: out ? 0.55 : 1, position: "relative", display: "flex", flexDirection: "column", minHeight: 96,
    }}>
      {hl && <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 5, marginBottom: 7, fontFamily: F.mono, fontSize: 8, fontWeight: 700, letterSpacing: ".12em", color: C.paperLt, background: C.red, padding: "2px 6px", borderRadius: 2 }}>★ SUGERIDO</div>}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{p.name}</div>
        {!p.gluten && <span style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: ".06em", color: C.green, border: `1px solid ${C.green}`, padding: "1px 4px", flexShrink: 0, whiteSpace: "nowrap" }}>SIN GLUTEN</span>}
      </div>
      {p.desc && <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted, lineHeight: 1.35, marginTop: 4 }}>{p.desc}</div>}
      <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: C.ink }}>{posMoney(p.price)}</span>
        {out ? (
          <Stamp size={9} rotate={-6}>Agotado</Stamp>
        ) : hl ? (
          <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: C.paperLt, background: C.red, padding: "5px 10px", borderRadius: 2 }}>AGREGAR +</span>
        ) : (
          <span style={{ width: 26, height: 26, borderRadius: 2, border: `1px solid ${C.ink}`, color: C.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</span>
        )}
      </div>
      {p.stock === "bajo" && !out && <span style={{ position: "absolute", top: 10, right: 10, fontFamily: F.mono, fontSize: 8, letterSpacing: ".08em", color: C.amber }}>● bajo</span>}
    </button>
  );
}

function PosComboCard({ c, hl, hlRef }: { c: PosCombo; hl: boolean; hlRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={hlRef} onClick={() => addCombo(c.id)} className={hl ? "pos-hl" : ""} style={{
      textAlign: "left", padding: "11px 13px", borderRadius: 3, cursor: "pointer", gridColumn: "span 2",
      border: `1.5px solid ${hl ? C.red : C.green}`, background: hl ? C.paper : C.paperLt, display: "flex", alignItems: "center", gap: 13, position: "relative",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {hl && <span style={{ fontFamily: F.mono, fontSize: 8, fontWeight: 700, letterSpacing: ".1em", color: C.paperLt, background: C.red, padding: "2px 6px", borderRadius: 2 }}>★ SUGERIDO</span>}
          <div style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: C.ink }}>{c.name}</div>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 3 }}>{c.desc}</div>
        {c.saving > 0 && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.green, marginTop: 5, letterSpacing: ".04em" }}>AHORRA {posMoney(c.saving)}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="cmd-num" style={{ fontFamily: F.mono, fontSize: 17, fontWeight: 700, color: C.ink }}>{posMoney(c.price)}</div>
        <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: hl ? C.red : C.green, marginTop: 6 }}>{hl ? "AGREGAR +" : "+ combo"}</div>
      </div>
    </button>
  );
}

// ── column 2 : order ticket ─────────────────────────────────────
const ORDER_TYPES = [
  { id: "aqui", label: "Comer aquí" },
  { id: "llevar", label: "Para llevar" },
  { id: "domicilio", label: "Domicilio" },
] as const;

const qtyBtn: React.CSSProperties = { width: 24, height: 24, border: `1px solid ${C.ink}`, background: C.paperLt, color: C.ink, fontFamily: F.mono, fontSize: 14, lineHeight: 1, cursor: "pointer", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" };

function OrderColumn() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const comboSaved = s.order
    .filter((l) => l.kind === "combo")
    .reduce((acc, l) => acc + (catalog.comboById[l.id]?.saving ?? 0) * l.qty, 0);

  return (
    <div style={{ width: 372, height: "100%", display: "flex", flexDirection: "column", borderRight: `1.5px solid ${C.ink}`, background: C.paper }}>
      <div style={{ padding: "13px 16px 11px", borderBottom: `1.5px solid ${C.ink}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
          <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, letterSpacing: ".14em", color: C.ink }}>COMANDA</span>
          <Folio n={s.orderNo} label="PEDIDO" />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {ORDER_TYPES.map((t) => {
            const on = s.orderType === t.id;
            return (
              <button key={t.id} onClick={() => posStore.set({ orderType: t.id })} style={{
                flex: 1, fontFamily: F.mono, fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", padding: "7px 4px", cursor: "pointer",
                border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "transparent", color: on ? C.paperLt : C.ink2, borderRadius: 2,
              }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {s.order.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center", color: C.muted, fontFamily: F.mono, fontSize: 12, lineHeight: 1.7 }}>
            Toca un producto<br />para empezar el pedido.
          </div>
        )}
        {s.order.map((l, i) => {
          const linePrice = modLinePrice(l, catalog);
          const mods = modSummary(l, catalog);
          const prod = catalog.byId[l.id];
          return (
            <div key={i} style={{ borderBottom: `1px dashed ${C.ruleSoft}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 16px 8px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {l.kind === "combo" && <span style={{ fontFamily: F.mono, fontSize: 8, color: C.green, border: `1px solid ${C.green}`, padding: "1px 3px", letterSpacing: ".06em" }}>COMBO</span>}
                    <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.ink }}>{l.name}</span>
                  </div>
                  {l.kind === "combo" && <div style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, marginTop: 2 }}>{catalog.comboById[l.id]?.desc}</div>}
                  {mods.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {mods.map((m, k) => (
                        <span key={k} style={{ fontFamily: F.mono, fontSize: 9, color: m.delta > 0 ? C.green : C.ink2, border: `1px solid ${m.delta > 0 ? C.green : C.rule}`, background: C.paper, padding: "1px 5px", borderRadius: 2 }}>
                          {m.name}{m.delta > 0 ? ` +${m.delta / 1000}k` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{posMoney(linePrice)} c/u</span>
                    {l.hasMods && (
                      <button onClick={() => toggleLineExpanded(i)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: F.mono, fontSize: 9.5, letterSpacing: ".04em", color: C.red, textTransform: "uppercase", padding: 0 }}>
                        {l.expanded ? "▴ cerrar" : "▾ personalizar"}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <button onClick={() => changeQty(i, -1)} style={qtyBtn}>&minus;</button>
                  <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, minWidth: 14, textAlign: "center" }}>{l.qty}</span>
                  <button onClick={() => changeQty(i, +1)} style={qtyBtn}>+</button>
                </div>
                <div className="cmd-num" style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 64, textAlign: "right" }}>{posMoney(linePrice * l.qty)}</div>
              </div>
              {l.hasMods && l.expanded && prod && (
                <div style={{ padding: "4px 16px 12px", background: `${C.paperDk}55` }}>
                  {prod.mods.map((gid) => <LineModGroup key={gid} idx={i} gid={gid} line={l} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: `1.5px solid ${C.ink}`, padding: "12px 16px 14px", background: C.paperLt }}>
        {s.noteSinGluten && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9, fontFamily: F.mono, fontSize: 10, color: C.green, border: `1px solid ${C.green}`, padding: "5px 8px", letterSpacing: ".04em" }}>
            <span>✓</span> PEDIDO MARCADO «SIN GLUTEN»
          </div>
        )}
        {comboSaved > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.mono, fontSize: 11, color: C.green, marginBottom: 5 }}>
            <span>Ahorro en combos</span><span className="cmd-num">&minus;{posMoney(comboSaved)}</span>
          </div>
        )}
        {s.sendError && (
          <div style={{ marginBottom: 9, fontFamily: F.mono, fontSize: 10.5, color: C.red, border: `1px solid ${C.red}`, padding: "6px 8px", lineHeight: 1.4 }}>{s.sendError}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 11 }}>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: ".1em", color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 28, color: C.ink }}>{posMoney(total)}</span>
        </div>
        {s.sent ? (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1.5px solid ${C.green}`, color: C.green, fontFamily: F.mono, fontSize: 12, letterSpacing: ".08em", padding: "11px" }}>
              <Stamp color={C.green} rotate={-4} size={10}>Enviado</Stamp> A COCINA
            </div>
            <button className="cmd-btn ghost" onClick={resetConversation}>Nuevo</button>
          </div>
        ) : (
          <button className="cmd-btn red" disabled={!s.order.length || s.sending} onClick={sendOrder} style={{ width: "100%", fontSize: 13, padding: "13px", opacity: s.order.length && !s.sending ? 1 : 0.45, cursor: s.order.length && !s.sending ? "pointer" : "not-allowed" }}>
            {s.sending ? "Enviando…" : `Cobrar y enviar a cocina · ${posMoney(total)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function LineModGroup({ idx, gid, line }: { idx: number; gid: string; line: OrderLine }) {
  const catalog = useCatalog();
  const g: PosModGroup | undefined = catalog.modGroups[gid];
  if (!g) return null;
  const sel = line.mods?.[gid];
  const isSel = (name: string) => (g.type === "single" ? sel === name : Array.isArray(sel) && sel.includes(name));
  const pick = (name: string) => (g.type === "single" ? setLineSingle(idx, gid, name) : toggleLineMulti(idx, gid, name));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: C.ink2 }}>{g.name}</span>
        {g.required && <Stamp size={7} rotate={-2} color={C.red} style={{ padding: "1px 4px" }}>req</Stamp>}
        <span style={{ fontFamily: F.mono, fontSize: 8.5, color: C.muted, letterSpacing: ".04em" }}>{g.type === "single" ? "una opción" : "varias"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {g.options.map((o) => {
          const on = isSel(o.name);
          return (
            <button key={o.name} onClick={() => pick(o.name)} style={{
              fontFamily: F.mono, fontSize: 10, padding: "5px 8px", borderRadius: 2, cursor: "pointer",
              border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.paperLt, color: on ? C.paperLt : C.ink2,
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <span>{o.name}</span>
              {o.delta > 0 && <span className="cmd-num" style={{ color: on ? C.paperLt : C.green, opacity: on ? 0.85 : 1 }}>+{posMoney(o.delta)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AI panel
// ════════════════════════════════════════════════════════════════
function AiPanel() {
  const s = usePos();
  const open = s.suggestions.filter((g) => g.status === "open");
  const idle = s.transcript.length === 0;

  return (
    <div style={{ flex: 1, minWidth: 360, height: "100%", display: "flex", flexDirection: "column", background: C.ink }}>
      <AiHeader />
      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".18em", color: "rgba(244,236,220,.5)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sugerencias para ti</span>
          {s.thinking && <span style={{ color: C.amber, letterSpacing: ".08em" }}>· pensando…</span>}
          <span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.2)" }} />
        </div>
        {s.micNote && (
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 3, padding: "9px 11px", lineHeight: 1.5 }}>{s.micNote}</div>
        )}
        {open.length === 0 && (
          <div style={{ color: "rgba(244,236,220,.55)", fontFamily: F.mono, fontSize: 12, lineHeight: 1.7, padding: "18px 4px" }}>
            {idle
              ? "Activa el micrófono (o escribe abajo) y el asistente escuchará la conversación para darte ideas claras: agregar productos, combos, personalizar y atender alergias."
              : "Todo en orden. Sigo escuchando y te aviso si surge una oportunidad."}
          </div>
        )}
        {open.map((g) => <SuggestionCard key={g.uid} g={g} />)}
      </div>
      <TranscriptDock />
      <AiControls />
    </div>
  );
}

function AiHeader() {
  const s = usePos();
  const live = s.listening;
  return (
    <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(244,236,220,.16)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 30, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 11, fontWeight: 700 }}>IA</span>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.paperLt, letterSpacing: ".02em" }}>Asistente Comanda</div>
            <div style={{ fontFamily: F.mono, fontSize: 9.5, color: "rgba(244,236,220,.55)", letterSpacing: ".04em" }}>Te ayuda en cada pedido</div>
          </div>
        </div>
        <button onClick={() => posStore.set((st) => ({ ...st, listening: !st.listening }))} title="Activar/pausar micrófono" style={{
          display: "flex", alignItems: "center", gap: 7, background: "transparent", border: `1px solid ${s.listening ? C.red : "rgba(244,236,220,.3)"}`,
          color: s.listening ? C.red : "rgba(244,236,220,.6)", fontFamily: F.mono, fontSize: 9.5, letterSpacing: ".1em", padding: "5px 8px", cursor: "pointer", borderRadius: 2,
        }}>
          <span className={"pos-eq" + (live ? "" : " paused")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14 }}><i /><i /><i /><i /><i /></span>
          {s.listening ? "ESCUCHANDO" : "EN PAUSA"}
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7, fontFamily: F.mono, fontSize: 9.5, color: "rgba(244,236,220,.62)", lineHeight: 1.4 }}>
        <span className={s.listening ? "pos-rec" : ""} style={{ width: 7, height: 7, borderRadius: 7, background: s.listening ? C.red : "rgba(244,236,220,.4)", flexShrink: 0 }} />
        <span>Cliente informado · el audio se transcribe en la nube para asistirte; no se almacena. El cajero puede pausar cuando quiera.</span>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<PosSuggestKind, { line: string; tag: string }> = {
  pedido: { line: C.paperLt, tag: C.ink2 },
  combo: { line: C.green, tag: C.green },
  upsell: { line: C.amber, tag: C.amber },
  modificador: { line: C.amber, tag: C.amber },
  agotado: { line: C.red, tag: C.red },
  alergia: { line: C.red, tag: C.red },
  atencion: { line: C.amber, tag: C.amber },
  fidelidad: { line: C.green, tag: C.green },
};

function SuggestionCard({ g }: { g: SuggestionCardState }) {
  const col = KIND_COLOR[g.kind] || KIND_COLOR.pedido;
  return (
    <div className="pos-card" style={{ background: C.paperLt, borderRadius: 4, borderLeft: `4px solid ${col.line}`, boxShadow: "0 6px 18px -10px rgba(0,0,0,.5)", overflow: "hidden" }}>
      <div style={{ padding: "11px 13px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 2 }}>
            {POS_KIND_LABEL[g.kind] || "Idea"}
          </span>
          <button onClick={() => dismissSuggestion(g.uid, false)} title="Descartar" style={{ background: "transparent", border: "none", color: C.muted, fontFamily: F.mono, fontSize: 14, cursor: "pointer", lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 14.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{g.title}</div>
        {g.detail && <div style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ink2, lineHeight: 1.5, marginTop: 5 }}>{g.detail}</div>}
        {g.say && (
          <div style={{ marginTop: 10, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "9px 11px" }}>
            <div style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: ".16em", color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Para decir en voz alta</div>
            <div style={{ fontFamily: F.script, fontSize: 18, color: C.ink, lineHeight: 1.25 }}>“{g.say}”</div>
          </div>
        )}
        {g.actionLabel && g.act && (
          <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{
            marginTop: 11, width: "100%", fontFamily: F.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: ".02em",
            background: col.line === C.paperLt ? C.ink : col.line, color: C.paperLt, border: "none", borderRadius: 3, padding: "10px", cursor: "pointer",
          }}>{g.actionLabel}</button>
        )}
      </div>
    </div>
  );
}

function TranscriptDock() {
  const s = usePos();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [s.transcript.length, s.interim]);
  return (
    <div style={{ height: 176, borderTop: "1px solid rgba(244,236,220,.16)", background: "rgba(0,0,0,.18)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "9px 14px 4px", display: "flex", alignItems: "center", gap: 8, fontFamily: F.mono, fontSize: 9.5, letterSpacing: ".16em", color: "rgba(244,236,220,.5)", textTransform: "uppercase" }}>
        <span>Conversación en vivo</span><span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.18)" }} />
        <span className="cmd-num">{s.transcript.length}</span>
      </div>
      <div ref={ref} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {s.transcript.length === 0 && !s.interim && (
          <div style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(244,236,220,.4)", paddingTop: 8 }}>
            {s.listening ? "Escuchando… habla y aparecerá aquí." : "Esperando la conversación…"}
          </div>
        )}
        {s.transcript.map((t, i) =>
          t.who === "sistema" ? (
            <div key={i} style={{ textAlign: "center", fontFamily: F.mono, fontSize: 9.5, color: "rgba(244,236,220,.4)", letterSpacing: ".06em", fontStyle: "italic" }}>· {t.text} ·</div>
          ) : (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontFamily: F.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: t.who === "cliente" ? C.amber : C.green, minWidth: 50, textTransform: "uppercase" }}>{t.who}</span>
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.paperLt, lineHeight: 1.4, flex: 1 }}>{t.text}</span>
              <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 8.5, color: "rgba(244,236,220,.35)" }}>{t.time}</span>
            </div>
          ),
        )}
        {s.interim && (
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", opacity: 0.7 }}>
            <span style={{ fontFamily: F.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: C.amber, minWidth: 50, textTransform: "uppercase" }}>···</span>
            <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.paperLt, lineHeight: 1.4, flex: 1, fontStyle: "italic" }}>{s.interim}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const ctrlBtn = (flex: boolean): React.CSSProperties => ({ flex: flex ? 1 : "0 0 auto", fontFamily: F.mono, fontSize: 11, letterSpacing: ".04em", background: "transparent", border: "1px solid rgba(244,236,220,.32)", color: C.paperLt, padding: "9px 12px", cursor: "pointer", borderRadius: 2 });

function AiControls() {
  const [text, setText] = React.useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    appendTranscript("cliente", t);
    setText("");
  };
  return (
    <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(244,236,220,.16)" }}>
      <form onSubmit={submit} style={{ flex: 1, display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe lo que dijo el cliente…"
          style={{ flex: 1, fontFamily: F.mono, fontSize: 11, background: "rgba(244,236,220,.06)", border: "1px solid rgba(244,236,220,.28)", color: C.paperLt, padding: "9px 11px", borderRadius: 2, outline: "none" }}
        />
        <button type="submit" style={ctrlBtn(false)} title="Enviar al asistente">▶</button>
      </form>
      <button onClick={resetConversation} style={ctrlBtn(false)} title="Reiniciar pedido y conversación">↺</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Client-facing display
// ════════════════════════════════════════════════════════════════
function PosClient() {
  const s = usePos();
  const catalog = useCatalog();
  const total = orderTotal(s.order, catalog);
  const comboOffer = s.suggestions.find((g) => g.status === "open" && g.kind === "combo");
  const typeLabel = (ORDER_TYPES.find((t) => t.id === s.orderType) || ({} as { label?: string })).label;

  if (s.sent) return <ClientThanks />;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: F.mono, background: C.paper }}>
      <div style={{ padding: "22px 30px 18px", borderBottom: `1.5px solid ${C.ink}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ fontFamily: F.slab, fontSize: 38, color: C.ink, lineHeight: 1 }}>Tu pedido<span style={{ color: C.red }}>.</span></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: F.mono, fontSize: 13, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase" }}>{catalog.orgName}</div>
          <div style={{ fontFamily: F.mono, fontSize: 13, color: C.ink2, marginTop: 4, letterSpacing: ".06em" }}>{typeLabel} · {s.orderNo}</div>
        </div>
      </div>

      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 30px" }}>
        {s.order.length === 0 ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: C.muted }}>
            <div style={{ fontFamily: F.slab, fontSize: 30, color: C.ink2, marginBottom: 10 }}>¡Bienvenido!</div>
            <div style={{ fontFamily: F.mono, fontSize: 16, lineHeight: 1.6, maxWidth: 360 }}>Aquí verás tu pedido a medida que lo armamos. Pide con confianza.</div>
          </div>
        ) : (
          s.order.map((l, i) => {
            const mods = modSummary(l, catalog);
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 0", borderBottom: `1px dashed ${C.rule}` }}>
                <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 700, color: C.red, minWidth: 38 }}>{l.qty}&times;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 600, color: C.ink }}>{l.name}</div>
                  {l.kind === "combo" && <div style={{ fontFamily: F.mono, fontSize: 13, color: C.green, marginTop: 3 }}>Combo · {catalog.comboById[l.id]?.desc}</div>}
                  {mods.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {mods.map((m, k) => (
                        <span key={k} style={{ fontFamily: F.mono, fontSize: 12, color: m.delta > 0 ? C.green : C.ink2, border: `1px solid ${m.delta > 0 ? C.green : C.rule}`, padding: "2px 7px", borderRadius: 2 }}>{m.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="cmd-num" style={{ fontFamily: F.mono, fontSize: 20, fontWeight: 700, color: C.ink }}>{posMoney(modLinePrice(l, catalog) * l.qty)}</span>
              </div>
            );
          })
        )}

        {s.noteSinGluten && (
          <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 9, border: `1.5px solid ${C.green}`, color: C.green, fontFamily: F.mono, fontSize: 14, padding: "9px 14px", borderRadius: 3 }}>
            <span style={{ fontSize: 16 }}>✓</span> Anotamos tu pedido sin gluten
          </div>
        )}
      </div>

      {comboOffer && (
        <div style={{ margin: "0 30px 14px", background: C.paperLt, border: `1.5px solid ${C.green}`, borderRadius: 5, padding: "16px 20px", display: "flex", alignItems: "center", gap: 18 }}>
          <PhotoPlaceholder w={66} h={66} label="combo" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F.slab, fontSize: 23, color: C.ink, lineHeight: 1.1 }}>¿Lo hacemos combo?</div>
            <div style={{ fontFamily: F.mono, fontSize: 14, color: C.ink2, marginTop: 5, lineHeight: 1.5 }}>{comboOffer.detail}</div>
          </div>
        </div>
      )}

      <div style={{ borderTop: `1.5px solid ${C.ink}`, background: C.paperLt }}>
        <div style={{ padding: "16px 30px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: ".12em", color: C.ink2 }}>TOTAL</span>
          <span className="cmd-num" style={{ fontFamily: F.slab, fontSize: 46, color: C.ink, lineHeight: 1 }}>{posMoney(total)}</span>
        </div>
        <div style={{ padding: "11px 30px", borderTop: `1px dashed ${C.rule}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span className={s.listening ? "pos-rec" : ""} style={{ width: 9, height: 9, borderRadius: 9, background: s.listening ? C.red : C.muted, flexShrink: 0 }} />
          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            {s.listening
              ? "Un asistente de IA transcribe esta conversación para ayudar a nuestro equipo a atenderte mejor. El audio no se almacena; pídenos pausarlo cuando quieras."
              : "Asistente de IA en pausa. No estamos analizando la conversación."}
          </span>
        </div>
      </div>
    </div>
  );
}

function ClientThanks() {
  const s = usePos();
  const catalog = useCatalog();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: F.mono, background: C.paper, padding: 30 }}>
      <Stamp color={C.green} rotate={-7} size={14} style={{ marginBottom: 22 }}>Pedido enviado</Stamp>
      <div style={{ fontFamily: F.slab, fontSize: 52, color: C.ink, lineHeight: 1 }}>¡Gracias!</div>
      <div style={{ fontFamily: F.mono, fontSize: 17, color: C.ink2, marginTop: 16, lineHeight: 1.6, maxWidth: 420 }}>
        Tu pedido <strong style={{ color: C.red }}>{s.orderNo}</strong> ya está en cocina.<br />Te avisaremos cuando esté listo.
      </div>
      <div className="cmd-num" style={{ fontFamily: F.slab, fontSize: 30, color: C.ink, marginTop: 26 }}>{posMoney(orderTotal(s.order, catalog))}</div>
      <div style={{ fontFamily: F.mono, fontSize: 13, color: C.muted, marginTop: 8, letterSpacing: ".08em" }}>{(ORDER_TYPES.find((t) => t.id === s.orderType) || ({} as { label?: string })).label}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Page wrapper — both linked tablets on a dark canvas
// ════════════════════════════════════════════════════════════════
export function PosTerminal({ catalog }: { catalog: PosCatalog }) {
  // Seed the store's catalog once so imperative actions can read it.
  React.useEffect(() => {
    posStore.set({ catalog });
  }, [catalog]);

  return (
    <CatalogCtx.Provider value={catalog}>
      <div className="pos-root" style={{ minHeight: "100vh", background: "#171310", padding: "22px 28px 40px" }}>
        <style>{POS_CSS}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <Link href="/" style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(244,236,220,.65)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>← comanda</Link>
            <span style={{ fontFamily: F.slab, fontSize: 22, color: "#f4ecdc" }}>Punto de venta<span style={{ color: C.red }}>.</span></span>
          </div>
          <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(244,236,220,.5)", border: "1px solid rgba(244,236,220,.25)", padding: "4px 9px", borderRadius: 2 }}>
            Asistente de IA · en vivo
          </span>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
          <Tablet width={POS_TABLET_W} height={POS_TABLET_H} label="Caja · cajero" facing="cajero"><PosCashier /></Tablet>
          <Tablet width={POS_CLIENT_W} height={POS_TABLET_H} label="Pantalla cliente" facing="cliente"><PosClient /></Tablet>
        </div>
      </div>
    </CatalogCtx.Provider>
  );
}
