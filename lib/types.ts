// Domain types — kept hand-written for clarity.
// If you add columns or tables, update both this file and the corresponding query in lib/db/.

export type UserRole = "staff" | "admin";
export type ShiftStatus = "open" | "closed";

export interface Profile {
  id: string;
  /** Currently-active org pointer. Nullable since 0014: a brand-new user with
   *  no org yet lands on /organizaciones to pick or create one. `requireUser`
   *  narrows this back to `string` for the dozen call sites that pass it to
   *  org-scoped queries. */
  organization_id: string | null;
  full_name: string;
  role: UserRole;
}

export interface Restaurant {
  id: string;
  organization_id: string;
  name: string;
  timezone: string;
}

export interface ChecklistTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  active: boolean;
  version: number;
  /** "HH:MM" (24h). Shift start. Added 0009. */
  inicio: string;
  /** "HH:MM" (24h). Shift end (may wrap past midnight). Added 0009. */
  fin: string;
  /** Length-7 mask, Mon-indexed (index 0 = Monday). Added 0009. */
  dias: boolean[];
}

/** Alias for the redesign — turnos own their tasks; the table is still
 *  `checklist_templates` (see migration 0009) so callers can use either name. */
export type Shift = ChecklistTemplate;

export type ShiftTask = TemplateTask;

/** Single-sede settings (column-extended on `restaurants` by migration 0009). */
export type ThemeName = "papel" | "sepia" | "carbon" | "indigo" | "rojo";

export interface Sede {
  id: string;
  name: string;
  timezone: string;
  logo_url: string | null;
  currency: string;
  theme: ThemeName;
}

/** Team member as displayed in the Equipo UI + Asignación picker. */
export interface RosterMember {
  /** profiles.id (a UUID). */
  id: string;
  /** Derived from `full_name` — first letter of first two parts, uppercase. */
  initials: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  /** Only two roles exist: 'admin' (owner) and 'staff'. */
  role: "admin" | "staff";
  /**
   * Whether this person has a `restaurant_members` row for the sede. Owners
   * (org admins) are listed even without one — for them this is false, so the
   * UI hides per-member controls (active toggle, remove, phone) that have no
   * row to write to.
   */
  isMember: boolean;
}

/** A single cell in the per-week assignment grid. */
export interface WeeklyAssignment {
  /** YYYY-MM-DD (ISO Monday). */
  week_start: string;
  template_id: string;
  /** 0 = Monday … 6 = Sunday. */
  dia_idx: number;
  /** profiles.id, or null when cleared. */
  member_id: string | null;
  /** puestos.id — one person per puesto per day; null = legacy whole-turno row. */
  puesto_id: string | null;
}

/** A role/station inside a turno (Apertura, Barista, Aseo…), per sede. */
export interface Puesto {
  id: string;
  restaurant_id: string;
  name: string;
  /** design token: ink | red | green | amber | indigo */
  color: string;
  position: number;
}

/** Which puestos a turno uses, in order, and which task gates each one (soft handoff). */
export interface TemplatePuesto {
  template_id: string;
  puesto_id: string;
  position: number;
  waits_for_task_id: string | null;
  puesto: Puesto;
}

export interface TemplateTask {
  id: string;
  template_id: string;
  order_index: number;
  title: string;
  instructions: string | null;
  due_time: string | null; // 'HH:MM:SS'
  requires_photo: boolean;
  /** puestos.id; null = compartida (everyone on the turno). */
  puesto_id: string | null;
}

export interface ShiftInstance {
  id: string;
  restaurant_id: string;
  template_id: string;
  date: string; // 'YYYY-MM-DD'
  status: ShiftStatus;
  opened_by: string | null;
  opened_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  /** Admin review of a closed turno (0032). */
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
}

export interface TaskCompletion {
  id: string;
  shift_instance_id: string;
  template_task_id: string;
  completed_by: string;
  completed_at: string;
  photo_url: string | null;
  note: string | null;
}

export interface Novedad {
  id: string;
  shift_instance_id: string;
  restaurant_id: string;
  submitted_by: string;
  submitted_at: string;
  body: string;
}

export type AdHocStatus = "pending" | "done" | "cancelled";

/** A one-off task raised during a running shift (not part of the template).
 *  Admin-created; staff on the shift complete it. `due_time` null = inmediata. */
