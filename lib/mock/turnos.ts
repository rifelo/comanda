/**
 * Mock data for the Turnos admin module.
 *
 * UI-only — no database wiring. Mirrors the design handoff
 * (`comanda-turnos.jsx`) 1:1. When we wire Turnos to Supabase later, these
 * arrays become hydration shims (template_tasks etc.) and disappear.
 */

// ─────────────────────────────────────────────────────────────
// Sub-nav order shown in the Turnos sidebar `Secciones`
// ─────────────────────────────────────────────────────────────
export type TurnosSection = {
  id: string;
  n: string;
  label: string;
  href: string;
};

export const TURNOS_SECTIONS: readonly TurnosSection[] = [
  { id: "resumen", n: "01", label: "Resumen", href: "/turnos/resumen" },
  { id: "plantillas", n: "02", label: "Plantillas", href: "/turnos/plantillas" },
  { id: "asignacion", n: "03", label: "Asignación", href: "/turnos/asignacion" },
  { id: "historial", n: "04", label: "Historial", href: "/turnos/historial" },
  { id: "reportes", n: "05", label: "Reportes", href: "/turnos/reportes" },
] as const;

// ─────────────────────────────────────────────────────────────
// Task seeds — used by Plantillas editor + AdminDrilldown
// ─────────────────────────────────────────────────────────────
export type TurnoTask = {
  id: string;
  title: string;
  instructions: string;
  time: string;
  requiresPhoto: boolean;
};

export const TURNO_DIA_TASKS: readonly TurnoTask[] = [
  { id: "t1", title: "Abrir caja y registrar fondo", instructions: "Verificar billetes + monedas iniciales", time: "10:30", requiresPhoto: false },
  { id: "t2", title: "Limpiar mesón principal", instructions: "Trapo húmedo + desinfectante", time: "10:45", requiresPhoto: true },
  { id: "t3", title: "Encender freidoras y plancha", instructions: "Esperar 8 min antes de cocinar", time: "11:00", requiresPhoto: false },
  { id: "t4", title: "Surtir nevera Coca-Cola", instructions: "Mínimo 24 unidades por sabor", time: "11:15", requiresPhoto: true },
  { id: "t5", title: "Trapear piso del local", instructions: "Sala + cocina + baños", time: "11:20", requiresPhoto: true },
  { id: "t6", title: "Revisar fechas de vencimiento", instructions: "Carnes + lácteos + salsas", time: "11:30", requiresPhoto: false },
  { id: "t7", title: "Limpiar nevera Coca-Cola", instructions: "Por dentro y por fuera", time: "11:38", requiresPhoto: true },
  { id: "t8", title: "Verificar inventario de pan", instructions: "Conteo físico", time: "12:00", requiresPhoto: false },
  { id: "t9", title: "Pulir cubiertos", instructions: "Paño microfibra seco", time: "13:00", requiresPhoto: false },
  { id: "t10", title: "Cerrar arqueo turno día", instructions: "Conciliar caja vs POS", time: "14:15", requiresPhoto: false },
  { id: "t11", title: "Entregar turno al cajero noche", instructions: "Firma de relevo en bitácora", time: "14:30", requiresPhoto: true },
];

export const TURNO_NOCHE_TASKS: readonly TurnoTask[] = [
  { id: "n1", title: "Recibir turno del cajero día", instructions: "Verificar fondo + inventario", time: "14:30", requiresPhoto: false },
  { id: "n2", title: "Limpiar plancha entre turnos", instructions: "Raspar + aceitar", time: "14:45", requiresPhoto: true },
  { id: "n3", title: "Reponer hielo en barra", instructions: "Hasta el tope del depósito", time: "15:30", requiresPhoto: false },
  { id: "n4", title: "Surtir gaseosas", instructions: "Coca-Cola + Sprite + Quatro", time: "16:00", requiresPhoto: true },
  { id: "n5", title: "Limpiar mesas de la sala", instructions: "Cada 30 min en hora pico", time: "19:00", requiresPhoto: false },
  { id: "n6", title: "Revisar aceite de fritura", instructions: "Cambiar si está oscuro", time: "20:30", requiresPhoto: true },
  { id: "n7", title: "Recoger basura sala + baños", instructions: "Bolsa nueva", time: "22:00", requiresPhoto: false },
  { id: "n8", title: "Trapear piso del local", instructions: "Después del cierre al público", time: "01:00", requiresPhoto: true },
  { id: "n9", title: "Cerrar arqueo turno noche", instructions: "Conciliar caja vs POS", time: "02:00", requiresPhoto: false },
  { id: "n10", title: "Apagar equipos y cerrar local", instructions: "Plancha, freidoras, neveras, luces", time: "02:30", requiresPhoto: true },
];

// ─────────────────────────────────────────────────────────────
// 01 · Resumen — definición de los dos turnos del día
// ─────────────────────────────────────────────────────────────
export type TurnoResumen = {
  shift: "día" | "noche";
  horario: string;
  plantilla: string;
  version: string;
  tareas: number;
  fotos: number;
  hoy: string | null;
  estado: "EN CURSO" | "POR ABRIR";
  done: number;
};

