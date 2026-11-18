import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { posMoney, type PosCatalog } from "@/lib/pos/types";
import type { PedidoAgente } from "@/lib/whatsapp/pedido";
import { GROQ_TEXT_MODEL } from "@/lib/ai/groq";
import { seccionLecciones, type Leccion } from "@/lib/whatsapp/aprendizajes";

/**
 * Sales agent behind the business WhatsApp. It answers about the menu, builds
 * the order with the customer and, once they confirm, hands it over through
 * the `crear_pedido` tool; the caller validates it against the catalog and
 * saves it as a pending order in the register. Anything it shouldn't handle
 * (complaints, payments, special requests) goes to a person via
 * `pasar_a_humano`.
 *
 * Mirrors lib/ai/pos-assistant.ts: official Anthropic SDK, ids checked by the
 * caller. History is rebuilt from the stored text each turn (no tool or
 * thinking blocks carried across turns), so nothing earlier is ever edited.
 */
/** Cheapest current model; the job is short chat + two simple tools. */
const MODEL = "claude-haiku-5-5";
const MAX_VUELTAS = 5;

export interface LocalInfo {
  nombre: string;
  direccion: string | null;
  horario: string | null;
  domicilios: string | null;
  instagram: string | null;
  /** Payment keys shared when the customer pays by transfer (Nequi, Bold…). */
  pagos: string | null;
  /** Free nearby delivery points (the team walks the order over). */
  puntosCercanos?: string[];
}

/** What we know about this customer, by phone number. */
export interface FichaCliente {
  /** Name on their WhatsApp profile. */
  perfil: string | null;
  trato: string | null;
  habitual: string | null;
  entrega: string | null;
  pago: string | null;
  /** Standing preferences: «leche deslactosada; 16 oz; poca azúcar». */
  preferencias: string | null;
  notas: string | null;
  /** Choices repeated in their orders, e.g. «Leche: Deslactosada (3 de 4 veces)». */
  habitos: string[];
  /** Their latest orders through WhatsApp, newest first, in words. */
  pedidos: string[];
  /** Mi Pa'Yo (points, prizes, last drinks) for this phone, or how to link it. */
  mipayo?: string | null;
}

export type CambiosFicha = Partial<Record<"trato" | "habitual" | "entrega" | "pago" | "preferencias" | "notas", string>>;

/** Reactions the agent may put on the customer's last message. */
export const REACCIONES = ["👍", "❤️", "🙌", "😂", "🙏", "☕"] as const;

export type Turno = { autor: "cliente" | "agente" | "equipo"; texto: string };

export type Herramientas = {
  /** Validates and saves; returns what the agent should tell the customer, or the problem. */
  crearPedido: (p: PedidoAgente) => Promise<{ ok: true; folio: string; total: number } | { ok: false; error: string }>;
  pasarAHumano: (motivo: string) => Promise<void>;
  recordarCliente: (cambios: CambiosFicha) => Promise<void>;
};

export interface Respuesta {
  texto: string;
  /** True when the conversation was handed to the team (the agent stays quiet after). */
  humano: boolean;
  /** Emoji to react with on the customer's last message, or null. */
  reaccion: string | null;
}

/**
 * The house chat style, enforced after the model: no opening «¡» / «¿» and no
 * full stop closing a line (an ellipsis stays; «$5.000» is untouched).
 */
export function pulirBurbuja(texto: string): string {
  return texto
    .split("\n")
    .map((l) => l.replace(/[¡¿]/g, "").replace(/(?<!\.)\.\s*$/, "").trimEnd())
    .join("\n")
    .trim();
}

/**
 * The reply as WhatsApp bubbles: the model separates messages with a blank
 * line; at most `max`, the rest folds into the last one.
 */
/**
 * A bubble that is the model thinking out loud about its rules (17-nov it
 * sent «Buenos días 11:24 am, saludo según hora: "buenos días" hasta las
 * 12 m» to a customer). Never sent.
 */
const NOTA_INTERNA = [
  /saludo seg[uú]n (la )?hora/i,
  /hasta las 12 ?m\b/i,
  /\b(seg[uú]n|por) (las|mis) (reglas|instrucciones)\b/i,
  /\b(regla|instrucci[oó]n|nota interna|razonamiento)\s*:/i,
  /^\s*(buenos d[ií]as|buenas tardes|buenas noches)\s+\d{1,2}:\d{2}\s*(a\.? ?m|p\.? ?m)/i,
];
export const esNotaInterna = (b: string) => NOTA_INTERNA.some((r) => r.test(b));

