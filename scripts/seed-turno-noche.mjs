// Closing turnos for a sede (PAYO by default):
//
//   "Noche" 17:00–21:00 lun–sáb — the closing checklist split in three
//   puestos (Barista, Aseo, Cierre; Cierre gated on Aseo's "Entrar el punto
//   ecológico" — the floor is mopped last, after the doors and the till) plus
//   the "Arqueo y cierre de caja" task that points at Turno → Caja. The
//   Barista tasks carry the DAILY cleaning procedure of the espresso machine
//   (Caravel by Fiamma, automatic CV model, §6.1) as instructions.
//
//   "Limpieza semanal máquina" 20:00–21:00 sábados — the WEEKLY procedure
//   (§6.2): groups, trays, drain cup, body, water softener. Written for a
//   café WITHOUT machine detergent yet; each task says what changes when
//   there is some.
//
//   node scripts/seed-turno-noche.mjs [restaurant_id] [--prune]
//
// Idempotent and safe to re-run: puestos are upserted, each template is
// matched by name, tasks are matched by title and UPDATED in place (a delete
// would cascade to task_completions and erase history). Tasks that exist in
// the DB but not in this list are left alone unless --prune is passed.
// Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) like
// the .e2e scripts.
import { PAYO, seedTurnos } from "./lib/seed-turnos.mjs";

const args = process.argv.slice(2);
const PRUNE = args.includes("--prune");
const SEDE = args.find((a) => !a.startsWith("--")) ?? PAYO;

const PUESTOS = [
  { name: "Barista", color: "green", position: 1 },
  { name: "Aseo", color: "indigo", position: 2 },
  { name: "Cierre", color: "amber", position: 3 },
];

// Procedures for the team, condensed from the Caravel by Fiamma manual for
// the AUTOMATIC CV models (PAYO's machine): the group wash is the built-in
// self-cleaning cycle started with buttons 5 + 1. ≤ 1000 chars each.
const PROC = {
  gruposDiario:
    "1) Pon el filtro ciego en un portafiltro. 2) Engánchalo en el grupo. 3) Pulsa el botón 5 y el botón 1 a la vez para iniciar el lavado: los LEDs de los dos botones parpadean durante el ciclo. 4) Cuando dejan de parpadear, el ciclo terminó y la máquina vuelve sola al modo normal. 5) Repite hasta que el agua salga limpia. 6) Quita el filtro ciego y vuelve a poner el filtro normal. Puedes lavar varios grupos a la vez. Sin detergente: el detergente va en la limpieza semanal.",
  portafiltros:
    "Enjuaga filtros y portafiltros con agua bien caliente y un cepillo hasta que no quede grasa de café en la canasta ni en la oreja. Cuando haya detergente para máquinas de café, una cucharadita en el agua ayuda a disolver la grasa.",
  lanzas:
    "Purga vapor unos segundos y limpia cada lanza y grifo con el trapo húmedo de lácteos. Nada de leche seca ni incrustaciones: se acumulan y tapan la lanza.",
  juntas:
    "Con la máquina apagada (interruptor general) y fría si se apaga al cierre. Limpia las juntas de los portafiltros y las guías de los grupos (donde engancha el portafiltro) con un paño o esponja.",
  gruposSemanal:
    "Por ahora sin detergente (no hay en la cafetería): mismo lavado con el filtro ciego, solo agua. 1) Filtro ciego en un portafiltro. 2) Engancha en el grupo. 3) Pulsa el botón 5 y el botón 1 a la vez: los LEDs parpadean mientras dura el ciclo y la máquina para sola. 4) Repite el ciclo 3 o 4 veces por grupo hasta que el agua salga limpia. 5) Filtro ciego fuera, filtro normal puesto. Cuando llegue el detergente: pon una cucharadita en el filtro ciego, y entre ciclos quita el portafiltro, límpialo y vuelve a engancharlo hasta que el agua salga sin restos en la cubeta; al final prepara un café y bótalo para quitar el sabor.",
  rejillas:
    "Rejillas plásticas de la bandeja superior: paño húmedo. Rejilla y bandeja inferior (bajo los grupos): lavar con agua caliente (y detergente para máquinas cuando lo haya). Nunca productos abrasivos ni disolventes.",
  cubeta:
    "Con la bandeja inferior retirada queda visible la cubeta de desagüe. Limpia la cubeta y el orificio de descarga con un cepillo para sacar residuos y evitar que se tape el tubo.",
  cuerpo:
    "Exterior de la máquina con un paño húmedo (y detergente suave cuando lo haya). Nunca abrasivos ni disolventes.",
  suavizador:
    "Cada 2 semanas como mínimo (alterna sábados). Sigue las instrucciones que vienen con el suavizador de agua.",
};