export const TURNOS_RESUMEN: readonly TurnoResumen[] = [
  {
    shift: "día",
    horario: "10:30 – 14:30",
    plantilla: "Cajero · día",
    version: "v3",
    tareas: 11,
    fotos: 5,
    hoy: "Mariana Castaño",
    estado: "EN CURSO",
    done: 9,
  },
  {
    shift: "noche",
    horario: "14:30 – 02:30",
    plantilla: "Cajero · noche",
    version: "v3",
    tareas: 10,
    fotos: 4,
    hoy: null,
    estado: "POR ABRIR",
    done: 0,
  },
];

export const TURNOS_WEEKLY_HORARIO = [
  { turno: "Día", horario: "10:30–14:30", dias: "Lun – Dom", plantilla: "Cajero · día v3" },
  { turno: "Noche", horario: "14:30–02:30", dias: "Lun – Dom", plantilla: "Cajero · noche v3" },
] as const;

// ─────────────────────────────────────────────────────────────
// 03 · Asignación — semana 20
// ─────────────────────────────────────────────────────────────
export const ASIG_DIAS = [
  { d: "Lun", n: "12", hoy: false },
  { d: "Mar", n: "13", hoy: false },
  { d: "Mié", n: "14", hoy: false },
  { d: "Jue", n: "15", hoy: true },
  { d: "Vie", n: "16", hoy: false },
  { d: "Sáb", n: "17", hoy: false },
  { d: "Dom", n: "18", hoy: false },
] as const;

export type RosterPerson = {
  name: string;
  role: string;
  turnos: number;
};

export const ASIG_ROSTER: readonly RosterPerson[] = [
  { name: "Mariana Castaño", role: "Cajero", turnos: 4 },
  { name: "Carlos Rincón", role: "Cajero", turnos: 5 },
  { name: "Luis Ángel", role: "Cajero", turnos: 3 },
  { name: "Sara Mejía", role: "Aux. cocina", turnos: 4 },
];

export const ASIG_GRID: Record<"día" | "noche", (string | null)[]> = {
  día: ["MC", "MC", "LA", "MC", "CR", "LA", null],
  noche: ["CR", "SM", "CR", null, "SM", "CR", "SM"],
};

// ─────────────────────────────────────────────────────────────
// 04 · Historial — turnos pasados
// ─────────────────────────────────────────────────────────────
export type HistorialEstado = "en curso" | "cerrado" | "incompleto";

export type HistorialTurno = {
  id: number;
  fecha: string;
  turno: "día" | "noche";
  folio: string;
  who: string;
  done: number;
  total: number;
  fotos: number;
  nov: number;
  estado: HistorialEstado;
};

export const HISTORIAL_PAST: readonly HistorialTurno[] = [
  { id: 0, fecha: "JUE 15·MAY", turno: "día", folio: "DR-184", who: "Mariana C.", done: 9, total: 11, fotos: 5, nov: 2, estado: "en curso" },
  { id: 1, fecha: "MIÉ 14·MAY", turno: "noche", folio: "DR-181", who: "Carlos R.", done: 10, total: 10, fotos: 4, nov: 1, estado: "cerrado" },
  { id: 2, fecha: "MIÉ 14·MAY", turno: "día", folio: "DR-180", who: "Mariana C.", done: 11, total: 11, fotos: 5, nov: 0, estado: "cerrado" },
  { id: 3, fecha: "MAR 13·MAY", turno: "noche", folio: "DR-178", who: "Sara M.", done: 8, total: 10, fotos: 3, nov: 2, estado: "incompleto" },
  { id: 4, fecha: "MAR 13·MAY", turno: "día", folio: "DR-177", who: "Luis A.", done: 11, total: 11, fotos: 5, nov: 1, estado: "cerrado" },
];

export const HISTORIAL_EVIDENCIA = [
  "Mesón limpio",
  "Piso trapeado",
  "Nevera Coca-Cola limpia",
  "Nevera surtida",
  "Z arqueo",
] as const;

export const HISTORIAL_HORAS = ["10:42", "11:08", "11:18", "11:24", "14:30"] as const;

// ─────────────────────────────────────────────────────────────
// 05 · Reportes — cumplimiento por turno
// ─────────────────────────────────────────────────────────────
export const REPORTES_WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;
export const REPORTES_GLOBAL_PCT = [88, 90, 96, 90, 91, 91, 86] as const;

export type ReportePorTurno = {
  name: string;
  sub: string;
  vals: readonly number[];
  avg: number;
};

export const REPORTES_POR_TURNO: readonly ReportePorTurno[] = [
  { name: "Turno día", sub: "10:30 – 14:30", vals: [100, 100, 91, 100, 91, 82, 91], avg: 94 },
  { name: "Turno noche", sub: "14:30 – 02:30", vals: [90, 80, 100, 80, 90, 100, 80], avg: 89 },
];

export const REPORTES_KPIS = [
  { l: "Tareas completadas", v: "134 / 147" },
  { l: "Fotos verificadas", v: "61 / 63" },
  { l: "Novedades", v: "9" },
  { l: "Tareas en retraso", v: "6" },
] as const;