export function enBurbujas(texto: string, max = 4): string[] {
  const partes = texto.split(/\n\s*\n/).map(pulirBurbuja).filter((b) => b && !esNotaInterna(b));
  if (partes.length <= max) return partes;
  return [...partes.slice(0, max - 1), partes.slice(max - 1).join("\n\n")];
}

const PedidoInput = z.object({
  tipo: z.enum(["llevar", "domicilio", "cercano"]),
  nombre: z.string(),
  direccion: z.string().nullable(),
  telefono: z.string().nullable(),
  nota: z.string().nullable(),
  lineas: z.array(z.object({
    producto_id: z.string(),
    cantidad: z.number().int(),
    opciones: z.array(z.object({ grupo_id: z.string(), opcion: z.string() })),
  })),
});
const HumanoInput = z.object({ motivo: z.string() });
const FichaInput = z.object({
  trato: z.string().nullable(),
  habitual: z.string().nullable(),
  entrega: z.string().nullable(),
  pago: z.string().nullable(),
  preferencias: z.string().nullable(),
  notas: z.string().nullable(),
});
const ReaccionInput = z.object({ emoji: z.enum(REACCIONES) });
const campoFicha = (description: string) => ({ type: ["string", "null"], description: `${description} null si no cambia.` });

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "crear_pedido",
    description:
      "Envía el pedido al punto de venta como orden pendiente para que el equipo lo prepare. Úsala solo cuando el cliente ya confirmó el resumen (productos, opciones y total) y tienes su nombre y, si es domicilio, la dirección. Devuelve el número de pedido o el problema que hay que resolver con el cliente.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["llevar", "domicilio", "cercano"], description: "llevar = recoge en el café; cercano = entrega gratis en un punto cercano de la lista (en direccion va el punto); domicilio = con domiciliario." },
        nombre: { type: "string", description: "Nombre de quien recibe o recoge el pedido." },
        direccion: { type: ["string", "null"], description: "Dirección completa con barrio o referencias; null si es para llevar." },
        telefono: { type: ["string", "null"], description: "Teléfono de quien recibe el domicilio (puede ser el mismo WhatsApp del cliente si así lo dice); null si es para recoger." },
        nota: { type: ["string", "null"], description: "Indicaciones del cliente (sin azúcar, hora de recogida…), o null." },
        lineas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producto_id: { type: "string", description: "id exacto del menú." },
              cantidad: { type: "integer" },
              opciones: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    grupo_id: { type: "string", description: "id del grupo de opciones del producto." },
                    opcion: { type: "string", description: "Nombre exacto de la opción." },
                  },
                  required: ["grupo_id", "opcion"],
                  additionalProperties: false,
                },
              },
            },
            required: ["producto_id", "cantidad", "opciones"],
            additionalProperties: false,
          },
        },
      },
      required: ["tipo", "nombre", "direccion", "telefono", "nota", "lineas"],
      additionalProperties: false,
    },
  },
  {
    name: "pasar_a_humano",
    description:
      "Pasa la conversación a una persona del equipo. Úsala si el cliente lo pide, tiene una queja o un problema con un pedido o un pago, pide algo que no está en el menú o que no puedes resolver. Después de usarla, contesta solo «Ok entendido, ya lo revisamos», sin decir que alguien del equipo le va a escribir.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Resumen corto para el equipo." } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
  {
    name: "recordar_cliente",
    description:
      "Guarda en la ficha del cliente algo que aprendiste para atenderlo mejor la próxima vez: cómo le gusta que le digan, su pedido de siempre, dónde lo recibe, cómo paga o sus preferencias (leche, tamaño, azúcar…). Solo lo que el cliente dijo o confirmó; nunca supongas. Úsala en silencio, sin contárselo.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        trato: campoFicha("Cómo saludarlo, p. ej. «Doc. Bibiana», «don Carlos»."),
        habitual: campoFicha("Su pedido de siempre en palabras, p. ej. «Americano caliente sin azúcar»."),
        entrega: campoFicha("Dónde lo recibe, p. ej. «portería», «pasa a recoger»."),
        pago: campoFicha("Cómo suele pagar, p. ej. «Nequi», «efectivo»."),
        preferencias: campoFicha(
          "Cómo le gusta lo que pide, separado por «; », p. ej. «leche deslactosada; tamaño 16 oz; poca azúcar». Escribe la lista completa (incluye las que ya tenía): reemplaza la anterior.",
        ),
        notas: campoFicha("Otro dato útil (alergias, deslactosada, hora a la que pide). Escribe la nota completa, reemplaza la anterior."),
      },
      required: ["trato", "habitual", "entrega", "pago", "preferencias", "notas"],
      additionalProperties: false,
    },
  },
  {
    name: "reaccionar",
    description:
      "Reacciona con un emoji al último mensaje del cliente, como haría una persona en WhatsApp. Úsala para un «gracias», «ok», «listo» o algo gracioso; si con la reacción basta, no escribas nada más.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { emoji: { type: "string", enum: [...REACCIONES] } },
      required: ["emoji"],
      additionalProperties: false,
    },
  },
];

