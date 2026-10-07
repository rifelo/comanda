"use client";
import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { printerStore, printRelayedLabel, setPrintRelay, usePrinter } from "@/lib/printer/serial";
import { encolarEtiquetas, reclamarEtiquetas } from "./actions";

/**
 * What keeps the stations of one business in step:
 *   · labels — a tablet has no printer, so it relays its labels (as specs,
 *     through the server) and the register with the printer claims and
 *     prints them;
 *   · orders — when a station saves, pays or cancels an order the others
 *     reload their open-orders list at once instead of on the next poll.
 *
 * Realtime carries only a nudge ("look now") on a broadcast channel, with no
 * data in it: a paired device has no user session, so it can't read rows
 * over the socket. The data always goes through the authenticated server
 * actions, and a slow poll covers a missed nudge.
 */
export type LiveEvent = "print" | "ordenes";

let channel: RealtimeChannel | null = null;

/** Tell the other stations something changed. Never throws. */
export function nudge(event: LiveEvent) {
  try {
    void channel?.send({ type: "broadcast", event, payload: {} });
  } catch {
    // The poll picks it up.
  }
}

const canPrintNow = () => {
  const st = printerStore.get().status;
  return st === "ready" || st === "printing";
};

let claiming = false;
/** Take whatever labels are waiting and print them here (printer stations only). */
export async function claimLabels() {
  if (claiming || !canPrintNow()) return;
  claiming = true;
  try {
    const res = await reclamarEtiquetas();
    if (res.ok) for (const spec of res.jobs) printRelayedLabel(spec);
  } catch {
    // Offline: the next poll retries.
  } finally {
    claiming = false;
  }
}

const POLL_MS = 15_000;

export function usePosLive(organizationId: string, onOrders: () => void) {
  const printer = usePrinter();
  const ready = printer.status === "ready" || printer.status === "printing";
  const onOrdersRef = React.useRef(onOrders);
  React.useEffect(() => { onOrdersRef.current = onOrders; }, [onOrders]);

  React.useEffect(() => {
    setPrintRelay(async (specs) => {
      const res = await encolarEtiquetas(specs);
      if (res.ok) {
        nudge("print");
        void claimLabels(); // this very station, if its printer just came back
      }
      return res.ok;
    });
    const supabase = createSupabaseBrowserClient();
    const ch = supabase
      .channel(`pos:${organizationId}`)
      .on("broadcast", { event: "print" }, () => void claimLabels())
      .on("broadcast", { event: "ordenes" }, () => onOrdersRef.current())
      .subscribe();
    channel = ch;
    return () => {
      setPrintRelay(null);
      if (channel === ch) channel = null;
      void supabase.removeChannel(ch);
    };
  }, [organizationId]);

  // The printer station also polls: a nudge can be missed (socket asleep).
  React.useEffect(() => {
    if (!ready) return;
    void claimLabels();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void claimLabels();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready]);
}
