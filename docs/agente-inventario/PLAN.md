# Agente de inventario — plan

> Status: **plan, not started** (2026-11-11). Org PAYO `b069847f`.
> Idea: an AI agent runs the inventory. It predicts how much to order and
> detects what is running out. The baristas are its eyes and hands: on the
> `/turno` tablet they get short tasks from the agent («verifica cuántas bolsas
> de leche hay») and their answers are the agent's ground truth.

---

## 1. Where we start (production data on **Neon**, 2026-11-11)

> Production runs on Neon since 2026-10-31. Read it with `NEON_DATABASE_URL` from
> `.env.neon.prod`. **`.e2e/apply-migration.mjs` and `.e2e/reportes/*` still point at
> the old Supabase copy.**

| Fact | Number | What it means for the agent |
|---|---|---|
| Active insumos | 81 | Small enough to verify each one a few times a month |
| Insumos with **negative stock** | **25 (31 %)** (café Okana −1 268 g, vasos 12 oz −108 / −106) | The system stock is not trustworthy yet: **predictions on these numbers would be wrong** |
| Insumos with `stock_min` set | 29 | Reorder points mostly missing |
| Insumos with `stock_objetivo` set | 1 | "Order up to" almost never set |
| Insumos with a supplier | 27 | Order proposals can't be routed for 2/3 of the list |
| `venta` movements (recipes deduct stock) | 7 923 since 16-sep | ~2 months of consumption history: **enough to forecast** |
| Purchases (`import` movements) | 67, mostly loaded by script | Stock-in is under-recorded → that is why stock goes negative |
| Counts approved | 3 full (last 4-nov) + 3 daily (last 20-oct) | Counting works but isn't a routine yet |
| Barista «hay / poco / agotado» reports | 333 | The team **does** use quick inventory taps: build on that habit |
| `compras` (purchase orders) | 3 open | The order/receive flow exists but isn't used much yet |
| **Recipes** | see the 2026-11-11 audit | Wrong recipes break the stock even with perfect counts. **Audit them first (F0)** |

**Conclusion:** the agent's first job isn't predicting. It is **making the stock numbers
trustworthy**: correct recipes, then small, well-targeted checks. Prediction only
becomes useful on top of that. This order (trust → predict → order) shapes the phases below.

## 2. What already exists (reuse, don't rebuild)

- `lib/inventario/*`: levels (`niveles.ts`: rojo/amarillo/verde, `pieza_qty`,
  `pack_qty`), quick counts that **auto-apply when normal** (`conteo.ts`, mig 0046
  `inventario_conteos.auto`), «¿Qué se está acabando?» (`acabando.ts`,
  `inventario_faltantes`), mermas, sugerencias, kardex.
- Tablet: `app/turno/inventario` hub (acabando · existencias · faltantes · merma ·
  pedir · recibir · sugerir), offline queue, the turno login (actor = the barista).
- Compras: `compras` / `compra_items` (status pedido → recibido → cerrada),
  `proveedores` with `dias_pedido_idx` + `entrega_dias`, `/compras` page with wa.me.
- AI: `lib/ai/groq.ts` (free gpt-oss-120b, JSON-schema output). Anthropic credits
  are **empty**, so v1 runs on Groq and swaps to Claude later.
- Cron: `vercel.json` already has one daily cron (`/api/cron/generate-shifts`).

## 3. Architecture: deterministic core + LLM on the edges

```
            ┌───────────── nightly cron + event triggers ─────────────┐
            ▼                                                          │
  ┌──────────────────────┐   ┌───────────────────────┐   ┌────────────┴─────────┐
  │ 1. Motor (pure TS)   │──▶│ 2. Planificador de    │──▶│ 3. Tablet: «El       │
  │ consumo · cobertura  │   │    tareas (who/what/  │   │    asistente pide»   │
  │ confianza · pedido   │   │    when to verify)    │   │    barista answers   │
  └──────────────────────┘   └───────────────────────┘   └────────────┬─────────┘
            ▲                                                          │ count /
            │  ajuste movements via existing conteo paths              │ photo / note
            └──────────────────────────────────────────────────────────┘
  ┌──────────────────────┐   ┌───────────────────────┐
  │ 4. LLM layer (Groq)  │   │ 5. Owner: propuestas  │
  │ explain · phrase ·   │──▶│ de pedido, anomalías, │──▶ compras (pedido) → wa.me
  │ read notes · draft   │   │ precisión del agente  │
  └──────────────────────┘   └───────────────────────┘
```