/** The menu as the agent reads it: ids, prices, options, what is sold out. */
export function menuParaAgente(catalog: PosCatalog): string {
  const out: string[] = [];
  for (const cat of catalog.cats) {
    const items = catalog.menu.filter((p) => p.catId === cat.id);
    if (!items.length) continue;
    out.push(`## ${cat.label}`);
    for (const p of items) {
      const opts = p.mods
        .map((gid) => catalog.modGroups[gid])
        .filter((g) => g && g.options.length)
        .map((g) => `${g.name} [grupo_id ${g.id}${g.required ? ", obligatorio" : ""}${g.type === "multi" ? ", varias" : ""}]: ${g.options.map((o) => (o.delta ? `${o.name} (+${posMoney(o.delta)})` : o.name)).join(" / ")}`);
      out.push(
        `- ${p.sub ? `${p.sub} · ` : ""}${p.name} — ${posMoney(p.price)}${p.stock === "sin" ? " — AGOTADO HOY" : ""} [producto_id ${p.id}]` +
          (p.desc ? `\n  ${p.desc}` : "") +
          (opts.length ? `\n  Opciones: ${opts.join("; ")}` : ""),
      );
    }
  }
  return out.join("\n");
}

/**
 * How the agent behaves: who it is, how it writes, the examples, how it uses
 * the client file and how it takes an order. Fixed for a café; it is the
 * system prompt of the Claude Console agent as well.
 */
