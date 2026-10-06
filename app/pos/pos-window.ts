"use client";
import * as React from "react";

/**
 * One POS window per browser. Two windows of the register on the same PC
 * fight for the label printer: the one without it reports every label as
 * "not printed" (or, before 2026-10-06, quietly queued it) while the other
 * holds the port. The first window to open takes a lease; any other window
 * sees it and stands aside until it is closed or the person takes over.
 *
 * The lease lives in localStorage (shared by every tab of this origin) and
 * is renewed every few seconds; a stale lease — a window that crashed or
 * lost power — expires on its own. A BroadcastChannel carries the change
 * at once so the other window reacts without waiting for a tick.
 */
export type WindowRole = "primary" | "secondary" | "unknown";

const KEY = "pos:window-lease";
const CHANNEL = "pos:window";
const RENEW_MS = 2_000;
const STALE_MS = 7_000;

interface Lease { id: string; ts: number }

const read = (): Lease | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Lease) : null;
  } catch {
    return null;
  }
};
const write = (l: Lease | null) => {
  try {
    if (l) window.localStorage.setItem(KEY, JSON.stringify(l));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: every window then thinks it is alone */
  }
};

export function usePosWindowLease(): { role: WindowRole; takeOver: () => void } {
  const [role, setRole] = React.useState<WindowRole>("unknown");
  const id = React.useRef<string>("");
  const forced = React.useRef(false);

  React.useEffect(() => {
    id.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }

    const claim = () => {
      write({ id: id.current, ts: Date.now() });
      channel?.postMessage({ type: "claim", id: id.current });
    };
    const tick = () => {
      const cur = read();
      const mine = cur?.id === id.current;
      const fresh = !!cur && Date.now() - cur.ts < STALE_MS;
      if (mine || !fresh || forced.current) {
        forced.current = false;
        claim();
        setRole("primary");
      } else {
        setRole("secondary");
      }
    };
    tick();
    const timer = window.setInterval(tick, RENEW_MS);
    const onMsg = (e: MessageEvent) => {
      const m = e.data as { type?: string; id?: string };
      // Another window took the lease: step aside right away.
      if (m?.type === "claim" && m.id && m.id !== id.current) setRole("secondary");
    };
    channel?.addEventListener("message", onMsg);
    const release = () => {
      if (read()?.id === id.current) {
        write(null);
        channel?.postMessage({ type: "release", id: id.current });
      }
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.clearInterval(timer);
      channel?.removeEventListener("message", onMsg);
      window.removeEventListener("pagehide", release);
      release();
      channel?.close();
    };
  }, []);

  const takeOver = React.useCallback(() => {
    forced.current = true;
    write({ id: id.current, ts: Date.now() });
    setRole("primary");
  }, []);

  return { role, takeOver };
}
