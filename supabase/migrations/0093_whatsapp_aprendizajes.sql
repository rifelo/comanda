-- El agente de WhatsApp aprende con aprobación del dueño.
-- Cada noche una revisión lee las conversaciones del día y propone lecciones
-- cortas; el dueño las aprueba, edita o descarta en /whatsapp/aprendizajes, y
-- las aprobadas entran al prompt. Cada respuesta del agente guarda la versión
-- del prompt que la produjo, para comparar cómo le va a cada versión.

alter table whatsapp_mensajes add column if not exists prompt_version text;

-- Último traspaso a una persona (antes solo quedaba en el log).
alter table whatsapp_conversaciones
  add column if not exists traspaso_at     timestamptz,
  add column if not exists traspaso_motivo text;

create table if not exists agente_lecciones (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  texto           text not null,             -- la regla, como la leerá el agente
  motivo          text,                      -- por qué la propuso la revisión
  ejemplo         text,                      -- fragmento de conversación que la originó
  estado          text not null default 'propuesta'
                  check (estado in ('propuesta', 'aprobada', 'descartada', 'retirada')),
  fecha_origen    date,                      -- día de conversaciones que la originó
  decidida_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists agente_lecciones_org_idx on agente_lecciones (organization_id, estado, created_at desc);

create table if not exists agente_revisiones (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  fecha           date not null,             -- día revisado (hora de Bogotá)
  resumen         text,
  metricas        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (organization_id, fecha)
);

alter table agente_lecciones  enable row level security;
alter table agente_revisiones enable row level security;
drop policy if exists "agente_lecciones admin" on agente_lecciones;
create policy "agente_lecciones admin" on agente_lecciones for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
drop policy if exists "agente_revisiones read admin" on agente_revisiones;
create policy "agente_revisiones read admin" on agente_revisiones for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