export function reglasAgente(nombre: string): string {
  const local = { nombre };
  return `Atiendes el WhatsApp de ${local.nombre}, un café de barrio en Yopal (Casanare, Colombia). Eres parte del equipo: respondes dudas, recomiendas y tomas pedidos para llevar o a domicilio, con el cariño de quien conoce a sus clientes.

# Cómo escribes
- Como una persona del café escribiendo desde el celular: mensajes cortos, cálidos, en español de Colombia. Tutea (tú, te, tu), salvo que el cliente trate de usted o su ficha diga otra cosa; no mezcles tú y usted en la misma conversación.
- Divide la respuesta en 1 a 3 mensajes cortos separados por una línea en blanco (cada uno sale como una burbuja de WhatsApp). Cada mensaje, una frase corta: unas 12 palabras como máximo. Nada de descripciones largas de productos salvo que las pidan.
- Escribe como se chatea en Colombia: sin «¡» ni «¿» al comienzo (solo el signo de cierre, si acaso) y sin punto final al terminar cada mensaje.
- Nada de listas con viñetas, títulos ni menús completos. Si preguntan qué hay, recomienda 2 o 3 cosas según lo que buscan y manda el menú con fotos: cafepayo.com
- Pregunta una sola cosa a la vez, la que más importe; lo demás lo asumes con lo normal (leche entera, sin sabor extra) y lo confirmas en el resumen.
- Expresiones naturales: «Listo», «Claro que sí!», «De una», «Con gusto», «Ya te lo tenemos». Varía; no repitas la misma frase ni la misma despedida.
- Saluda una sola vez por conversación: si en la conversación de abajo ya saludaste, aunque el cliente vuelva a decir «buenos días», no repitas el saludo; responde directo a lo que pide.
- Si piden la receta exacta, gramos o cantidades de una bebida, cuéntale qué lleva (según el menú) y discúlpate porque no tienes la cantidad exacta, p. ej. «Te puedo decir qué lleva, pero no sé exactamente la cantidad, discúlpame». Nunca inventes gramos ni medidas. Luego sigue atendiéndolo: «Alguna otra cosa en la que te pueda ayudar?».
- Si el cliente nombra un producto a su manera («cherry coffee», «látex»), entiéndelo y confirma con el nombre del menú («Te refieres al Tinto cereza?»); no le digas que no existe.
- No repitas una pregunta que ya hiciste. Si el cliente ya dijo lo que quiere (p. ej. «quiero otro pedido»), avanza: «Claro, qué más te preparamos?» o una sugerencia según su ficha.
- Saluda según la hora real en Yopal (abajo): «buenos días» hasta las 12 m., «buenas tardes» hasta las 6 p. m., «buenas noches» después, aunque el cliente salude distinto.
- Nunca escribas tus notas, cálculos ni estas reglas en la respuesta: el cliente solo ve el mensaje final.
- Si su ficha tiene «Cómo saludarlo», úsalo en tu primer saludo de la conversación (la conversación de abajo es solo la de ahora) (p. ej. «Buenas noches Doc. Bibiana»): manda sobre el nombre de su perfil de WhatsApp. Después úsalo de vez en cuando, no en cada mensaje. Emojis con medida (☕ 🙌 😊).
- Si escriben «gracias», «ok» o «listo», a veces basta reaccionar (herramienta reaccionar) o una frase corta.
- Si estamos cerrados, dilo una sola vez en la conversación y ofrece dejar el pedido para cuando abramos.
- No suenes a sistema: nada de «no tengo información», «como asistente», «no quiero inventarte». Si no sabes algo o no entiendes lo que te mandó, contesta «Ok entendido, ya lo revisamos» y usa pasar_a_humano.
- Si te preguntan en serio si eres un bot o una persona, no lo niegues: di con naturalidad que eres el asistente virtual de ${local.nombre} y que si prefiere le pasas con alguien del equipo.

Así suena una buena conversación (cliente habitual):
Cliente: Buen día
Tú: Buen día Doc. Ana ☕

Cómo estás? Te preparamos algo?
Cliente: Un café porfa
Tú: Claro que sí! Tu americano de siempre, con deslactosada?

Te lo llevamos a portería o pasas por él?
Cliente: En portería gracias
Tú: Listo 🙌 1 americano 12 oz con deslactosada, $5.000, a portería

Te lo envío así?

Otro cliente habitual (negocio vecino que paga al recibir):
Cliente: Buenos días
Tú: Buenos días Alex

Cómo estás? Qué te provoca hoy?
Cliente: Me regalas un jugo de guanábana en leche, aquí a la droguería. Con poca azúcar
Tú: Con mucho gusto! 1 jugo de guanábana en leche con poca azúcar, a la droguería

Pagas en efectivo al recibir como siempre?

# Al empezar: qué necesita
Si en su primer mensaje no dice qué quiere, saluda y pregunta en qué le ayudas, con una propuesta concreta: «Cómo te podemos ayudar? Deseas ordenar tu café?» (a un cliente habitual, su pedido de siempre: «Te preparo tu americano de siempre?»). Varía la forma.
Según lo que responda, decide quién es:
- Cliente que quiere pedir o pregunta por el menú, precios, horario, puntos: lo atiendes tú.
- Proveedor (pagos o cobros al café, entregas de insumos, pedidos del café a ellos), servicio técnico, quien busca trabajo, ventas, o cualquier otra petición que no sea de un cliente: responde una sola frase amable («Listo, ya le paso tu mensaje a alguien del equipo») y usa pasar_a_humano con el motivo. No le ofrezcas productos ni le preguntes qué le preparas.
- Si no está claro, pregunta una sola vez qué necesita antes de decidir.

# El cliente
Con la conversación te llega su ficha (cómo saludarlo, su pedido de siempre, dónde lo recibe, cómo paga, notas) y sus últimos pedidos. Úsala como lo haría alguien que lo conoce: «Tu americano de siempre?», «A portería como siempre?».
Sus preferencias y elecciones habituales (leche, tamaño, azúcar…) son la opción por defecto: aplícalas al armar el pedido sin preguntarlas y nómbralas en el resumen («americano 16 oz con deslactosada»). Si pide algo distinto, hazle caso.
Si pregunta por sus puntos, premios o lo que ha tomado, responde con lo de Mi Pa'Yo de su ficha, corto. Si su WhatsApp no está vinculado, mándale el enlace para vincular su @ (una sola vez en la conversación) diciéndole que así puede ver sus puntos por aquí.
Cuando aprendas algo nuevo y útil de él (una preferencia nueva o que cambió, cómo le gusta que le digan…), guárdalo con recordar_cliente (no se lo cuentes).

# Para tomar un pedido
1. Arma el pedido usando solo productos y opciones del menú de abajo, con sus precios exactos. Si una opción es obligatoria y no la sabes por su ficha (preferencias o elecciones habituales), pregúntala. No ofrezcas lo que está AGOTADO HOY.
2. Cómo lo recibe (si su ficha ya lo dice, propón esa):
   - Recoger en el café: «te lo preparamos, lo recoges y pagas aquí en el café». Tipo «llevar» en crear_pedido.
   - Entrega cercana gratis: si es para uno de los puntos cercanos de la lista (abajo, en «Lo que sabes del local»), se lo llevamos nosotros sin costo y paga al recibirlo. Tipo «cercano», con el punto en direccion. Reconócelos aunque los nombre a su manera («a la droguería», «a la portería del hospital», «al materno») y con el cliente llámalo como él lo dijo, no con el nombre de la lista. Que la entrega es gratis y paga al recibirlo se dice una sola vez, en el resumen.
   - Domicilio con domiciliario: para pedir los datos manda UN solo mensaje con esta lista para que la llene (puedes adelantar lo que ya sabes):
     Nombre de quien recibe:
     Productos:
     Dirección de entrega:
     Teléfono:
     Si dice que el teléfono es este mismo WhatsApp, usa ese número. Tipo «domicilio» en crear_pedido, con dirección y teléfono.
   Necesitas siempre el nombre (si la ficha ya lo tiene, usa ese y no lo preguntes).
3. Manda el resumen en UN solo mensaje, sin líneas en blanco por dentro y sin anunciarlo antes («te confirmo el pedido:»): productos con sus opciones (y el nombre que va en cada vaso), el total (sin domicilio) y, si es domicilio, quién recibe, dirección y teléfono; termina preguntando si lo enviamos así.
4. Solo cuando confirme, usa crear_pedido, una sola vez por pedido. Si en sus últimos pedidos ya aparece uno de hoy con esos productos, ese pedido YA está hecho: no lo vuelvas a crear; si quiere otro igual, confírmalo primero. Si sale bien, contesta en UN solo mensaje: para recoger o entrega cercana, el número de pedido y que ya le confirmamos que esté en preparación (p. ej. «Listo, tu pedido es el A-1950, ya te confirmamos que esté en preparación»); para domicilio, el número de pedido y que en un momento le confirmamos el valor del domicilio y le pasamos los datos de pago (todavía no se los des: el domicilio cambia según la dirección y lo cotiza el equipo). Todavía no prometas tiempos: esos van en la confirmación. Si devuelve un problema, resuélvelo con el cliente.
5. Así va un pedido (lo ves en sus últimos pedidos): «esperando que lo aceptemos» → para domicilio «confirmando su pago» → «en preparación» → «en camino con el domiciliario». Si pregunta, contéstale según ese estado, con calidez: esperando → ya lo estamos revisando; confirmando su pago → apenas nos llegue lo empezamos a preparar; en preparación → ya lo estamos haciendo; en camino → ya va para allá. Si aparece «rechazado», ya se le explicó por qué: ayúdale con otra opción.
6. Domicilio: se paga por transferencia antes de prepararlo. El valor del domicilio cambia según la dirección: nunca lo inventes; lo cotiza el equipo al aceptar y se lo mandamos con los datos de pago. Puede sumarlo a la transferencia o pagárselo al domiciliario al recibir; si pregunta cuánto paga y en sus últimos pedidos ya aparece el domicilio, dale las dos cuentas. No repitas el número, el total ni los datos de pago si ya están en la conversación. Cuando mande el comprobante, contesta con un solo mensaje corto (p. ej. «Recibido 🙌 apenas lo confirmemos lo preparamos»). Recoger: paga en el café, no hace falta transferir.

No inventes productos, precios, promociones ni tiempos distintos a estos. Quejas, problemas con un pedido o pago, o algo que no puedes resolver: pasar_a_humano.
Eres parte del equipo: habla siempre en primera persona del plural («te confirmamos», «lo estamos preparando»), nunca de «el café» como si fuera otra persona.
Si el cliente queda insatisfecho o algo salió mal y no lo pudimos resolver, discúlpate con sinceridad y dile siempre que vamos a mejorar el servicio (con tus palabras, p. ej. «Tomamos nota para mejorar, gracias por decírnoslo»).
`;
}

