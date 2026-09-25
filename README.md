# Comanda

Mobile-first PWA to digitize daily restaurant operating procedures (the paper "Lista de Actividades" sheet). Multi-tenant: one organization can run many restaurants. Staff check off shift tasks from their phone with photo evidence; admins watch completion in real time and review novedades.

Built with **Next.js 15 (App Router) · Supabase · Tailwind CSS · TypeScript**.

## Stack at a glance

| Layer       | Choice                                 |
| ----------- | -------------------------------------- |
| Framework   | Next.js 15 (App Router, React 19)      |
| PWA         | `@ducanh2912/next-pwa` (installable)   |
| Backend     | Supabase (Postgres + Auth + Storage)   |
| RLS         | Multi-tenant isolated by `restaurant_id` |
| UI          | Tailwind CSS v4, hand-rolled primitives |
| Forms       | React Hook Form + Zod                  |
| Drag-drop   | `@dnd-kit/core` (template editor)      |
| Deploy      | Vercel (frontend) + Supabase Cloud     |

## Setup

1. **Create a Supabase project** at https://app.supabase.com and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` API key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` API key → `SUPABASE_SERVICE_ROLE_KEY` (server-only)

2. **Configure env**:

   ```bash
   cp .env.local.example .env.local
   # paste the keys above into .env.local
   # also generate a CRON_SECRET (any random string)
   ```

3. **Apply the schema**. Either via the Supabase dashboard SQL editor (paste `supabase/migrations/0001_init.sql`, then optionally `supabase/seed.sql` for the Daniel's Burger demo) or via the Supabase CLI (`supabase db push`).

4. **Disable email confirmations during local development** (Supabase dashboard → Authentication → Sign In / Up → Email → uncheck "Confirm email"). For production, leave it on.

5. **Run dev**:

   ```bash
   pnpm install
   pnpm dev
   ```

   Open http://localhost:3000. Sign up — the DB trigger creates an organization automatically and gives the new user the `admin` role.

### Turnos de PAYO (seeds)

`node scripts/seed-turno-manana.mjs` (Mañana hábil, 06:00–12:00 lun–vie) and `node scripts/seed-turno-noche.mjs`
(Noche 17:00–21:00 lun–sáb with Barista / Aseo / Cierre, plus the Saturday machine cleaning) seed PAYO's
checklists through `scripts/lib/seed-turnos.mjs` — idempotent, tasks are matched by title (or by `was`
for renames) and updated in place; pass `--prune` to delete tasks removed from the list. Its "Arqueo y cierre de caja" task points at the tablet's
Turno → Caja screen (migration `0037_caja_cierres.sql`).

### Herramientas del turno (tablet)

Both the shared tablet (`/turno`) and a person's own shift screen (`/shift/[id]`, full width on the tablet) open the
same two tools, with one shared screen and one set of DB helpers each:

- **Caja · arqueo** (`/turno/caja`, `/shift/[id]/caja`; `components/caja/caja-screen.tsx`, `lib/caja/cierres.ts`):
  blind count by denomination, base inicial pre-filled with the base the last cierre left (`baseSugerida`), base que
  queda for tomorrow, entrega = contado − base que queda, and the trail of the base (last cierres of the sede). The
  owner approves from `/hoy/[date]` or the new `/caja` page (Operación · 12: base en caja, por aprobar, historial).
- **Faltantes · inventario rápido** (`/turno/inventario`, `/shift/[id]/inventario`;
  `components/inventario/rapido-screen.tsx`, `lib/inventario/faltantes*.ts`, migration `0038_inventario_faltantes.sql`):
  only the ingredients with `ingredientes.prioridad > 0` (1 crítico · 2 importante · 3 normal), one tap per item
  (hay / poco / se acabó) and one send; each tap is a row in `inventario_faltantes`, the open row is the item's
  current state, and "hay" or the owner's **Repuesto** closes it. The owner sets the list and resolves reports in
  `/inventario/faltantes`; open reports also show in `/notificaciones` and `/hoy/[date]`.
  `node scripts/seed-prioridades-payo.mjs` seeds PAYO's list (only items still at 0; `--force` overwrites).
  E2E: `node .e2e/shift-tools.mjs` (dev server on :3000).

## End-to-end happy path

1. Sign up an admin → onboarded into a fresh organization.
2. **Create restaurant** ("Daniel's Burger - Sede Demo") → both day + night templates auto-seed from the FO-DB-05 paper sheet.
3. **Generate today's shifts**: hit `/api/cron/generate-shifts` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron does this automatically once deployed).
4. **Invite staff**: create a Supabase Auth user for the staff member with `raw_user_meta_data.role = 'staff'` and your `organization_id`, then `INSERT INTO restaurant_members` for the restaurants they should access. (A first-class invite UI is on the roadmap.)
5. Staff signs in on their phone → "Add to Home Screen" → opens to **Today**, taps into the shift, checks off tasks. Photo-required tasks open the camera. They can submit novedades from the shift screen.
6. Admin watches the dashboard live and drills into a shift to see completed tasks with timestamps + photo thumbnails.

## Verifying multi-tenancy

```sql
-- As restaurant A's staff (auth.uid() set), this returns only A's rows:
select * from shift_instances;
-- As a second staff at restaurant B, only B's rows. Cross-restaurant leakage = bug.
```

## Deploying to Vercel

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add CRON_SECRET
vercel --prod
```

`vercel.json` declares the daily cron at 05:05 UTC (00:05 Bogotá) hitting `/api/cron/generate-shifts`. Vercel forwards `Authorization: Bearer $CRON_SECRET` automatically for cron-triggered requests.

## Roadmap (deferred from MVP)

- Inventory + staff scheduling
- Offline support (service worker queue + IndexedDB)
- Cash handoff (arqueo) digitization
- Realtime updates between staff devices (Supabase Realtime)
- First-class staff invite flow (currently SQL-only)
