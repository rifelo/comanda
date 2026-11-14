import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lineasDeQr, type ItemCalificado } from "@/lib/calificaciones/calificaciones";
import { esMananaDoble } from "./premios";
import { desdeDe, hora, pesos, porBebida, puestoDe, type Escaneo, type FilaRanking, type Registro, type PeriodoRanking, type Tipo } from "./mi-payo";

// Loaders for «Mi Pa'Yo» (cafepayo.com/puntos). Service role: the page has no
// session — the owner chose that typing an @ opens its history (2026-11-08).
// Only paid QRs count (puntos > 0), so a reprint never doubles a drink.

export interface Cliente { id: string; instagram: string; puntos: number; desde: string }

export async function cargarCliente(orgId: string, instagram: string): Promise<Cliente | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("clientes")
    .select("id, instagram, puntos, created_at")
    .eq("organization_id", orgId)
    .eq("instagram", instagram)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, instagram: data.instagram as string, puntos: Number(data.puntos), desde: data.created_at as string } : null;
}

const FRIAS = new Set(["Frío", "Jugos", "Kombucha", "Envasadas"]);
const tipoDe = (categoria: string | null | undefined): Tipo => (categoria === "Caliente" ? "caliente" : categoria && FRIAS.has(categoria) ? "frio" : "comida");

type Linea = { position: number; name: string; qty: number; unit_price_cop: number; customer_name: string | null; producto_id: string | null };