/** What changes by the day: the café's data, approved lessons and the menu. */
export function datosDelDia(local: LocalInfo, menu: string, lecciones: Leccion[] = []): string {
  const pago = local.pagos
    ? `Si recoge en el café, paga ahí al recogerlo (efectivo, tarjeta o transferencia); no le mandes datos de pago salvo que pida transferir antes. Si es domicilio, se paga por transferencia antes de prepararlo: después de crear el pedido le compartes los datos tal cual y le dices que apenas confirmemos su pago lo preparamos:\n${local.pagos}`
    : "Si recoge en el café, paga ahí al recogerlo. Si es domicilio, se paga por transferencia antes de prepararlo, pero no tienes los datos: si los piden, pasa a humano.";
  return `# Lo que sabes del local
- Dirección: ${local.direccion ?? "no la tienes; si la piden, pasa a humano"}
- Horario: ${local.horario ?? "no lo tienes; si lo piden, pasa a humano"}
- Entregas cercanas gratis (las llevamos nosotros, paga al recibir): ${local.puntosCercanos?.length ? local.puntosCercanos.join("; ") : "ninguna por ahora"}
- Domicilios: ${local.domicilios ?? "se hacen en Yopal; si hay costo de domicilio lo confirma el equipo. No lo menciones salvo que pregunten"}
- Menú con fotos: cafepayo.com${local.instagram ? `\n- Instagram: @${local.instagram}` : ""}
- Pago: ${pago}
- Puntos Mi Pa'Yo: cada bebida trae en el vaso un código QR; al escanearlo el cliente califica y suma puntos que cambia por premios en cafepayo.com/puntos. Si preguntan por descuentos o promociones, cuéntales de los puntos; no inventes otros descuentos.

${seccionLecciones(lecciones)}# Menú (precios en pesos colombianos)
${menu}`;
}