// [puesto, title, due_time, requires_photo, instructions]
const TEMPLATES = [
  {
    name: "Noche",
    inicio: "17:00:00",
    fin: "21:00:00",
    dias: [true, true, true, true, true, true, false],
    puestos: ["Barista", "Aseo", "Cierre"],
    /** Cierre waits for this Aseo task (soft handoff). */
    gate: { puesto: "Cierre", title: "Entrar el punto ecológico" },
    tasks: [
      ["Barista", "Lavar utensilios sucios", "20:15", false, null],
      ["Barista", "Lavar los grupos con el filtro ciego (limpieza diaria)", "20:30", true, PROC.gruposDiario],
      ["Barista", "Lavar filtros y portafiltros con agua caliente", "20:30", true, PROC.portafiltros],
      ["Barista", "Purgar y limpiar las lanzas de vapor", "20:30", true, PROC.lanzas],
      ["Barista", "Apagar la máquina de café", "20:32", false, "Después de purgar y limpiar las lanzas: interruptor general en OFF. La bandeja y las juntas se limpian con la máquina ya apagada."],
      ["Barista", "Lavar la bandeja de la máquina de espresso", "20:35", false, null],
      ["Barista", "Secar la bandeja de la máquina con un trapito", "20:37", false, "Bien seca antes de volver a ponerla, para que no quede agua estancada."],
      ["Barista", "Limpiar las juntas y guías de los grupos", "20:40", false, PROC.juntas],
      ["Barista", "Meter tortas a refrigerar", "20:40", false, null],
      ["Barista", "Asegurar que los envases de las tortas estén cerrados", "20:40", false, null],
      ["Barista", "Frascos de comestibles en la barra debidamente cerrados", "20:45", false, null],
      ["Barista", "Asegurar que los insumos del área de trabajo (polvos, salsas, etc.) estén debidamente sellados", "20:45", false, null],
      ["Barista", "Desenchufar el microondas", "20:45", false, null],
      ["Barista", "Poner el delantal en el colgadero", "20:50", false, null],
      ["Aseo", "Limpiar el área de trabajo", "20:30", false, null],
      ["Aseo", "Limpiar la barra del mostrador", "20:40", true, "Que quede sin residuos."],
      ["Aseo", "Lavar los trapos y dejarlos ordenados en su sitio", "20:45", false, null],
      ["Aseo", "Entrar las sillas", "20:45", false, null],
      ["Aseo", "Entrar el punto ecológico", "20:45", false, null],
      ["Aseo", "Barrer y trapear el área de trabajo", "21:00", true, "Es lo último, con las puertas ya cerradas y la caja hecha. Piso limpio, sin agua encharcada."],
      ["Cierre", "Apagar el sistema POS", "20:45", false, null],
      ["Cierre", "Apagar el SonoQR de Bold", "20:45", false, null],
      ["Cierre", "Apagar la etiquetadora", "20:45", false, null],
      ["Cierre", "Cerrar la puerta de la calle", "20:50", false, "Después de entrar el punto ecológico."],
      ["Cierre", "Colocar los pasadores a la puerta de la calle", "20:50", true, "Foto con los pasadores puestos."],
      ["Cierre", "Echar llave a la chapa de la puerta de la calle", "20:50", true, "Foto de la chapa con llave echada."],
      ["Cierre", "Cerrar las puertas de la carrera", "20:52", false, null],
      ["Cierre", "Reportar cuánto hay en la caja con la herramienta de arqueo", "20:55", false, "Con las puertas ya cerradas. Abre Caja · arqueo (en el tablet: chip «Caja» arriba; desde tu turno: la tile «Caja · arqueo»). Cuenta el efectivo por denominación y envía el cierre: ahí queda registrado cuánto hay, el sistema te dice qué billetes dejar de base y confirmas que los apartaste. El dueño lo revisa en el panel.", { was: "Arqueo y cierre de caja" }],
      ["Cierre", "Apagar las luces y salir por la puerta de la carrera", "21:00", true, "Cuando el piso esté trapeado. Al salir, ajustar los pasadores de piso y cerrar con llave."],
    ],
  },
  {
    name: "Limpieza semanal máquina",
    inicio: "20:00:00",
    fin: "21:00:00",
    dias: [false, false, false, false, false, true, false],
    puestos: ["Barista"],
    gate: null,
    tasks: [
      ["Barista", "Lavado semanal de los grupos (filtro ciego)", "20:15", true, PROC.gruposSemanal],
      ["Barista", "Lavar rejillas y bandejas de la máquina", "20:35", true, PROC.rejillas],
      ["Barista", "Limpiar la cubeta de residuos y el orificio de descarga", "20:40", true, PROC.cubeta],
      ["Barista", "Limpiar el cuerpo de la máquina", "20:45", false, PROC.cuerpo],
      ["Barista", "Limpiar el suavizador de agua (cada 2 semanas)", "20:50", false, PROC.suavizador],
    ],
  },
];

await seedTurnos({ sede: SEDE, puestos: PUESTOS, templates: TEMPLATES, prune: PRUNE });
