import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFaltantesAbiertos } from "../faltantes-db";
import { CONSUMO_VENTANA, LOTE_VENTANA, calcularPar, confiabilidadPar, loteHabitual, type Confiabilidad, type ParResultado } from "./par";
import { cantidadLegible, piezaDe } from "../niveles";
import {
  CONFIG_DEFAULT,
  ROTACION_VENTANA,
  diasEntre,
  lineaAplicaSola,
  rotacionDe,
  planificar,
  type AgenteConfig,
  type Candidato,
  type Motivo,
  type Regla,
  type Rotacion,
} from "./planificador";

/**
 * Inventory assistant, I/O side (pure rules in planificador.ts). Works with
 * the service role (tablet, cron) or the RLS client (owner panel).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const COL_REGLA: Record<Regla, string> = {
  vendido_ayer: "regla_vendido_ayer",
  aviso: "regla_aviso",
  antes_pedir: "regla_antes_pedir",
  sin_contar: "regla_sin_contar",
};

/** Bogotá has no DST: a local day starts at 05:00 UTC. */
const inicioLocal = (dia: string) => `${dia}T05:00:00.000Z`;
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaLocal = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

// ── config ──────────────────────────────────────────────────────────────

export async function cargarConfig(db: Db, orgId: string): Promise<AgenteConfig & { ultimoPlan: string | null }> {
  const { data } = await db.from("agente_config").select("*").eq("organization_id", orgId).maybeSingle();
  if (!data) return { ...CONFIG_DEFAULT, ultimoPlan: null };
  return {
    reglas: {
      vendido_ayer: data.regla_vendido_ayer !== false,
      aviso: data.regla_aviso !== false,
      antes_pedir: data.regla_antes_pedir !== false,
      sin_contar: data.regla_sin_contar !== false,
    },
    max: data.max_por_turno == null ? null : Number(data.max_por_turno),
    diasSinContar: Number(data.dias_sin_contar ?? CONFIG_DEFAULT.diasSinContar),
    ultimoPlan: (data.ultimo_plan as string | null) ?? null,
  };
}