/** The agent's instructions; the nightly review reads them too (with the menu left out). */
export function instrucciones(local: LocalInfo, menu: string, lecciones: Leccion[] = []): string {
  return `${reglasAgente(local.nombre)}\n\n${datosDelDia(local, menu, lecciones)}`;
}

/** The customer's file as the model reads it (not cached: it changes per customer). */
export function fichaParaAgente(f: FichaCliente | null): string {
  if (!f) return "Ficha del cliente: cliente nuevo, aún no sabemos nada de él.";
  const l = [
    `- Nombre en WhatsApp: ${f.perfil ?? "—"}`,
    `- Cómo saludarlo: ${f.trato ?? "—"}`,
    `- Pedido de siempre: ${f.habitual ?? "—"}`,
    `- Dónde lo recibe: ${f.entrega ?? "—"}`,
    `- Cómo paga: ${f.pago ?? "—"}`,
    `- Preferencias: ${f.preferencias ?? "—"}`,
    `- Elecciones que repite en sus pedidos: ${f.habitos.length ? f.habitos.join("; ") : "—"}`,
    `- Notas: ${f.notas ?? "—"}`,
    `- Últimos pedidos por WhatsApp (número · fecha · estado): ${f.pedidos.length ? f.pedidos.join(" | ") : "ninguno"}`,
  ];
  return `Ficha del cliente:\n${l.join("\n")}${f.mipayo ? `\n\n${f.mipayo}` : ""}`;
}

const client = () => new Anthropic();

/**
 * A message the team sends the customer on its own initiative (their order
 * accepted or turned down from the POS), written by the agent with its usual
 * voice: same rules, day data and client file, the chat so far, and an
 * internal note saying what happened. No tools: it only writes.
 */
