/**
 * The register rings when an order arrives from outside the stations (today:
 * the WhatsApp agent), so the team hears it over the speaker even when nobody
 * is looking at the screen.
 *
 * The sound is synthesized with Web Audio (no asset to load, works
 * offline): a phone-style «new message» pop and two bell notes. A browser
 * cannot raise the PC's volume: Windows and the speaker must be turned up. It also cannot start audio before someone has
 * touched the page — the context unlocks on the first tap, which on a
 * register happens within minutes; launching Edge with
 * `--autoplay-policy=no-user-gesture-required` removes even that.
 */
import type { PosOrder } from "./types";

/** Orders from the agent that this station has not rung for yet. */
export function pedidosNuevos(
  conocidos: ReadonlySet<string> | null,
  orders: readonly Pick<PosOrder, "id" | "canal" | "createdAt">[],
  ahora: number,
): string[] {
  const remotos = orders.filter((o) => o.canal === "whatsapp");
  // First load of this register: what was already waiting doesn't ring,
  // unless it came in just now (the screen was reloading as it arrived).
  if (!conocidos) return remotos.filter((o) => ahora - Date.parse(o.createdAt) < RECIENTE_MS).map((o) => o.id);
  return remotos.filter((o) => !conocidos.has(o.id)).map((o) => o.id);
}
const RECIENTE_MS = 2 * 60 * 1000;

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** Unlock the audio on the first tap/key (browser autoplay rule). Call once on mount. */
export function prepararAlerta(): () => void {
  const unlock = () => void audio()?.resume().catch(() => {});
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", unlock, opts);
  window.addEventListener("keydown", unlock, opts);
  unlock();
  return () => {
    window.removeEventListener("pointerdown", unlock, opts);
    window.removeEventListener("keydown", unlock, opts);
  };
}

/**
 * A phone-style «new message» sound, played twice so it carries over the
 * bar: a short bubble pop, then two bright bell notes (E6 → B6) that ring
 * out softly — an original sound in the spirit of a social-app message, not
 * anyone's recording. Sine bells through a limiter, as loud as the speaker
 * allows without clipping.
 */
export function sonarAlerta(): void {
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => {});
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  const salida = ac.createGain();
  salida.gain.value = 1.6;
  limiter.connect(salida).connect(ac.destination);

  /** The «pop»: a very short sine whose pitch drops, like a bubble. */
  const pop = (start: number) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1600, start);
    osc.frequency.exponentialRampToValueAtTime(700, start + 0.05);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.9, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
    osc.connect(g).connect(limiter);
    osc.start(start);
    osc.stop(start + 0.09);
  };
  /** A bell note: fundamental plus a soft octave, fast attack, long ring. */
  const campana = (freq: number, start: number, dur: number) => {
    for (const [mult, nivel] of [[1, 0.8], [2, 0.18], [3, 0.06]] as const) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(nivel, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur / mult);
      osc.connect(g).connect(limiter);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  };

  const t0 = ac.currentTime + 0.05;
  for (let vez = 0; vez < 2; vez++) {
    const t = t0 + vez * 1.1;
    pop(t);
    campana(1318.5, t + 0.07, 0.55);
    campana(1975.5, t + 0.19, 0.8);
  }
}

/** A WhatsApp order nobody has accepted rings again every 5 minutes. */
export const RECORDATORIO_MS = 5 * 60 * 1000;

/**
 * Which waiting orders are due for another ring: one ring per full
 * `cadaMs` since the order arrived (the arrival ring is round 0). `avisados`
 * holds the last round rung per order and is updated in place.
 */
export function recordatoriosVencidos(
  pedidos: readonly { id: string; createdAt: string }[],
  avisados: Map<string, number>,
  ahora: number,
  cadaMs = RECORDATORIO_MS,
): string[] {
  const vencidos: string[] = [];
  for (const p of pedidos) {
    const ronda = Math.floor((ahora - Date.parse(p.createdAt)) / cadaMs);
    if (ronda >= 1 && ronda > (avisados.get(p.id) ?? 0)) {
      avisados.set(p.id, ronda);
      vencidos.push(p.id);
    }
  }
  // Forget orders that are no longer waiting.
  for (const id of avisados.keys()) if (!pedidos.some((p) => p.id === id)) avisados.delete(id);
  return vencidos;
}

/**
 * A soft, short «someone is chatting» sound — far quieter than the order
 * alert, so the team can tell them apart: two low bell notes (A5 → D6).
 */
export function sonarConversacion(): void {
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => {});
  const salida = ac.createGain();
  salida.gain.value = 0.35;
  salida.connect(ac.destination);
  const nota = (freq: number, start: number, dur: number) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.7, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(salida);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };
  const t = ac.currentTime + 0.03;
  nota(880, t, 0.35);
  nota(1174.7, t + 0.14, 0.5);
}

/** Conversations whose latest customer message is newer than what this register already chimed for. */
export function conversacionesNuevas(
  vistas: Map<string, string>,
  activas: readonly { id: string; ultimo: string }[],
): string[] {
  const nuevas = activas.filter((c) => (vistas.get(c.id) ?? "") < c.ultimo).map((c) => c.id);
  for (const c of activas) vistas.set(c.id, c.ultimo);
  return nuevas;
}

// ── Recordatorio de tareas del turno ─────────────────────────────────────

/** A task rings once it is this many minutes past its time and still undone. */
export const TAREA_GRACIA_MIN = 5;
/** While any task stays late, the register rings again this often. */
export const TAREA_REPETIR_MS = 10 * 60 * 1000;

/**
 * Whether the register should ring for late turno tasks now. A task that
 * just crossed the grace period rings at once; otherwise, while any stays
 * late, one ring every `repetirMs` — never one per task. `estado` is kept
 * by the caller and updated in place.
 */
export function recordatorioTareas(
  vencidas: readonly { id: string; tarde: number }[],
  estado: { sonadas: Set<string>; ultimo: number },
  ahora: number,
  opts: { graciaMin?: number; repetirMs?: number } = {},
): boolean {
  const gracia = opts.graciaMin ?? TAREA_GRACIA_MIN;
  const repetir = opts.repetirMs ?? TAREA_REPETIR_MS;
  const ya = vencidas.filter((t) => t.tarde >= gracia);
  const ids = new Set(ya.map((t) => t.id));
  for (const id of estado.sonadas) if (!ids.has(id)) estado.sonadas.delete(id);
  if (!ya.length) return false;
  const nueva = ya.some((t) => !estado.sonadas.has(t.id));
  for (const id of ids) estado.sonadas.add(id);
  if (nueva || ahora - estado.ultimo >= repetir) {
    estado.ultimo = ahora;
    return true;
  }
  return false;
}

/**
 * «Falta una tarea»: three falling chime notes (G6 → E6 → C6), twice — a
 * different shape from the order alert (which climbs), so the team can tell
 * a reminder from a new order by ear. As loud as the order alert.
 */
export function sonarRecordatorio(): void {
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => {});
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  const salida = ac.createGain();
  salida.gain.value = 1.5;
  limiter.connect(salida).connect(ac.destination);
  const nota = (freq: number, start: number, dur: number) => {
    for (const [mult, nivel] of [[1, 0.75], [2, 0.15], [4, 0.04]] as const) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(nivel, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur / mult);
      osc.connect(g).connect(limiter);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  };
  const t0 = ac.currentTime + 0.05;
  for (let vez = 0; vez < 2; vez++) {
    const t = t0 + vez * 1.4;
    nota(1568, t, 0.5);
    nota(1318.5, t + 0.28, 0.5);
    nota(1046.5, t + 0.56, 0.8);
  }
}
