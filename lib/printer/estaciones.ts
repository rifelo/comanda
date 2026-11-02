import { z } from "zod";

/**
 * Where the receipt printer is. Every POS set to «Aquí» reports a heartbeat
 * (pos_ticket_estaciones, mig 0068) with whether its prints go straight to the
 * printer or open the browser's print dialog. The other devices read the list
 * to know where their tickets end up, warn when nobody is there to print
 * them, and route around a station that shows the dialog.
 *
 * Pure: shared by the server actions, the browser and the tests.
 */

/** A station with no heartbeat for this long counts as closed. */
export const ESTACION_VIVA_MS = 90_000;
/** How often a station reports, and senders refresh the list. */
export const LATIDO_MS = 30_000;
/** A relayed ticket nobody claimed after this is reported as stuck. */
export const TICKET_ATASCADO_MS = 25_000;
/**
 * print() blocks while the browser shows its dialog; with Edge's
 * --kiosk-printing it returns as soon as the job is spooled. Nobody picks a
 * printer and clicks «Imprimir» faster than this.
 */
export const DIALOGO_MS = 1_500;

export const LatidoSchema = z.object({
  deviceId: z.string().min(8).max(64),
  /** null = this device is not the receipt printer station (any more). */
  estacion: z
    .object({
      equipo: z.string().max(80),
      silencioso: z.boolean().nullable(),
      papel: z.enum(["80", "58"]),
    })
    .nullable(),
});
export type Latido = z.infer<typeof LatidoSchema>;

export interface TicketEstacion {
  deviceId: string;
  /** Paired device name («Caja 01»). */
  nombre: string;
  /** «Windows · Edge». */
  equipo: string | null;
  silencioso: boolean | null;
  /** Seconds since its last heartbeat. */
  hace: number;
}

export interface EstadoImpresoras {
  estaciones: TicketEstacion[];
  /** Tickets waiting in the relay queue (not claimed yet, not expired). */
  enEspera: number;
}

/** «Windows · Edge», «Android · Chrome»… from the user agent. */
export function equipoDe(ua: string): string {
  const so = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPad|iPhone|iPod/i.test(ua)
        ? "iPad/iPhone"
        : /Macintosh|Mac OS X/i.test(ua)
          ? "Mac"
          : /CrOS/i.test(ua)
            ? "Chromebook"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Equipo";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "navegador";
  return `${so} · ${nav}`;
}

/** Can this browser print a hidden page straight to a Windows printer at all? */
export function puedeSerEstacion(ua: string): boolean {
  return !/Android|iPad|iPhone|iPod/i.test(ua);
}

export type Destino =
  | { donde: "aqui" }
  | { donde: "relevo"; estacion: TicketEstacion | null }
  | { donde: "ninguno" };

/**
 * Where one ticket goes from this device.
 *   · «No» → nowhere.
 *   · «Aquí» → printed here; but when this browser is known to open the
 *     print dialog and another station prints straight, it goes there.
 *   · «A la caja» → relayed; `estacion` is the one expected to print it
 *     (null = none open: it waits in the queue up to 5 min).
 */
export function destinoTicket(
  modo: "aqui" | "caja" | "no",
  yo: { deviceId: string; silencioso: boolean | null },
  estaciones: TicketEstacion[] | null,
): Destino {
  if (modo === "no") return { donde: "ninguno" };
  const otras = (estaciones ?? []).filter((e) => e.deviceId !== yo.deviceId);
  const mejor = otras.find((e) => e.silencioso === true) ?? otras.find((e) => e.silencioso !== false) ?? otras[0] ?? null;
  if (modo === "aqui") {
    if (yo.silencioso === false && mejor?.silencioso === true) return { donde: "relevo", estacion: mejor };
    return { donde: "aqui" };
  }
  return { donde: "relevo", estacion: mejor };
}

/** One line for the «⋯» menu and the warnings: what happens to this device's tickets. */
export function resumenImpresora(
  modo: "aqui" | "caja" | "no",
  yo: { deviceId: string; silencioso: boolean | null },
  estado: EstadoImpresoras | null,
): { texto: string; problema: boolean } {
  if (modo === "no") return { texto: "Este equipo no imprime recibos.", problema: false };
  const otras = (estado?.estaciones ?? []).filter((e) => e.deviceId !== yo.deviceId);
  const quien = (e: TicketEstacion) => (e.equipo ? `${e.nombre} (${e.equipo})` : e.nombre);
  if (modo === "aqui") {
    const d = destinoTicket(modo, yo, estado?.estaciones ?? null);
    if (d.donde === "relevo" && d.estacion) {
      return { texto: `Este equipo abre el cuadro de impresión: los tickets salen en ${quien(d.estacion)}.`, problema: true };
    }
    if (yo.silencioso === false) {
      return { texto: "Este equipo abre el cuadro de impresión. Ábrelo con el acceso «Co-manda POS» para imprimir directo.", problema: true };
    }
    const tambien = otras.length ? ` También imprime: ${otras.map(quien).join(", ")}.` : "";
    return {
      texto: (yo.silencioso === true ? "Imprime aquí, directo a la impresora." : "Imprime aquí (aún sin probar: imprime un recibo de prueba).") + tambien,
      problema: false,
    };
  }
  if (!estado) return { texto: "Buscando la caja con impresora…", problema: false };
  const espera = estado.enEspera > 0 ? ` ${estado.enEspera} en espera.` : "";
  if (!otras.length) {
    return { texto: `Ninguna caja con impresora está abierta: los tickets esperan hasta 5 min.${espera}`, problema: true };
  }
  const d = destinoTicket(modo, yo, estado.estaciones);
  const e = d.donde === "relevo" && d.estacion ? d.estacion : otras[0];
  if (e.silencioso === false) {
    return { texto: `Salen en ${quien(e)}, pero allá se abre el cuadro de impresión.${espera}`, problema: true };
  }
  return { texto: `Salen en ${quien(e)} · activa hace ${e.hace} s.${espera}`, problema: false };
}