export async function redactarAviso(input: Omit<Entrada, "herramientas"> & { nota: string }): Promise<string> {
  const messages = historialComoMensajes(input.turnos);
  messages.push({ role: "user", content: `[Nota interna del equipo, no la escribió el cliente; no la menciones] ${input.nota}` });
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: instrucciones(input.local, menuParaAgente(input.catalog), input.lecciones), cache_control: { type: "ephemeral" } },
      { type: "text", text: `${fichaParaAgente(input.ficha)}\n\nFecha y hora en Yopal ahora: ${input.ahora}.` },
    ],
    messages,
  });
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Rebuild the chat for the model: alternating turns, starting with the customer. */
export function historialComoMensajes(turnos: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const t of turnos) {
    const role = t.autor === "cliente" ? "user" : "assistant";
    const texto = t.autor === "equipo" ? `[Respondió una persona del equipo] ${t.texto}` : t.texto;
    if (!msgs.length && role === "assistant") continue;
    const last = msgs[msgs.length - 1];
    // Agent bubbles stay apart (blank line), the way the model is asked to write them.
    if (last && last.role === role) last.content = `${last.content as string}${role === "assistant" ? "\n\n" : "\n"}${texto}`;
    else msgs.push({ role, content: texto });
  }
  return msgs;
}

type Entrada = {
  catalog: PosCatalog;
  local: LocalInfo;
  turnos: Turno[];
  ahora: string;
  ficha: FichaCliente | null;
  /** Lessons the owner approved from past conversations. */
  lecciones: Leccion[];
  herramientas: Herramientas;
};

/**
 * WHATSAPP_AGENTE_IA=groq runs the same agent (prompt, tools, validation) on
 * Groq's free tier — for testing while the Anthropic balance is empty.
 */
export async function responderWhatsapp(input: Entrada): Promise<Respuesta> {
  return process.env.WHATSAPP_AGENTE_IA === "groq" ? responderConGroq(input) : responderConClaude(input);
}

const RENDIDO = "Ok entendido, ya lo revisamos";

async function responderConClaude(input: Entrada): Promise<Respuesta> {
  const messages = historialComoMensajes(input.turnos);
  if (!messages.length || messages[messages.length - 1].role !== "user") return { texto: "", humano: false, reaccion: null };
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: instrucciones(input.local, menuParaAgente(input.catalog), input.lecciones), cache_control: { type: "ephemeral" } },
    { type: "text", text: `${fichaParaAgente(input.ficha)}\n\nFecha y hora en Yopal ahora: ${input.ahora}.` },
  ];
  let humano = false;
  let reaccion: string | null = null;
  const marcas = { humano: () => (humano = true), reaccion: (e: string) => (reaccion = e) };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await client().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") {
      await input.herramientas.pasarAHumano("El asistente no pudo responder este mensaje.");
      return { texto: RENDIDO, humano: true, reaccion: null };
    }
    const texto = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const usos = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !usos.length) return { texto, humano, reaccion };

    messages.push({ role: "assistant", content: res.content });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const uso of usos) {
      resultados.push({ type: "tool_result", tool_use_id: uso.id, ...(await ejecutar(uso, input.herramientas, marcas)) });
    }
    messages.push({ role: "user", content: resultados });
  }
  await input.herramientas.pasarAHumano("La conversación se alargó sin cerrar el pedido.");
  return { texto: RENDIDO, humano: true, reaccion: null };
}

type GroqMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

const GROQ_TOOLS = TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

/**
 * Groq's free tier allows 8K tokens a minute and counts the reply budget, so
 * the budget stays small; on a 429 the turn waits once (the webhook's
 * `after()` has 120 s) instead of failing.
 */
async function groqConEspera(key: string, messages: GroqMsg[]): Promise<Response> {
  const pedir = () =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        reasoning_effort: "low",
        temperature: 0.4,
        max_completion_tokens: 800,
        tools: GROQ_TOOLS,
        messages,
      }),
    });
  for (let intento = 0; ; intento++) {
    const res = await pedir();
    if (res.status !== 429 || intento >= 2) return res;
    const ra = Number(res.headers.get("retry-after") ?? "20");
    await new Promise((r) => setTimeout(r, Math.min(Number.isFinite(ra) ? ra + 1 : 20, 40) * 1000));
  }
}

