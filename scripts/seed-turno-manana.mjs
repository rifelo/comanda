// Turno "Mañana hábil" for a sede (PAYO by default): the opening checklist,
// 06:00–12:00 lun–vie, one shared list (no puestos). Captured from the live
// template on 2026-09-24 and rewritten so every task is one clear line with
// short instructions; "Abrir el local y dar la ronda de revisión" became two
// tasks (open the doors / check for water leaks).
//
//   node scripts/seed-turno-manana.mjs [restaurant_id] [--prune]
//
// Idempotent: see scripts/lib/seed-turnos.mjs. Renamed tasks carry `was`
// (the previous title) so they keep their id and their completion history.
import { PAYO, seedTurnos } from "./lib/seed-turnos.mjs";

const args = process.argv.slice(2);
const PRUNE = args.includes("--prune");
const SEDE = args.find((a) => !a.startsWith("--")) ?? PAYO;

// [puesto, title, due_time, requires_photo, instructions, { was }]
const TEMPLATES = [
  {
    name: "Mañana hábil",
    inicio: "06:00:00",
    fin: "12:00:00",
    dias: [true, true, true, true, true, false, false],
    puestos: [],
    gate: null,
    tasks: [
      [null, "Abrir las puertas del local", "06:00", false, "Abre por completo la puerta de la calle y la de la carrera.", { was: "Abrir el local y dar la ronda de revisión" }],
      [null, "Revisar fugas y charcos de agua", "06:02", false, "Nevera: mira si hay goteo, charcos o agua en el piso alrededor. Baño: fugas en el sanitario y el lavamanos. Si hay algo, foto y Novedad antes de seguir."],
      [null, "Subir los tacos de la luz (todos en ON)", "06:05", false, "Todos los tacos arriba. Confirma que prendieron nevera, vitrina, luces y tomas de la barra."],
      [null, "Abrir el paso de agua de la máquina", "06:05", false, "Abre la llave por completo. Revisa que no gotee el filtro ni las mangueras."],
      [null, "Encender la máquina de café y el molino", "06:10", true, "Es lo primero: necesita 30 a 40 min para tomar temperatura y presión. Foto del manómetro en presión de trabajo."],
      [null, "Encender POS, etiquetadora y datáfono", "06:15", true, "POS en la pantalla de ventas, etiquetadora con rollo para el turno, datáfono encendido y con señal. Foto del POS."],
      [null, "Contar la base de caja", "06:20", true, "Cuenta la base antes de la primera venta. Si falta o sobra plata, Novedad de una vez. Foto del conteo sobre la barra.", { was: "Contar la base de caja y abrir el arqueo" }],
      [null, "Registrar temperatura de nevera y vitrina", "06:25", true, "Nevera y vitrina entre 2 °C y 6 °C; congelador por debajo de −15 °C. Fuera de rango: no uses el producto y repórtalo. Foto del termómetro."],
      [null, "Rotar insumos: lo que vence primero, adelante", "06:30", false, "Leche, pulpas, pasteles y preparados. Retira lo vencido o en mal estado y anótalo en Novedades.", { was: "Revisar fechas y rotar insumos (lo que vence primero, adelante)" }],
      [null, "Sacar los pasteles y montar la vitrina", "06:35", true, "Sácalos con tiempo para que tomen temperatura ambiente. Pinzas o guantes, vitrina ordenada y precios visibles. Foto de la vitrina."],
      [null, "Limpiar y desinfectar el área de trabajo", "06:35", false, "Mesones, tablas, neveras por fuera y lavaplatos. Basura afuera y bolsa nueva."],
      [null, "Barrer y trapear la zona interior", "06:40", false, "Con desinfectante, del fondo hacia la puerta. Aviso de piso mojado mientras seca."],
      [null, "Limpiar la barra y el mostrador", "06:40", false, "Barra despejada, vidrios de la vitrina sin huellas, nada de trapos ni cajas a la vista del cliente.", { was: "Limpiar la barra y el mostrador de cara al cliente" }],
      [null, "Limpiar mesas y sillas y organizar el salón", "06:45", true, "Desinfecta mesas y sillas, alinéalas y surte los servilleteros. Foto del salón listo."],
      [null, "Barrer la zona exterior y sacar mesas y sillas", "06:45", false, "Barre el frente del local, limpia la fachada si está sucia y ubica las mesas y sillas de afuera."],
      [null, "Sacar el punto ecológico", "06:45", true, "Residuos separados, en el horario de recolección. Canecas con bolsa nueva. Foto del punto ecológico."],
      [null, "Vaciar el garrafón del desagüe de la máquina", "06:45", true, "Vacíalo, enjuágalo y déjalo conectado con la manguera bien adentro. Foto del garrafón vacío y conectado."],
      [null, "Revisar y surtir el baño", "06:50", true, "Aseo, papel higiénico, jabón, toallas y caneca vacía. Sin olores. Foto del baño listo."],
      [null, "Purgar los grupos y alistar la estación de café", "06:50", false, "Purga cada grupo, limpia duchas y portafiltros y cambia el agua del rinser. Paños limpios: uno para la lanza de vapor y otro para la barra."],
      [null, "Calibrar el espresso del día", "06:55", true, "Shots de prueba hasta que dosis, tiempo y peso queden en rango; los de prueba se botan. Molienda anotada en Novedades. Foto de la báscula con el shot final."],
      [null, "Montar la barra: vasos, tapas, leches y siropes", "06:55", false, "Todo surtido y a la mano, por tamaño. Lo que no alcance para el día, repórtalo."],
      [null, "Abrir al público", "07:00", true, "Uniforme puesto, manos lavadas, música y luces encendidas, aviso de ABIERTO visible. Foto de la fachada."],
      [null, "Revisar insumos críticos y reportar faltantes", "09:00", false, "Café, leche, vasos, tapas, servilletas y pasteles. Lo que alcance para menos de un día, Novedad ya, no al final del turno."],
      [null, "Aseo de media mañana y ronda del salón", "09:30", false, "Mesas libres limpias, piso sin residuos, barra despejada y baño revisado. Garrafón del desagüe: vacíalo si va por la mitad."],
      [null, "Segunda toma de temperatura de nevera y vitrina", "10:30", true, "Mismo rango de la mañana (2 °C a 6 °C). Si subió, revisa que las puertas cierren bien y repórtalo. Foto del termómetro."],
      [null, "Dejar la barra lista y cuadrar la caja para la entrega", "11:30", true, "Barra limpia y surtida, máquina purgada, lanza limpia, vitrina ordenada, garrafón vacío. Caja contada y cuadrada. Foto de la barra."],
      [null, "Entregar el turno y reportar novedades", "11:45", false, "Qué quedó pendiente, qué se dañó, qué falta pedir y cómo quedó la caja. Déjalo escrito en Novedades aunque lo digas de palabra."],
    ],
  },
];

await seedTurnos({ sede: SEDE, templates: TEMPLATES, prune: PRUNE });