**Rule:** numbers come from code, words come from the LLM. The model never
computes stock or quantities. It explains them, phrases tasks, reads
barista notes and drafts messages. This keeps the agent correct, testable, and
cheap enough for the Groq free tier.

### 3.1 Motor (pure, unit-tested: `lib/inventario/agente/motor.ts`)
Per insumo:
- **Consumo diario**: from `venta` + `merma` movements, by weekday (Sat ≠ Tue),
  exponentially weighted (recent weeks count more). Excludes days closed.
- **Stock estimado** = last *verified* quantity + purchases − consumption since.
  This is computed alongside `stock_current`; it does not replace it.
- **Confianza** (0–1): drops with days since last verification, with the
  size of past count corrections (drift), with negative stock, and with
  purchases that were never received through `compras`.
- **Días de cobertura** = stock / consumo; **fecha estimada de agotado**.
- **Punto de pedido** = consumo × (entrega_dias + days until the next order day) + safety
  (safety from the variability of daily consumption). **Cantidad a pedir** = up to
  `stock_objetivo` (proposed by the motor when it's null), rounded to `pack_qty`.
- **Anomalía**: a verified count far from the estimate (e.g. > 25 % and > 1 piece)
  → possible unrecorded merma, purchase not entered, or a wrong recipe.

### 3.2 Planificador de tareas
Picks the few checks with the **most value per barista minute**:
`score = (1 − confianza) × importancia × urgencia`. Importance comes from cost and
recipe count. Urgency is high when the item is near its reorder point.
- **Budget**: max N tasks per shift (start N = 5). They're scheduled in the slow hours
  of that shift, using the POS sales-by-hour data. **Never during the rush.**
- Groups by `ubicacion` (Nevera, Barra, Bodega…), so one walk covers several items.
- Task types:
  | tipo | Barista sees | Answer |
  |---|---|---|
  | `verificar` | «¿Cuántas bolsas de leche entera hay en la nevera?» | number in **pieces** (pad) · «no lo encuentro» |
  | `foto` | «Toma una foto del café en grano» (high-value / anomaly) | photo (+ number) |
  | `confirmar_agotado` | «Marcaste *poco* hace 3 días: ¿sigue igual?» | hay · poco · agotado |
  | `recepcion` | «¿Llegó el pedido de JW Colpack?» | opens existing *Recibir* |
  | `vencimiento` | items with `controla_vencimiento` | date / «todo bien» |
- Event triggers (not only nightly): a barista marks «poco/agotado» when the motor
  thinks there's plenty → immediate `verificar`; a sale pushes an item under
  `stock_critico` → `verificar` before proposing an emergency order.

### 3.3 Tablet: «El asistente pide»
- A card at the top of `/turno/inventario` and a badge on the home tile:
  «El asistente necesita 3 cosas (≈2 min)».
- One task per screen. It shows the photo/location and the piece name (`pack_label`)
  with a big number pad. The answer goes through the **existing quick-count path**
  (auto-apply when normal, else waits for the owner). This adds no new write path
  for stock.
- Offline-capable (reuse the inventory offline queue). Skippable with a reason
  («estoy atendiendo»). A skipped task comes back later; it is not lost.
- Optional small acknowledgement for the team («Con tu ayuda el inventario está
  92 % confiable»), so the barista sees why the checks matter.

### 3.4 LLM layer (`lib/inventario/agente/llm.ts`, Groq → Claude later)
Tools the model may call (read-only plus two proposal writes):
`estado_insumo`, `consumo`, `historial_conteos`, `proveedor`, `crear_tarea`,
`proponer_pedido`. It **cannot** move stock, approve counts or send messages.
Uses:
1. **Explain** anomalies and proposals in plain Spanish for the owner
   («La leche bajó 3 bolsas más de lo que explican las ventas; ¿merma sin registrar?»).
2. **Read barista notes** («queda media bolsa», «la otra está abierta») → a number +
   a flag, with the structured JSON output.
3. **Draft the supplier message** for each approved order (WhatsApp text, per
   supplier's style).
4. **Weekly summary** for the owner (also feeds the existing report artifacts).
5. Later: **ask the agent** from `/inventario` («¿cuánto café pedir para el
   puente festivo?»).

Groq free-tier constraints: keep prompts < ~5 K tokens (pass the motor's numbers,
not raw movements); inject today's date; batch the nightly run, with no per-sale
LLM calls.

### 3.5 Owner screen `/inventario/agente`
- **Propuestas de pedido** grouped by supplier and order day → *Aprobar* creates a
  `compras` row (status `pedido`, `origen = 'agente'`) and opens wa.me with the
  draft. *Editar* / *Descartar* (the reason is stored so the agent can learn from it).
- **Anomalías** with the agent's explanation and the barista's photo.
- **Precisión**: forecast error vs. verified counts, % of insumos with
  high confidence, stockouts this week, tasks done / skipped per barista.
- **Proposed levels**: suggested `stock_min` / `stock_critico` / `stock_objetivo` from
  consumption, applied with one tap (fixes the "28 / 1 set" gap).

## 4. Data model (new migration, ~0073)

```sql
agente_tareas (
  id, organization_id, restaurant_id, ingrediente_id null, compra_id null,
  tipo text check (tipo in ('verificar','foto','confirmar_agotado','recepcion','vencimiento')),
  motivo text,               -- why the agent asks (shown to owner, not barista)
  prompt text,               -- what the barista reads
  prioridad numeric, ventana_desde timestamptz, ventana_hasta timestamptz,
  estado text check (estado in ('pendiente','hecha','omitida','vencida')),
  respuesta jsonb,           -- {qty_piezas, foto_path, nota, marca}
  conteo_id null,            -- the quick count it produced
  shift_instance_id null, asignada_a null, hecha_por null, hecha_at,
  created_at
)
agente_estado_insumo (       -- motor snapshot, one row per insumo, refreshed nightly
  ingrediente_id pk, organization_id, consumo_diario, consumo_por_dia jsonb,
  stock_estimado, confianza, cobertura_dias, agotado_estimado date,
  punto_pedido, pedir_qty, ultima_verificacion_at, anomalia jsonb, updated_at
)
agente_eventos (             -- audit log: every decision/LLM output, for trust + tuning
  id, organization_id, tipo, ingrediente_id null, payload jsonb, modelo text, created_at
)
-- compras: allow origen 'agente' and status 'propuesta' (before 'pedido')
```
RLS like the other inventory tables. Tablet writes go through service role as the
signed-in barista (same as the rest of `/turno`).

## 5. Phases

| # | Phase | Delivers | LLM? | Done when |
|---|---|---|---|---|
| **F0** | **Baseline** (prereq, mostly owner) | Review the 4 pending counts; one guided full count; make purchases go through *Recibir* | no | negatives < 5; every purchase since F0 is in `compras` |
| **F1** | **Motor in shadow mode** | `motor.ts` + tests, nightly cron fills `agente_estado_insumo`, read-only owner page | no | forecast vs. counts measured for 2 weeks |
| **F2** | **Barista tasks** | mig 0073, planificador, «El asistente pide» on the tablet, answers → quick count | no | ≥ 80 % of tasks done; confidence rising |
| **F3** | **Order proposals** | proposals + approve → `compras` + wa.me; proposed levels | optional | owner approves proposals with few edits |
| **F4** | **LLM layer** | explanations, note reading, supplier drafts, weekly summary (Groq) | yes | owner finds the explanations useful |
| **F5** | **More autonomy** (only if the owner wants) | auto-approve recurring low-value orders; ask-the-agent chat; Claude when credits return | yes | — |

F1–F3 are useful **without any LLM**. That matters while Anthropic credits are empty
and Groq is rate-limited. The "AI" in the first weeks is the forecast plus the task
planner. The language model goes on top.

### Testing
- Pure motor/planner with unit tests (fixtures from real anonymised movements).
- e2e on the **Taller** sede (dev DB is live: no write e2e during opening hours),
  in the style of `.e2e/acabando.mjs`: create tasks → answer on the tablet → check the
  quick count + ajuste movement → clean up.
- Shadow-mode comparison script in `.e2e/reportes` (read-only pg).

## 6. Risks

- **Bad baseline** → the agent asks the wrong questions. F0 is mandatory.
- **Barista fatigue / rush hour**: strict task budget, slow-hour windows, skip
  without penalty, tasks grouped by zone.
- **Untrusted answers** (a guessed number): photo tasks on high-value items; the
  motor also lowers confidence when one barista's answers keep drifting.
- **Groq limits**: the LLM is never in the critical path; everything degrades to
  the deterministic version.
- **Recipes are wrong** (e.g. the milk unit incident): anomalies point at the recipe as
  a possible cause rather than blaming the staff (lesson from the 23-sep report).

## 7. Decisions for the owner

1. **Who orders?** Recommended: the agent **proposes**, the owner approves (F3).
   Auto-ordering only in F5, per supplier.
2. **Task budget** per shift: start with 5 and tune.
3. **LLM**: Groq free now, Claude once credits are topped up?
4. **PAYO only, or every org** using comanda? The design is org-scoped either way;
   multi-org affects the cron cost and the owner settings page.