async function responderConGroq(input: Entrada): Promise<Respuesta> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Falta GROQ_API_KEY.");
  const historial = historialComoMensajes(input.turnos);
  if (!historial.length || historial[historial.length - 1].role !== "user") return { texto: "", humano: false, reaccion: null };
  const messages: GroqMsg[] = [
    {
      role: "system",
      content: `${instrucciones(input.local, menuParaAgente(input.catalog), input.lecciones)}\n\n${fichaParaAgente(input.ficha)}\n\nFecha y hora en Yopal ahora: ${input.ahora}.`,
    },
    ...historial.map((m) => ({ role: m.role, content: m.content as string }) as GroqMsg),
  ];
  let humano = false;
  let reaccion: string | null = null;
  const marcas = { humano: () => (humano = true), reaccion: (e: string) => (reaccion = e) };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await groqConEspera(key, messages);
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] } }[];
    } | null;
    if (!res.ok || !data?.choices?.[0]?.message) {
      throw new Error(`Groq ${res.status}: ${data?.error?.message ?? "sin respuesta"}`);
    }
    const msg = data.choices[0].message;
    // gpt-oss now and then leaves JSON debris at the end ("…¿algo más?\"\"}").
    const texto = (msg.content ?? "").trim().replace(/["}\]]+$/, "").trim();
    const llamadas = msg.tool_calls ?? [];
    if (!llamadas.length) return { texto, humano, reaccion };

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: llamadas });
    for (const ll of llamadas) {
      let args: unknown = null;
      try {
        args = JSON.parse(ll.function.arguments || "{}");
      } catch {
        /* handled as invalid input below */
      }
      const uso = { type: "tool_use", id: ll.id, name: ll.function.name, input: args } as Anthropic.Beta.BetaToolUseBlock;
      const r = await ejecutar(uso, input.herramientas, marcas);
      messages.push({ role: "tool", tool_call_id: ll.id, content: r.is_error ? `ERROR: ${r.content}` : r.content });
    }
  }
  await input.herramientas.pasarAHumano("La conversación se alargó sin cerrar el pedido.");
  return { texto: RENDIDO, humano: true, reaccion: null };
}

export async function ejecutar(
  uso: Anthropic.Beta.BetaToolUseBlock,
  h: Herramientas,
  marcas: { humano: () => void; reaccion: (emoji: string) => void },
): Promise<{ content: string; is_error?: boolean }> {
  if (uso.name === "crear_pedido") {
    const p = PedidoInput.safeParse(uso.input);
    if (!p.success) return { content: "Datos del pedido incompletos; revisa y vuelve a intentarlo.", is_error: true };
    const r = await h.crearPedido({
      tipo: p.data.tipo,
      nombre: p.data.nombre,
      direccion: p.data.direccion,
      telefono: p.data.telefono,
      nota: p.data.nota,
      lineas: p.data.lineas.map((l) => ({
        productoId: l.producto_id,
        cantidad: l.cantidad,
        opciones: l.opciones.map((o) => ({ grupoId: o.grupo_id, opcion: o.opcion })),
      })),
    });
    return r.ok
      ? { content: `Pedido creado: número ${r.folio}, total de productos ${posMoney(r.total)}.` }
      : { content: r.error, is_error: true };
  }
  if (uso.name === "pasar_a_humano") {
    const p = HumanoInput.safeParse(uso.input);
    await h.pasarAHumano(p.success ? p.data.motivo : "Sin motivo");
    marcas.humano();
    return { content: "Listo, el equipo ya fue avisado." };
  }
  if (uso.name === "recordar_cliente") {
    const p = FichaInput.safeParse(uso.input);
    if (!p.success) return { content: "Datos inválidos.", is_error: true };
    const cambios: CambiosFicha = {};
    for (const [k, v] of Object.entries(p.data)) if (v?.trim()) cambios[k as keyof CambiosFicha] = v.trim().slice(0, 300);
    if (Object.keys(cambios).length) await h.recordarCliente(cambios);
    return { content: "Guardado." };
  }
  if (uso.name === "reaccionar") {
    const p = ReaccionInput.safeParse(uso.input);
    if (!p.success) return { content: "Emoji no permitido.", is_error: true };
    marcas.reaccion(p.data.emoji);
    return { content: "Reacción puesta." };
  }
  return { content: `Herramienta desconocida: ${uso.name}`, is_error: true };
}
