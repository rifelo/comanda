// Domain types — kept hand-written for clarity.
// If you add columns or tables, update both this file and the corresponding query in lib/db/.

export type UserRole = "staff" | "admin";
export type ShiftStatus = "open" | "closed";

export interface Profile {
  id: string;
  organization_id: string;
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
}

export interface TemplateTask {
  id: string;
  template_id: string;
  order_index: number;
  title: string;
  instructions: string | null;
  due_time: string | null; // 'HH:MM:SS'
  requires_photo: boolean;
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
  stock_current: number;
  stock_min: number;
  merma_pct: number;
  cost_cop: number;
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
}