export interface AdHocTask {
  id: string;
  shift_instance_id: string;
  restaurant_id: string;
  title: string;
  instructions: string | null;
  /** profiles.id, or null when the task is for the whole shift. */
  assigned_to: string | null;
  /** Hydrated from the joined assignee profile (full_name), when present. */
  assignee_name?: string | null;
  created_by: string;
  /** 'HH:MM:SS' | null. Null = inmediata / ASAP; set = scheduled later today. */
  due_time: string | null;
  status: AdHocStatus;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export type TaskStatus = "pending" | "done" | "cancelled";

/** A standalone to-do (outside a shift) — see migration 0016. Scoped to a
 *  sede; optionally assigned, scheduled, and photo-gated. */
export interface Task {
  id: string;
  restaurant_id: string;
  title: string;
  details: string | null;
  /** profiles.id, or null when the task is for anyone at the sede. */
  assigned_to: string | null;
  /** Hydrated from the joined assignee profile (full_name), when present. */
  assignee_name?: string | null;
  created_by: string;
  scheduled_date: string | null; // 'YYYY-MM-DD' | null = sin fecha
  due_time: string | null; // 'HH:MM:SS' | null = sin hora
  requires_photo: boolean;
  status: TaskStatus;
  completed_by: string | null;
  completed_at: string | null;
  photo_url: string | null;
  created_at: string;
}

/** A shift instance hydrated with its template + tasks + completions for the staff screen. */
export interface ShiftView {
  shift: ShiftInstance;
  template: ChecklistTemplate;
  tasks: TemplateTask[];
  completions: Record<string, TaskCompletion>; // keyed by template_task_id
  restaurant: Restaurant;
  /** Profile of whoever opened the shift, embedded from `shift_instances.opened_by`.
   *  `null` if the shift has not been opened yet. */
  opener: { id: string; full_name: string | null } | null;
  /** Ad-hoc tasks raised during this shift (see migration 0015). */
  adHocTasks: AdHocTask[];
  /** Puestos configured on the template (empty for a flat/legacy turno). */
  puestos: TemplatePuesto[];
}

// =============================================================================
// Productos catálogo (module 01)
// =============================================================================

export type ProductoStockStatus = "ok" | "bajo" | "sin";

export interface ProductoCategoria {
  id: string;
  organization_id: string;
  parent_id: string | null;
  label: string;
  position: number;
  created_at: string;
  /** Products here get the menu cup label when sold (0027, renamed in 0029).
   *  Off for food and for bottled drinks handed over as they are. */
  imprime_etiqueta?: boolean;
}

export interface Producto {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  sku: string;
  price_cop: number;
  cost_cop: number;
  margin_pct: number;
  stock_status: ProductoStockStatus;
  created_at: string;
  updated_at: string;
}

/** Hydrated row consumed by the catálogo list view. */
export interface CatalogoRow extends Producto {
  category_label: string | null; // "Hamburguesas · Clásicas"
  is_favorite: boolean;
}

/** Tree node consumed by the catálogo category rail. */
export interface CatalogoCategoryNode {
  id: string | null; // null = "Todas las categorías" synthetic root
  label: string;
  count: number; // descendant-inclusive product count
  indent: number; // 0 root, 1 parent, 2 child
  parent_id: string | null;
  children?: CatalogoCategoryNode[];
}

// =============================================================================
// Ingredientes catálogo (module 02)
// =============================================================================

export interface IngredienteCategoria {
  id: string;
  organization_id: string;
  parent_id: string | null;
  label: string;
  position: number;
}

export interface Ingrediente {
  id: string;
  organization_id: string;
  category_id: string | null;
  name: string;
  unit: string;
  // Optional secondary unit (same domain as `unit`, e.g. ml/L/g/kg/und/...).
  // When set it must differ from `unit`. Persisted as null when unused so
  // single-unit ingredientes render unchanged.
  unit2: string | null;
  // Positive factor expressing 1 primary unit = N secondary units (e.g. 12
  // when 1 caja = 12 und). Nullable: a non-null `unit2` with a null factor
  // means "show the secondary label, but skip automatic conversion".
  conversion_factor: number | null;
  stock_current: number;
  stock_min: number;
  merma_pct: number;
  cost_cop: number;
  // Pack-purchase costing. When both are set, `cost_cop` is derived as
  // round(pack_cost_cop / pack_qty) — what you paid for a pack and how many
  // units it holds (e.g. 4400 paid for a pack of 12 -> cost_cop 367). Both
  // null means `cost_cop` was entered directly per unit.
  pack_cost_cop: number | null;
  pack_qty: number | null;
  archived: boolean;
}

export type IngredienteMovementType = "venta" | "gasto" | "ajuste" | "import";

export interface IngredienteMovement {
  id: string;
  organization_id: string;
  ingrediente_id: string;
  type: IngredienteMovementType;
  delta: number;
  balance_after: number;
  unit_cost_cop: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