export async function guardarRegla(db: Db, orgId: string, regla: Regla, on: boolean): Promise<boolean> {
  const { error } = await db
    .from("agente_config")
    .upsert({ organization_id: orgId, [COL_REGLA[regla]]: on, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) console.error("[agente] guardarRegla", error);
  return !error;
}

// ── planning ────────────────────────────────────────────────────────────

interface IngRow {
  id: string;
  name: string;
  unit: string;
  ubicacion: string | null;
  stock_current: number;
  stock_min: number;
  cost_cop: number;
  proveedor_id: string | null;
  pieza_qty: number | null;
  pack_qty: number | null;
  pack_label: string | null;
  rotacion: Rotacion | null;
}

/**
 * Rotation of every active item from the sales of the ROTACION_VENTANA days
 * ending on `hasta`, saved on the item (rotacion_auto / rotacion_dias /
 * rotacion_ventana) so the owner sees it. Returns id → computed rotation.
 */
export async function calcularRotacion(db: Db, orgId: string, hasta: string, ids: string[]): Promise<Map<string, Rotacion>> {
  const desde = sumarDias(hasta, -(ROTACION_VENTANA - 1));
  const { data } = await db
    .from("ingrediente_movements")
    .select("ingrediente_id, created_at")
    .eq("organization_id", orgId)
    .eq("type", "venta")
    .gte("created_at", inicioLocal(desde))
    .lt("created_at", inicioLocal(sumarDias(hasta, 1)))
    .limit(100000);
  const abiertos = new Set<string>();
  const dias = new Map<string, Set<string>>();
  for (const m of data ?? []) {
    const d = diaLocal(m.created_at as string);
    abiertos.add(d);
    const id = m.ingrediente_id as string;
    if (!dias.has(id)) dias.set(id, new Set());
    dias.get(id)!.add(d);
  }
  const out = new Map<string, Rotacion>();
  const grupos = new Map<string, string[]>(); // "alta|12" → ids, so one update per (rotation, days)
  for (const id of ids) {
    const n = dias.get(id)?.size ?? 0;
    const r = rotacionDe(n, abiertos.size);
    out.set(id, r);
    const k = `${r}|${n}`;
    grupos.set(k, [...(grupos.get(k) ?? []), id]);
  }
  await Promise.all(
    [...grupos.entries()].map(([k, g]) => {
      const [r, n] = k.split("|");
      return db.from("ingredientes").update({ rotacion_auto: r, rotacion_dias: Number(n), rotacion_ventana: abiertos.size }).in("id", g);
    }),
  );
  return out;
}

export interface ParFila extends ParResultado {
  consumoDiario: number;
  lote: number | null;
  loteOrigen: "compras" | "presentacion" | null;
  sinProveedor: boolean;
  stock: number;
  confiabilidad: Confiabilidad;
  faltan: string[];
  diasSinContar: number | null;
}

/**
 * The reorder point (PAR) of every active item, from the last CONSUMO_VENTANA
 * days of sales + mermas (per selling day), the supplier's delivery days, the
 * usual purchase (median of the last LOTE_VENTANA days of purchases, else the
 * pack) and the owner's safety days. Saved in agente_estado_insumo.
 */
export async function calcularParOrg(db: Db, orgId: string, hasta: string): Promise<Map<string, ParFila>> {
  const desde = sumarDias(hasta, -(CONSUMO_VENTANA - 1));
  const [{ data: ings }, { data: provs }, { data: movs }, { data: compras }, ultimo, { data: revisar }] = await Promise.all([
    db.from("ingredientes").select("id, stock_current, pack_qty, proveedor_id, dias_seguridad, rotacion, rotacion_auto").eq("organization_id", orgId).eq("archived", false),
    db.from("proveedores").select("id, entrega_dias").eq("organization_id", orgId),
    db
      .from("ingrediente_movements")
      .select("ingrediente_id, delta, type, created_at")
      .eq("organization_id", orgId)
      .in("type", ["venta", "merma"])
      .gte("created_at", inicioLocal(desde))
      .lt("created_at", inicioLocal(sumarDias(hasta, 1)))
      .limit(200000),
    db
      .from("ingrediente_movements")
      .select("ingrediente_id, delta")
      .eq("organization_id", orgId)
      .eq("type", "import")
      .gt("delta", 0)
      .gte("created_at", inicioLocal(sumarDias(hasta, -LOTE_VENTANA)))
      .limit(20000),
    ultimoConteo(db, orgId),
    db
      .from("inventario_conteo_items")
      .select("ingrediente_id, conteo:inventario_conteos!inner(organization_id)")
      .eq("revision", "revisar")
      .eq("conteo.organization_id", orgId),
  ]);
  const enRevision = new Set((revisar ?? []).map((r) => r.ingrediente_id as string));
  const entrega = new Map((provs ?? []).map((p) => [p.id as string, Number(p.entrega_dias ?? 1)]));
  const dias = new Set<string>();
  const usado = new Map<string, number>();
  for (const m of movs ?? []) {
    if (m.type === "venta") dias.add(diaLocal(m.created_at as string));
    const id = m.ingrediente_id as string;
    usado.set(id, (usado.get(id) ?? 0) - Number(m.delta));
  }
  const abiertos = Math.max(1, dias.size);
  const comprasDe = new Map<string, number[]>();
  for (const c of compras ?? []) {
    const id = c.ingrediente_id as string;
    comprasDe.set(id, [...(comprasDe.get(id) ?? []), Number(c.delta)]);
  }
  const out = new Map<string, ParFila>();
  const rows = [];
  const now = new Date().toISOString();
  for (const i of ings ?? []) {
    const id = i.id as string;
    const consumoDiario = Math.max(0, Math.round(((usado.get(id) ?? 0) / abiertos) * 1000) / 1000);
    const habitual = loteHabitual(comprasDe.get(id) ?? []);
    const pack = i.pack_qty != null ? Number(i.pack_qty) : null;
    const lote = habitual ?? (pack && pack > 1 ? pack : null);
    const loteOrigen = habitual != null ? "compras" : lote != null ? "presentacion" : null;
    const sinProveedor = !i.proveedor_id;
    const stock = Number(i.stock_current);
    const r = calcularPar({
      consumoDiario,
      entregaDias: i.proveedor_id ? entrega.get(i.proveedor_id as string) ?? 1 : null,
      diasSeguridad: i.dias_seguridad != null ? Number(i.dias_seguridad) : null,
      lote,
      pack,
      stock,
    });
    const contado = ultimo.get(id);
    const diasSinContar = contado ? diasEntre(contado, hasta) : null;
    const conf = confiabilidadPar({
      consumoDiario,
      diasConVenta: dias.size,
      diasSinContar,
      stock,
      sinProveedor,
      bajaRotacion: (i.rotacion ?? i.rotacion_auto ?? "baja") === "baja",
      revisionPendiente: enRevision.has(id),
    });
    out.set(id, { ...r, consumoDiario, lote, loteOrigen, sinProveedor, stock, confiabilidad: conf.nivel, faltan: conf.faltan, diasSinContar });
    rows.push({
      ingrediente_id: id,
      organization_id: orgId,
      consumo_diario: consumoDiario,
      dias_con_venta: dias.size,
      entrega_dias: r.entregaDias,
      sin_proveedor: sinProveedor,
      seguridad_dias: r.seguridadDias,
      punto_reorden: r.puntoReorden,
      lote,
      lote_origen: loteOrigen,
      masivo: r.masivo,
      stock,
      cobertura_dias: r.coberturaDias,
      pedir: r.pedir,
      cantidad_sugerida: r.cantidadSugerida,
      confiabilidad: conf.nivel,
      confiabilidad_faltan: conf.faltan,
      dias_sin_contar: diasSinContar,
      updated_at: now,
    });
  }
  if (rows.length) {
    const { error } = await db.from("agente_estado_insumo").upsert(rows, { onConflict: "ingrediente_id" });
    if (error) console.error("[agente] calcularParOrg upsert", error);
  }
  return out;
}

export interface ParPanelFila {
  ingredienteId: string;
  name: string;
  unit: string;
  pieza: number | null;
  packLabel: string | null;
  ubicacion: string | null;
  proveedor: string | null;
  consumoDiario: number;
  entregaDias: number;
  sinProveedor: boolean;
  seguridadDias: number;
  seguridadManual: boolean;
  puntoReorden: number;
  lote: number | null;
  loteOrigen: string | null;
  masivo: boolean;
  stock: number;
  coberturaDias: number | null;
  pedir: boolean;
  cantidadSugerida: number | null;
  confiabilidad: Confiabilidad;
  faltan: string[];
  diasSinContar: number | null;
  updatedAt: string;
}

/** What the owner's «Punto de reorden» page shows. */
export async function parPanel(db: Db, orgId: string): Promise<ParPanelFila[]> {
  const { data, error } = await db
    .from("agente_estado_insumo")
    .select("*, ing:ingredientes!inner(name, unit, pieza_qty, pack_qty, pack_label, ubicacion, archived, dias_seguridad, stock_current, prov:proveedores(name))")
    .eq("organization_id", orgId);
  if (error) {
    console.error("[agente] parPanel", error);
    return [];
  }
  return (data ?? [])
    .map((r) => {
      const i = r.ing as unknown as { name: string; unit: string; pieza_qty: number | null; pack_qty: number | null; pack_label: string | null; ubicacion: string | null; archived: boolean; dias_seguridad: number | null; stock_current: number; prov: { name: string } | null };
      return {
        archived: i.archived,
        ingredienteId: r.ingrediente_id as string,
        name: i.name,
        unit: i.unit,
        pieza: i.pieza_qty != null && Number(i.pieza_qty) > 1 ? Number(i.pieza_qty) : null,
        packLabel: i.pack_label,
        ubicacion: i.ubicacion,
        proveedor: i.prov?.name ?? null,
        consumoDiario: Number(r.consumo_diario),
        entregaDias: Number(r.entrega_dias),
        sinProveedor: r.sin_proveedor === true,
        seguridadDias: Number(r.seguridad_dias),
        seguridadManual: i.dias_seguridad != null,
        puntoReorden: Number(r.punto_reorden),
        lote: r.lote != null ? Number(r.lote) : null,
        loteOrigen: (r.lote_origen as string | null) ?? null,
        masivo: r.masivo === true,
        stock: Number(i.stock_current),
        coberturaDias: r.cobertura_dias != null ? Number(r.cobertura_dias) : null,
        pedir: r.pedir === true,
        cantidadSugerida: r.cantidad_sugerida != null ? Number(r.cantidad_sugerida) : null,
        confiabilidad: ((r.confiabilidad as Confiabilidad | null) ?? (Number(r.consumo_diario) > 0 ? "baja" : "sin_datos")) as Confiabilidad,
        faltan: (r.confiabilidad_faltan as string[] | null) ?? [],
        diasSinContar: r.dias_sin_contar != null ? Number(r.dias_sin_contar) : null,
        updatedAt: r.updated_at as string,
      };
    })
    .filter((f) => !f.archived)
    .map(({ archived: _a, ...f }) => f); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Sales of one local day per item: units consumed and distinct orders. */
async function ventasDelDia(db: Db, orgId: string, dia: string): Promise<Map<string, { qty: number; pedidos: Set<string> }>> {
  const out = new Map<string, { qty: number; pedidos: Set<string> }>();
  const { data } = await db
    .from("ingrediente_movements")
    .select("ingrediente_id, delta, orden_id")
    .eq("organization_id", orgId)
    .eq("type", "venta")
    .gte("created_at", inicioLocal(dia))
    .lt("created_at", inicioLocal(sumarDias(dia, 1)))
    .limit(20000);
  for (const m of data ?? []) {
    const id = m.ingrediente_id as string;
    const e = out.get(id) ?? { qty: 0, pedidos: new Set<string>() };
    e.qty += -Number(m.delta);
    if (m.orden_id) e.pedidos.add(m.orden_id as string);
    out.set(id, e);
  }
  return out;
}

/** Last day with sales, looking back from `desde` up to a week. */
async function diaConVentas(db: Db, orgId: string, desde: string): Promise<string | null> {
  for (let i = 0; i < 7; i++) {
    const dia = sumarDias(desde, -i);
    const { count } = await db
      .from("ingrediente_movements")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("type", "venta")
      .gte("created_at", inicioLocal(dia))
      .lt("created_at", inicioLocal(sumarDias(dia, 1)));
    if ((count ?? 0) > 0) return dia;
  }
  return null;
}

/** Local date of the last non-rejected count line per item. */
async function ultimoConteo(db: Db, orgId: string): Promise<Map<string, string>> {
  const { data } = await db
    .from("inventario_conteo_items")
    .select("ingrediente_id, revision, conteo:inventario_conteos!inner(submitted_at, status, organization_id)")
    .eq("conteo.organization_id", orgId)
    .limit(20000);
  const out = new Map<string, string>();
  for (const r of data ?? []) {
    const c = r.conteo as unknown as { submitted_at: string; status: string } | null;
    if (!c || c.status === "rechazado" || r.revision === "rechazado") continue;
    const d = diaLocal(c.submitted_at);
    const id = r.ingrediente_id as string;
    if (!out.has(id) || (out.get(id) as string) < d) out.set(id, d);
  }
  return out;
}

export interface VencidaSinContar {
  ingredienteId: string;
  /** Day the first of these expired verifications was asked for. */
  desde: string;
  /** How many verifications expired since the last count. */
  veces: number;
  motivo: Motivo;
}

/**
 * Items whose verification expired and that nobody has counted since (any
 * count line after the expired task's day clears it). Looked at over the
 * last 60 days.
 */
export async function vencidasSinContar(db: Db, orgId: string, hoy: string, ultimo?: Map<string, string>): Promise<Map<string, VencidaSinContar>> {
  const [{ data }, ult] = await Promise.all([
    db
      .from("agente_tareas")
      .select("ingrediente_id, fecha, motivo")
      .eq("organization_id", orgId)
      .eq("estado", "vencida")
      .gte("fecha", sumarDias(hoy, -60))
      .order("fecha", { ascending: true }),
    ultimo ? Promise.resolve(ultimo) : ultimoConteo(db, orgId),
  ]);
  const out = new Map<string, VencidaSinContar>();
  for (const t of data ?? []) {
    const id = t.ingrediente_id as string;
    const fecha = t.fecha as string;
    const contado = ult.get(id);
    if (contado && contado >= fecha) continue; // counted on or after the day it was asked
    const prev = out.get(id);
    if (prev) prev.veces += 1;
    else out.set(id, { ingredienteId: id, desde: fecha, veces: 1, motivo: t.motivo as Motivo });
  }
  return out;
}

export interface PlanResultado {
  fecha: string;
  diaVentas: string | null;
  creadas: number;
  abiertas: number;
  saltado?: boolean;
}

/**
 * Plan the verification tasks for `fecha` (the sede's local date). Runs once
 * per org and day (nightly cron, or the first tablet that opens Inventario);
 * `forzar` re-runs it. Open tasks older than 3 days expire; the rest come back
 * and count toward the turno's budget.
 */
export async function planificarDia(
  db: Db,
  orgId: string,
  opts: { fecha: string; restaurantId: string | null; forzar?: boolean; diaVentas?: string },
): Promise<PlanResultado> {
  const config = await cargarConfig(db, orgId);
  if (!opts.forzar && config.ultimoPlan === opts.fecha) return { fecha: opts.fecha, diaVentas: null, creadas: 0, abiertas: 0, saltado: true };

  // Claim the day first, so two tablets opening at once don't both plan.
  await db
    .from("agente_config")
    .upsert({ organization_id: orgId, ultimo_plan: opts.fecha, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

  await db
    .from("agente_tareas")
    .update({ estado: "vencida" })
    .eq("organization_id", orgId)
    .eq("estado", "pendiente")
    .lt("fecha", sumarDias(opts.fecha, -3));

  const diaVentas = opts.diaVentas ?? (await diaConVentas(db, orgId, sumarDias(opts.fecha, -1)));
  const [{ data: ings }, ventas, ultimo, avisos, { data: abiertasRows }] = await Promise.all([
    db
      .from("ingredientes")
      .select("id, name, unit, ubicacion, stock_current, stock_min, cost_cop, proveedor_id, pieza_qty, pack_qty, pack_label, rotacion")
      .eq("organization_id", orgId)
      .eq("archived", false),
    diaVentas ? ventasDelDia(db, orgId, diaVentas) : Promise.resolve(new Map<string, { qty: number; pedidos: Set<string> }>()),
    ultimoConteo(db, orgId),
    listFaltantesAbiertos(db, orgId),
    db.from("agente_tareas").select("ingrediente_id").eq("organization_id", orgId).eq("estado", "pendiente"),
  ]);
  const abiertas = new Set((abiertasRows ?? []).map((r) => r.ingrediente_id as string));
  const vencidas = await vencidasSinContar(db, orgId, opts.fecha, ultimo);
  const avisoDe = new Map<string, { estado: "bajo" | "agotado"; por: string | null; dias: number }>();
  for (const f of avisos) {
    if (f.estado !== "bajo" && f.estado !== "agotado") continue;
    // newest first: keep the latest mark per item
    if (!avisoDe.has(f.ingrediente_id)) avisoDe.set(f.ingrediente_id, { estado: f.estado, por: f.reported_by_name?.split(" ")[0] ?? null, dias: diasEntre(diaLocal(f.reported_at), opts.fecha) });
  }
  const rows = (ings ?? []) as unknown as IngRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hastaVentas = diaVentas ?? sumarDias(opts.fecha, -1);
  const [rotAuto, par] = await Promise.all([calcularRotacion(db, orgId, hastaVentas, rows.map((r) => r.id)), calcularParOrg(db, orgId, hastaVentas)]);
  const candidatos: Candidato[] = rows.map((i) => {
    const v = ventas.get(i.id);
    const u = ultimo.get(i.id);
    return {
      ingredienteId: i.id,
      name: i.name,
      ubicacion: i.ubicacion,
      stock: Number(i.stock_current),
      stockMin: Number(i.stock_min ?? 0),
      costo: Number(i.cost_cop ?? 0),
      vendido: v ? Math.round(v.qty * 1000) / 1000 : 0,
      pedidos: v ? v.pedidos.size : 0,
      diasSinContar: u ? diasEntre(u, opts.fecha) : null,
      aviso: avisoDe.get(i.id) ?? null,
      rotacion: i.rotacion ?? rotAuto.get(i.id) ?? "baja",
      masivo: par.get(i.id)?.masivo ?? false,
      puntoPedido: par.get(i.id)?.consumoDiario ? par.get(i.id)!.puntoReorden : null,
      conProveedor: !!i.proveedor_id,
      abierta: abiertas.has(i.id),
      vencida: vencidas.has(i.id) ? { desde: vencidas.get(i.id)!.desde, veces: vencidas.get(i.id)!.veces } : null,
    };
  });
  const plan = planificar(candidatos, config, abiertas.size, {
    cantidad: (c, qty) => {
      const i = byId.get(c.ingredienteId);
      return i ? cantidadLegible(qty, i) : String(qty);
    },
  });
  if (plan.length) {
    const { error } = await db.from("agente_tareas").insert(
      plan.map((t) => ({
        organization_id: orgId,
        restaurant_id: opts.restaurantId,
        ingrediente_id: t.ingredienteId,
        motivo: t.motivo,
        detalle: t.detalle,
        prioridad: t.prioridad,
        fecha: opts.fecha,
      })),
    );
    if (error) {
      console.error("[agente] insert tareas", error);
      // Give the day back so the next tablet (or the cron) tries again.
      await db.from("agente_config").update({ ultimo_plan: config.ultimoPlan }).eq("organization_id", orgId);
    }
  }
  return { fecha: opts.fecha, diaVentas, creadas: plan.length, abiertas: abiertas.size };
}

/** The owner asks for an item to be counted (or a second verification). */
export async function pedirConteo(
  db: Db,
  orgId: string,
  input: { ingredienteId: string; fecha: string; restaurantId: string | null; motivo: Extract<Motivo, "manual" | "segunda">; detalle: string | null; creadaPor: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: open } = await db
    .from("agente_tareas")
    .select("id")
    .eq("organization_id", orgId)
    .eq("ingrediente_id", input.ingredienteId)
    .eq("estado", "pendiente")
    .maybeSingle();
  if (open) return { ok: false, error: "Ese insumo ya está en la lista para contar." };
  const { error } = await db.from("agente_tareas").insert({
    organization_id: orgId,
    restaurant_id: input.restaurantId,
    ingrediente_id: input.ingredienteId,
    motivo: input.motivo,
    detalle: input.detalle,
    prioridad: input.motivo === "segunda" ? 900 : 800,
    fecha: input.fecha,
    creada_por: input.creadaPor,
  });
  if (error) {
    console.error("[agente] pedirConteo", error);
    return { ok: false, error: "No se pudo programar el conteo." };
  }
  return { ok: true };
}

// ── tablet ──────────────────────────────────────────────────────────────

export interface TareaTablet {
  id: string;
  ingredienteId: string;
  name: string;
  unit: string;
  ubicacion: string | null;
  /** Stock units in one countable piece; null = counted in the unit. */
  pieza: number | null;
  packLabel: string | null;
  motivo: Motivo;
  fecha: string;
}

/** Open tasks for the team, up to `hoy`, in walking order (zone, then priority). */
export async function tareasPendientes(db: Db, orgId: string, hoy: string): Promise<TareaTablet[]> {
  const { data, error } = await db
    .from("agente_tareas")
    .select("id, ingrediente_id, motivo, fecha, prioridad, ing:ingredientes!inner(name, unit, ubicacion, pieza_qty, pack_qty, pack_label, archived)")
    .eq("organization_id", orgId)
    .eq("estado", "pendiente")
    .lte("fecha", hoy)
    .order("prioridad", { ascending: false });
  if (error) {
    console.error("[agente] tareasPendientes", error);
    return [];
  }
  return (data ?? [])
    .map((r) => {
      const i = r.ing as unknown as { name: string; unit: string; ubicacion: string | null; pieza_qty: number | null; pack_qty: number | null; pack_label: string | null; archived: boolean };
      return {
        id: r.id as string,
        ingredienteId: r.ingrediente_id as string,
        name: i.name,
        unit: i.unit,
        ubicacion: i.ubicacion,
        pieza: piezaDe({ unit: i.unit, pack_qty: i.pack_qty, pieza_qty: i.pieza_qty }),
        packLabel: i.pack_label,
        motivo: r.motivo as Motivo,
        fecha: r.fecha as string,
        archived: i.archived,
      };
    })
    .filter((t) => !t.archived)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ archived, ...t }) => t)
    .sort((a, b) => (a.ubicacion ?? "~").localeCompare(b.ubicacion ?? "~", "es"));
}

export type RespuestaResultado =
  | { ok: true; estado: "aplicado" | "revisar" | "no_encontrado" }
  /** `yaHecha`: someone else already answered it (or it was cancelled): just move on. */
  | { ok: false; error: string; yaHecha?: boolean };

/**
 * The barista's answer to one task. A counted quantity becomes a line of the
 * day's assistant count (one per sede and day): the stock it replaces is
 * snapshotted here, an ordinary difference applies right away as an 'ajuste'
 * movement, an odd one waits for a second verification. «No lo encuentro»
 * closes the task without a line.
 */
export async function responderTarea(
  db: Db,
  orgId: string,
  input: { tareaId: string; counted: number | null; actorId: string | null; restaurantId: string },
): Promise<RespuestaResultado> {
  const { data: t } = await db
    .from("agente_tareas")
    .select("id, ingrediente_id, estado, fecha, motivo")
    .eq("organization_id", orgId)
    .eq("id", input.tareaId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Esa verificación ya no existe.", yaHecha: true };
  if (t.estado !== "pendiente") return { ok: false, error: "Esa verificación ya se hizo.", yaHecha: true };
  const now = new Date().toISOString();

  if (input.counted === null) {
    const { data: done } = await db
      .from("agente_tareas")
      .update({ estado: "no_encontrado", hecha_por: input.actorId, hecha_at: now })
      .eq("id", t.id)
      .eq("estado", "pendiente")
      .select("id");
    if (!done?.length) return { ok: false, error: "Esa verificación ya se hizo.", yaHecha: true };
    return { ok: true, estado: "no_encontrado" };
  }

  const { data: ing } = await db
    .from("ingredientes")
    .select("id, unit, stock_current, cost_cop, pieza_qty, pack_qty")
    .eq("organization_id", orgId)
    .eq("id", t.ingrediente_id)
    .maybeSingle();
  if (!ing) return { ok: false, error: "Ese insumo ya no existe." };

  // Claim the task before writing anything, so a double tap can't count twice.
  const { data: claimed } = await db
    .from("agente_tareas")
    .update({ estado: "hecha", hecha_por: input.actorId, hecha_at: now })
    .eq("id", t.id)
    .eq("estado", "pendiente")
    .select("id");
  if (!claimed?.length) return { ok: false, error: "Esa verificación ya se hizo.", yaHecha: true };

  const conteoId = await conteoDelLote(db, orgId, { fecha: t.fecha as string, restaurantId: input.restaurantId, ingredienteId: t.ingrediente_id as string, actorId: input.actorId });
  if (!conteoId) {
    await db.from("agente_tareas").update({ estado: "pendiente", hecha_por: null, hecha_at: null }).eq("id", t.id);
    return { ok: false, error: "No se pudo guardar el conteo." };
  }

  const expected = Number(ing.stock_current);
  const counted = Math.round(input.counted * 1000) / 1000;
  const costo = Number(ing.cost_cop ?? 0);
  const sola = lineaAplicaSola({ expected, counted, pieza: piezaDe({ unit: ing.unit as string, pack_qty: ing.pack_qty as number | null, pieza_qty: ing.pieza_qty as number | null }) });
  const { error: iErr } = await db.from("inventario_conteo_items").insert({
    conteo_id: conteoId,
    ingrediente_id: t.ingrediente_id,
    expected,
    counted,
    unit_cost_cop: costo,
    tarea_id: t.id,
    revision: sola ? "aplicado" : "revisar",
  });
  if (iErr) {
    console.error("[agente] insert line", iErr);
    await db.from("agente_tareas").update({ estado: "pendiente", hecha_por: null, hecha_at: null }).eq("id", t.id);
    return { ok: false, error: "No se pudo guardar el conteo." };
  }
  const diff = Math.round((counted - expected) * 1000) / 1000;
  if (sola && diff !== 0) {
    const { error: mErr } = await db.from("ingrediente_movements").insert({
      organization_id: orgId,
      ingrediente_id: t.ingrediente_id,
      type: "ajuste",
      delta: diff,
      unit_cost_cop: costo,
      note: `Verificación de inventario ${t.fecha}`,
      created_by: input.actorId,
    });
    if (mErr) {
      console.error("[agente] ajuste", mErr);
      await db.from("inventario_conteo_items").update({ revision: "revisar" }).eq("conteo_id", conteoId).eq("ingrediente_id", t.ingrediente_id);
    }
  }
  await db.from("agente_tareas").update({ conteo_id: conteoId }).eq("id", t.id);
  await recalcularEstado(db, conteoId, null);
  return { ok: true, estado: sola ? "aplicado" : "revisar" };
}

/** The assistant count a task's line goes into: one per sede and day, a new one if the item is already in it. */
async function conteoDelLote(db: Db, orgId: string, a: { fecha: string; restaurantId: string; ingredienteId: string; actorId: string | null }): Promise<string | null> {
  const { data: hermanas } = await db
    .from("agente_tareas")
    .select("conteo_id")
    .eq("organization_id", orgId)
    .eq("fecha", a.fecha)
    .not("conteo_id", "is", null);
  const ids = [...new Set((hermanas ?? []).map((h) => h.conteo_id as string))];
  const { data: deLaSede } = ids.length
    ? await db.from("inventario_conteos").select("id").in("id", ids).eq("restaurant_id", a.restaurantId)
    : { data: [] };
  for (const id of (deLaSede ?? []).map((c) => c.id as string)) {
    const { data: ya } = await db.from("inventario_conteo_items").select("id").eq("conteo_id", id).eq("ingrediente_id", a.ingredienteId).maybeSingle();
    if (!ya) return id;
  }
  const { data: c, error } = await db
    .from("inventario_conteos")
    .insert({ organization_id: orgId, restaurant_id: a.restaurantId, kind: "agente", counted_by: a.actorId, status: "aprobado", auto: true, reviewed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !c) {
    console.error("[agente] new conteo", error);
    return null;
  }
  return c.id as string;
}

/** A count is pending while any line waits for review; approved once none does. */
async function recalcularEstado(db: Db, conteoId: string, reviewerId: string | null): Promise<void> {
  const { data: lines } = await db.from("inventario_conteo_items").select("revision").eq("conteo_id", conteoId);
  const pendiente = (lines ?? []).some((l) => l.revision === "revisar");
  await db
    .from("inventario_conteos")
    .update(pendiente ? { status: "pendiente", reviewed_at: null, reviewed_by: null, auto: false } : { status: "aprobado", reviewed_at: new Date().toISOString(), reviewed_by: reviewerId, auto: reviewerId === null })
    .eq("id", conteoId);
}

/** Results of the tasks of one day, for the tablet's «Listo» screen. */
export interface ResultadoTablet {
  name: string;
  unit: string;
  pieza: number | null;
  packLabel: string | null;
  estado: "aplicado" | "revisar" | "no_encontrado";
  counted: number | null;
  expected: number | null;
}
export async function resultadosDelDia(db: Db, orgId: string, fecha: string, opts: { hechaPor?: string | null } = {}): Promise<ResultadoTablet[]> {
  let qy = db
    .from("agente_tareas")
    .select("id, estado, ingrediente_id, conteo_id, hecha_at, ing:ingredientes!inner(name, unit, pieza_qty, pack_qty, pack_label)")
    .eq("organization_id", orgId)
    .gte("hecha_at", inicioLocal(fecha))
    .lt("hecha_at", inicioLocal(sumarDias(fecha, 1)))
    .in("estado", ["hecha", "no_encontrado"]);
  if (opts.hechaPor) qy = qy.eq("hecha_por", opts.hechaPor);
  const { data } = await qy.order("hecha_at", { ascending: true });
  const tareas = data ?? [];
  const ids = tareas.map((t) => t.id as string);
  const { data: lines } = ids.length ? await db.from("inventario_conteo_items").select("tarea_id, expected, counted, revision").in("tarea_id", ids) : { data: [] };
  const lineDe = new Map((lines ?? []).map((l) => [l.tarea_id as string, l]));
  return tareas.map((t) => {
    const i = t.ing as unknown as { name: string; unit: string; pieza_qty: number | null; pack_qty: number | null; pack_label: string | null };
    const l = lineDe.get(t.id as string);
    return {
      name: i.name,
      unit: i.unit,
      pieza: piezaDe({ unit: i.unit, pack_qty: i.pack_qty, pieza_qty: i.pieza_qty }),
      packLabel: i.pack_label,
      estado: t.estado === "no_encontrado" ? "no_encontrado" : l?.revision === "revisar" ? "revisar" : "aplicado",
      counted: l ? Number(l.counted) : null,
      expected: l ? Number(l.expected) : null,
    };
  });
}

// ── owner review ────────────────────────────────────────────────────────

export type Decision = "aceptar" | "rechazar" | "otro_conteo";

/**
 * The owner's decision on a line waiting for review: accept (its difference
 * goes into the stock), reject (nothing changes), or ask for another count
 * (rejected + a «segunda» task for today).
 */
export async function revisarLinea(
  db: Db,
  orgId: string,
  input: { lineaId: string; decision: Decision; reviewerId: string; hoy: string; nota?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: l } = await db
    .from("inventario_conteo_items")
    .select("id, conteo_id, ingrediente_id, expected, counted, unit_cost_cop, revision, conteo:inventario_conteos!inner(organization_id, restaurant_id, submitted_at)")
    .eq("id", input.lineaId)
    .maybeSingle();
  const c = l?.conteo as unknown as { organization_id: string; restaurant_id: string | null; submitted_at: string } | undefined;
  if (!l || !c || c.organization_id !== orgId) return { ok: false, error: "Esa línea ya no existe." };
  if (l.revision !== "revisar") return { ok: false, error: "Esa línea ya fue revisada." };
  const nueva = input.decision === "aceptar" ? "aplicado" : "rechazado";
  const { data: flipped } = await db
    .from("inventario_conteo_items")
    .update({ revision: nueva, note: input.nota || null })
    .eq("id", l.id)
    .eq("revision", "revisar")
    .select("id");
  if (!flipped?.length) return { ok: false, error: "Esa línea ya fue revisada." };

  if (input.decision === "aceptar") {
    const diff = Math.round((Number(l.counted) - Number(l.expected)) * 1000) / 1000;
    if (diff !== 0) {
      const { error } = await db.from("ingrediente_movements").insert({
        organization_id: orgId,
        ingrediente_id: l.ingrediente_id,
        type: "ajuste",
        delta: diff,
        unit_cost_cop: Number(l.unit_cost_cop ?? 0),
        note: `Verificación de inventario ${diaLocal(c.submitted_at)} · aprobada${input.nota ? ` · ${input.nota}` : ""}`,
        created_by: input.reviewerId,
      });
      if (error) {
        console.error("[agente] aceptar ajuste", error);
        await db.from("inventario_conteo_items").update({ revision: "revisar" }).eq("id", l.id);
        return { ok: false, error: "No se pudo aplicar el ajuste." };
      }
    }
  }
  if (input.decision === "otro_conteo") {
    await pedirConteo(db, orgId, {
      ingredienteId: l.ingrediente_id as string,
      fecha: input.hoy,
      restaurantId: c.restaurant_id,
      motivo: "segunda",
      detalle: "El conteo anterior no cuadró",
      creadaPor: input.reviewerId,
    });
  }
  await recalcularEstado(db, l.conteo_id as string, input.reviewerId);
  return { ok: true };
}

// ── owner panel ─────────────────────────────────────────────────────────

export interface LineaPanel {
  id: string;
  ingredienteId: string;
  name: string;
  unit: string;
  ubicacion: string | null;
  pieza: number | null;
  packLabel: string | null;
  expected: number;
  counted: number;
  unitCost: number;
  revision: "aplicado" | "revisar" | "rechazado" | null;
  note: string | null;
  motivo: Motivo | null;
  detalle: string | null;
}

export interface ConteoPanel {
  id: string;
  kind: "diario" | "completo" | "agente";
  status: "pendiente" | "aprobado" | "rechazado";
  auto: boolean;
  submittedAt: string;
  countedBy: string | null;
  reviewedAt: string | null;
  lineas: LineaPanel[];
  noEncontrados: { name: string; motivo: Motivo }[];
}

export interface TareaPanel {
  id: string;
  ingredienteId: string;
  name: string;
  motivo: Motivo;
  detalle: string | null;
  fecha: string;
  estado: string;
}

const LINE_SELECT =
  "id, ingrediente_id, expected, counted, unit_cost_cop, revision, note, tarea_id, ing:ingredientes(name, unit, ubicacion, pieza_qty, pack_qty, pack_label)";

function mapLinea(r: Record<string, unknown>, tareas: Map<string, { motivo: Motivo; detalle: string | null }>): LineaPanel {
  const i = (r.ing as { name: string; unit: string; ubicacion: string | null; pieza_qty: number | null; pack_qty: number | null; pack_label: string | null } | null) ?? { name: "—", unit: "", ubicacion: null, pieza_qty: null, pack_qty: null, pack_label: null };
  const t = r.tarea_id ? tareas.get(r.tarea_id as string) : undefined;
  return {
    id: r.id as string,
    ingredienteId: r.ingrediente_id as string,
    name: i.name,
    unit: i.unit,
    ubicacion: i.ubicacion,
    pieza: piezaDe({ unit: i.unit, pack_qty: i.pack_qty, pieza_qty: i.pieza_qty }),
    packLabel: i.pack_label,
    expected: Number(r.expected),
    counted: Number(r.counted),
    unitCost: Number(r.unit_cost_cop ?? 0),
    revision: (r.revision as LineaPanel["revision"]) ?? null,
    note: (r.note as string | null) ?? null,
    motivo: t?.motivo ?? null,
    detalle: t?.detalle ?? null,
  };
}

/** Counts since `desde` (ISO), newest first, with their lines and the tasks behind them. */
export async function historialConteos(db: Db, orgId: string, desde: string): Promise<ConteoPanel[]> {
  const { data, error } = await db
    .from("inventario_conteos")
    .select(`id, kind, status, auto, submitted_at, reviewed_at, counter:profiles!inventario_conteos_counted_by_fkey(full_name), inventario_conteo_items(${LINE_SELECT})`)
    .eq("organization_id", orgId)
    .gte("submitted_at", desde)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[agente] historialConteos", error);
    return [];
  }
  const ids = (data ?? []).map((c) => c.id as string);
  const { data: ts } = ids.length
    ? await db.from("agente_tareas").select("id, conteo_id, motivo, detalle").in("conteo_id", ids)
    : { data: [] };
  const tareas = new Map((ts ?? []).map((t) => [t.id as string, { motivo: t.motivo as Motivo, detalle: (t.detalle as string | null) ?? null }]));
  return (data ?? []).map((c) => {
    const counter = c.counter as unknown as { full_name: string | null } | null;
    return {
      id: c.id as string,
      kind: c.kind as ConteoPanel["kind"],
      status: c.status as ConteoPanel["status"],
      auto: c.auto === true,
      submittedAt: c.submitted_at as string,
      countedBy: counter?.full_name ?? null,
      reviewedAt: (c.reviewed_at as string | null) ?? null,
      lineas: ((c.inventario_conteo_items ?? []) as Array<Record<string, unknown>>).map((r) => mapLinea(r, tareas)),
      noEncontrados: [],
    };
  });
}

/** One count with everything the detail page shows. */
export async function conteoPanel(db: Db, orgId: string, id: string): Promise<ConteoPanel | null> {
  const { data: c } = await db
    .from("inventario_conteos")
    .select(`id, kind, status, auto, submitted_at, reviewed_at, restaurant_id, counter:profiles!inventario_conteos_counted_by_fkey(full_name), inventario_conteo_items(${LINE_SELECT})`)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  const { data: ts } = await db.from("agente_tareas").select("id, motivo, detalle, estado, fecha, ing:ingredientes(name)").eq("conteo_id", id);
  const tareas = new Map((ts ?? []).map((t) => [t.id as string, { motivo: t.motivo as Motivo, detalle: (t.detalle as string | null) ?? null }]));
  // «No lo encuentro» answers of the same day's batch have no line; show them too.
  const fechas = [...new Set((ts ?? []).map((t) => t.fecha as string))];
  let neQ = db.from("agente_tareas").select("motivo, ing:ingredientes(name)").eq("organization_id", orgId).eq("estado", "no_encontrado").in("fecha", fechas);
  if (c.restaurant_id) neQ = neQ.eq("restaurant_id", c.restaurant_id as string);
  const { data: ne } = fechas.length ? await neQ : { data: [] };
  const counter = c.counter as unknown as { full_name: string | null } | null;
  return {
    id: c.id as string,
    kind: c.kind as ConteoPanel["kind"],
    status: c.status as ConteoPanel["status"],
    auto: c.auto === true,
    submittedAt: c.submitted_at as string,
    countedBy: counter?.full_name ?? null,
    reviewedAt: (c.reviewed_at as string | null) ?? null,
    lineas: ((c.inventario_conteo_items ?? []) as Array<Record<string, unknown>>).map((r) => mapLinea(r, tareas)),
    noEncontrados: (ne ?? []).map((t) => ({ name: (t.ing as unknown as { name: string } | null)?.name ?? "—", motivo: t.motivo as Motivo })),
  };
}

/** Open tasks (programadas) and the latest closed ones without a count line (no encontrado / vencida). */
export async function tareasPanel(db: Db, orgId: string, desde: string): Promise<TareaPanel[]> {
  const { data } = await db
    .from("agente_tareas")
    .select("id, ingrediente_id, motivo, detalle, fecha, estado, ing:ingredientes(name)")
    .eq("organization_id", orgId)
    .or(`estado.eq.pendiente,fecha.gte.${desde}`)
    .order("fecha", { ascending: false })
    .limit(300);
  return (data ?? []).map((t) => ({
    id: t.id as string,
    ingredienteId: t.ingrediente_id as string,
    name: (t.ing as unknown as { name: string } | null)?.name ?? "—",
    motivo: t.motivo as Motivo,
    detalle: (t.detalle as string | null) ?? null,
    fecha: t.fecha as string,
    estado: t.estado as string,
  }));
}

/** Items whose verified count keeps landing on the same side (≥ 2 of their last lines). */
export interface Repetida {
  ingredienteId: string;
  name: string;
  veces: number;
  de: number;
  lado: "falta" | "sobra";
}
export function diferenciasRepetidas(conteos: ReadonlyArray<ConteoPanel>): Repetida[] {
  const por = new Map<string, { name: string; lados: ("falta" | "sobra" | "ok")[] }>();
  for (const c of conteos) {
    for (const l of c.lineas) {
      if (l.revision === "rechazado" || l.expected <= 0) continue;
      const diff = l.counted - l.expected;
      const margen = Math.max(l.pieza ?? 1, l.expected * 0.1);
      const lado = Math.abs(diff) <= margen ? "ok" : diff < 0 ? "falta" : "sobra";
      const e = por.get(l.ingredienteId) ?? { name: l.name, lados: [] };
      e.lados.push(lado);
      por.set(l.ingredienteId, e);
    }
  }
  const out: Repetida[] = [];
  for (const [id, e] of por) {
    const ult = e.lados.slice(0, 5);
    const falta = ult.filter((x) => x === "falta").length;
    const sobra = ult.filter((x) => x === "sobra").length;
    if (falta >= 2 && falta >= sobra) out.push({ ingredienteId: id, name: e.name, veces: falta, de: ult.length, lado: "falta" });
    else if (sobra >= 2) out.push({ ingredienteId: id, name: e.name, veces: sobra, de: ult.length, lado: "sobra" });
  }
  return out.sort((a, b) => b.veces / b.de - a.veces / a.de).slice(0, 5);
}
