import { describe, expect, it } from "vitest";
import { destinoTicket, equipoDe, puedeSerEstacion, resumenImpresora, type TicketEstacion } from "./estaciones";

const caja = (over: Partial<TicketEstacion> = {}): TicketEstacion => ({
  deviceId: "caja-pc-001",
  nombre: "Caja 01",
  equipo: "Windows · Edge",
  silencioso: true,
  hace: 4,
  ...over,
});
const yo = { deviceId: "tablet-0001", silencioso: null };

describe("equipoDe", () => {
  it("names the system and browser", () => {
    expect(equipoDe("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(equipoDe("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Android · Chrome");
    expect(puedeSerEstacion("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
    expect(puedeSerEstacion("Mozilla/5.0 (Windows NT 10.0)")).toBe(true);
  });
});

describe("destinoTicket", () => {
  it("«No» prints nowhere; «A la caja» relays to the station that prints straight", () => {
    expect(destinoTicket("no", yo, [caja()])).toEqual({ donde: "ninguno" });
    const dialogo = caja({ deviceId: "caja-pc-002", nombre: "Caja 02", silencioso: false });
    expect(destinoTicket("caja", yo, [dialogo, caja()])).toEqual({ donde: "relevo", estacion: caja() });
    expect(destinoTicket("caja", yo, [])).toEqual({ donde: "relevo", estacion: null });
  });

  it("«Aquí» prints here, unless this browser opens the dialog and another station prints straight", () => {
    const aqui = { deviceId: "caja-pc-002", silencioso: true };
    expect(destinoTicket("aqui", aqui, [caja()])).toEqual({ donde: "aqui" });
    expect(destinoTicket("aqui", { ...aqui, silencioso: null }, [caja()])).toEqual({ donde: "aqui" });
    expect(destinoTicket("aqui", { ...aqui, silencioso: false }, [caja()])).toEqual({ donde: "relevo", estacion: caja() });
    // Nobody better: print here anyway (the dialog lets them pick the printer).
    expect(destinoTicket("aqui", { ...aqui, silencioso: false }, [caja({ silencioso: false })])).toEqual({ donde: "aqui" });
    // Its own row never counts as «another station».
    expect(destinoTicket("aqui", { deviceId: "caja-pc-001", silencioso: false }, [caja()])).toEqual({ donde: "aqui" });
  });
});

describe("resumenImpresora", () => {
  it("tells the sender where its tickets go, and flags when nobody can print them", () => {
    expect(resumenImpresora("caja", yo, { estaciones: [caja()], enEspera: 0 })).toEqual({
      texto: "Salen en Caja 01 (Windows · Edge) · activa hace 4 s.",
      problema: false,
    });
    expect(resumenImpresora("caja", yo, { estaciones: [], enEspera: 2 }).problema).toBe(true);
    expect(resumenImpresora("caja", yo, { estaciones: [], enEspera: 2 }).texto).toContain("2 en espera");
    expect(resumenImpresora("caja", yo, { estaciones: [caja({ silencioso: false })], enEspera: 0 }).problema).toBe(true);
    expect(resumenImpresora("caja", yo, null)).toEqual({ texto: "Buscando la caja con impresora…", problema: false });
  });

  it("tells the station whether it prints straight", () => {
    const st = { deviceId: "caja-pc-001", silencioso: true };
    expect(resumenImpresora("aqui", st, { estaciones: [caja()], enEspera: 0 })).toEqual({ texto: "Imprime aquí, directo a la impresora.", problema: false });
    expect(resumenImpresora("aqui", { ...st, silencioso: false }, { estaciones: [caja()], enEspera: 0 }).problema).toBe(true);
    expect(resumenImpresora("aqui", { deviceId: "caja-pc-002", silencioso: false }, { estaciones: [caja()], enEspera: 0 }).texto).toContain("salen en Caja 01");
  });
});