/** Every paid QR of a customer, with what it paid for (as the order stands now). */
export async function cargarEscaneos(orgId: string, clienteId: string): Promise<Escaneo[]> {
  const db = createSupabaseAdminClient();
  const { data: qrs, error } = await db
    .from("calificaciones")
    .select("id, orden_id, customer_name, linea_position, con_resto, puntos, items, created_at")
    .eq("organization_id", orgId)
    .eq("cliente_id", clienteId)
    .gt("puntos", 0);
  if (error) throw error;
  if (!qrs?.length) return [];
  const ordenIds = [...new Set(qrs.map((q) => q.orden_id as string | null).filter((x): x is string => !!x))];
  const [{ data: ordenes }, { data: copas }, { data: productos }] = await Promise.all([
    ordenIds.length
      ? db.from("ordenes").select("id, created_at, customer_names, orden_items(position, name, qty, unit_price_cop, customer_name, producto_id)").in("id", ordenIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordenIds.length
      ? db.from("calificaciones").select("orden_id, customer_name, linea_position").in("orden_id", ordenIds).not("linea_position", "is", null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db.from("productos").select("id, name, categoria:producto_categorias(label)").eq("organization_id", orgId),
  ]);
  const catDe = (p: Record<string, unknown>) => {
    const c = p.categoria as { label: string } | { label: string }[] | null;
    return (Array.isArray(c) ? c[0]?.label : c?.label) ?? null;
  };
  const tipoPorId = new Map((productos ?? []).map((p) => [p.id as string, tipoDe(catDe(p))]));
  const tipoPorNombre = new Map((productos ?? []).map((p) => [p.name as string, tipoDe(catDe(p))]));
  const ordenPorId = new Map((ordenes ?? []).map((o) => [o.id as string, o]));
  const mismo = (a: unknown, b: unknown) => (((a as string | null) ?? "").trim() || null) === (((b as string | null) ?? "").trim() || null);

  return qrs.map((q) => {
    const puntos = Number(q.puntos);
    const o = q.orden_id ? ordenPorId.get(q.orden_id as string) : undefined;
    if (o) {
      const lineas = ((o.orden_items ?? []) as Linea[]).map((l) => ({ ...l, qty: Number(l.qty), position: Number(l.position), unit_price_cop: Number(l.unit_price_cop), customer_name: l.customer_name ?? null }));
      const people = ((o.customer_names as string[] | null) ?? []).map((p) => p.trim()).filter(Boolean);
      const misCopas = new Set(
        (copas ?? []).filter((c) => c.orden_id === o.id && mismo(c.customer_name, q.customer_name)).map((c) => Number(c.linea_position)),
      );
      const lp = q.linea_position === null || q.linea_position === undefined ? null : Number(q.linea_position);
      const suyas = lineasDeQr(lineas, (q.customer_name as string | null) ?? null, people, { linea: lp, resto: Boolean(q.con_resto) }, misCopas);
      if (suyas.length) {
        return {
          id: q.id as string,
          at: o.created_at as string,
          puntos,
          items: suyas.map((l) => ({ nombre: l.name, qty: l.qty, valor: l.unit_price_cop * l.qty, tipo: (l.producto_id && tipoPorId.get(l.producto_id)) || tipoPorNombre.get(l.name) || "comida" })),
        };
      }
    }
    // The order is gone or no longer has the line: what the label printed, worth its points.
    const snap = ((q.items as ItemCalificado[] | null) ?? []).filter((i) => i?.name);
    return {
      id: q.id as string,
      at: (o?.created_at as string | undefined) ?? (q.created_at as string),
      puntos,
      items: snap.map((i, k) => ({ nombre: i.name, qty: Number(i.qty) || 1, valor: k === 0 ? puntos * 1000 : 0, tipo: tipoPorNombre.get(i.name) ?? "comida" })),
    };
  });
}

/** Points and paid QRs per customer in a period (by order time). */
export async function cargarRanking(orgId: string, periodo: PeriodoRanking, ahora: Date = new Date()): Promise<FilaRanking[]> {
  const db = createSupabaseAdminClient();
  const [{ data: qrs, error }, { data: clientes, error: e2 }] = await Promise.all([
    db.from("calificaciones").select("cliente_id, puntos, created_at, orden:ordenes(created_at)").eq("organization_id", orgId).gt("puntos", 0).not("cliente_id", "is", null),
    db.from("clientes").select("id, instagram").eq("organization_id", orgId),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const desde = desdeDe(periodo, ahora)?.getTime() ?? null;
  const handle = new Map((clientes ?? []).map((c) => [c.id as string, c.instagram as string]));
  const suma = new Map<string, FilaRanking>();
  for (const q of qrs ?? []) {
    const o = q.orden as { created_at: string } | { created_at: string }[] | null;
    const at = (Array.isArray(o) ? o[0]?.created_at : o?.created_at) ?? (q.created_at as string);
    if (desde !== null && new Date(at).getTime() < desde) continue;
    const id = q.cliente_id as string;
    const ig = handle.get(id);
    if (!ig) continue;
    const f = suma.get(id) ?? { clienteId: id, instagram: ig, puntos: 0, bebidas: 0 };
    f.puntos += Number(q.puntos);
    f.bebidas += 1;
    suma.set(id, f);
  }
  return [...suma.values()];
}

/**
 * The «¡Listo!» screen after a cup's QR paid its points: the drink, the new
 * total and the move in this month's ranking. Null when anything is missing
 * (the page then falls back to the plain thank-you).
 */
export async function registroDeEscaneo(codigo: string, instagram: string, total: number, bienvenida = 0): Promise<Registro | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data: row } = await db.from("calificaciones").select("id, organization_id, customer_name, cliente_id, puntos").eq("codigo", codigo).maybeSingle();
    if (!row?.cliente_id || !(Number(row.puntos) > 0)) return null;
    const org = row.organization_id as string;
    const clienteId = row.cliente_id as string;
    const [escaneos, filas] = await Promise.all([cargarEscaneos(org, clienteId), cargarRanking(org, "mes")]);
    const mio = escaneos.find((e) => e.id === row.id);
    if (!mio) return null;
    const bebidas = mio.items.filter((i) => i.tipo !== "comida");
    const linea = bebidas[0] ?? mio.items[0];
    const bebida = linea?.nombre;
    if (!bebida) return null;
    const lista = porBebida(escaneos);
    const puntos = Number(row.puntos);
    const desde = desdeDe("mes")?.getTime() ?? 0;
    const antes = new Date(mio.at).getTime() >= desde ? filas.map((f) => (f.clienteId === clienteId ? { ...f, puntos: f.puntos - puntos } : f)) : filas;
    const nombre = ((row.customer_name as string | null) ?? "").trim().split(/\s+/)[0]?.slice(0, 18) || "";
    const nombreBonito = nombre ? nombre.charAt(0).toLocaleUpperCase("es") + nombre.slice(1) : null;
    return {
      nombre: nombreBonito,
      instagram,
      bebida,
      tipo: linea.tipo,
      valor: pesos(mio.items.reduce((n, i) => n + i.valor, 0)),
      puntos,
      total,
      puestoAntes: puestoDe(antes, clienteId),
      puesto: puestoDe(filas, clienteId),
      veces: lista.find((d) => d.nombre === bebida)?.veces ?? 1,
      esFavorito: lista[0]?.nombre === bebida,
      hora: hora(new Date().toISOString()),
      bienvenida,
      mananaDoble: esMananaDoble(mio.at),
    };
  } catch (e) {
    console.error("[registroDeEscaneo]", e);
    return null;
  }
}
