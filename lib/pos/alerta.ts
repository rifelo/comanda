/**
 * The register rings when an order arrives from outside the stations (today:
 * the WhatsApp agent), so the team hears it over the speaker even when nobody
 * is looking at the screen.
 *
 * The sound is synthesized with Web Audio at full gain (no asset to load,
 * works offline). A browser cannot raise the PC's volume: Windows and the
 * speaker must be turned up. It also cannot start audio before someone has
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
 * Three rounds of a rising two-tone chime (~3.5 s), square wave through a
 * limiter so it is as loud as the speaker allows without clipping.
 */
export function sonarAlerta(): void {
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => {});
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 20;
  limiter.connect(ac.destination);
  const t0 = ac.currentTime + 0.05;
  const tono = (freq: number, start: number, dur: number) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(1, start + 0.01);
    g.gain.setValueAtTime(1, start + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(limiter);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };
  for (let ronda = 0; ronda < 3; ronda++) {
    const t = t0 + ronda * 1.2;
    tono(880, t, 0.22);
    tono(1175, t + 0.26, 0.22);
    tono(1568, t + 0.52, 0.4);
  }
}
