# Comanda · rediseño completo de UI (PA'YO) — plan de implementación

Fecha: 2026-10-31 · Rama: `dev` (Neon + Better Auth; prod sigue en Supabase) · Autor: arquitectura de producto.
Este documento es el único contrato para los agentes que implementan en paralelo. No contiene código de aplicación; sí nombres de archivos, rutas, componentes, props y criterios de aceptación.

Referencia visual: canvas "Tablet PA'YO · Rediseño" (12 pantallas 1280×800). Copia local de `app.css` y las 12 pantallas `.dc.html` en
`/tmp/claude-1000/-home-super-comanda/2551e5a3-a4bc-4b72-bb57-dc20c214aabc/scratchpad/artifact-files/66f8490f-166a-4023-932d-16cdef72422d/project/`.
Léanse como maquetas HTML/CSS (ignorar `support.js`/dc-runtime). Los valores exactos de los tokens están copiados en la sección 5 para que nadie dependa de ese directorio temporal.

---

## 0. Resumen ejecutivo (lo que cambia y lo que no)

**Cambia**
1. Una sola app instalable (PWA) con dos "caras" según el rol: **Equipo** (tablet compartida y teléfono de cada barista: Hoy · Tareas · Caja · Inventario · POS) y **Dueño** (Hoy · Inventario · Productos · Equipo · Más).
2. **Un solo login** en `/login` para todos y todos los dispositivos. En un dispositivo emparejado (tablet/caja) aparecen las fichas «¿Quién eres?» + contraseña; en un teléfono personal, correo + contraseña o Google. POS y tablet exigen persona; el emparejamiento sólo identifica la sede.
3. **Sistema de diseño nuevo** (neutro blanco/gris, Inter, amarillo marca sólo en acción primaria / tab activo / logo, verde ok, rojo atrasado, radios 16/12, controles 56 px, filas 76 px, barra de tabs inferior, segmentados, pasos, sheets, modo oscuro) como tema Tailwind 4 + componentes React en `components/ui/*`, y **alias de las variables viejas** (`--paper`, `--ink`, `--rule`…) para que las pantallas aún no rediseñadas se vean neutras desde el día uno.
4. Arquitectura de módulos basada en uso real: Números+Hoy se funden en el **Hoy del dueño**; Catálogo+Recetas en **Productos**; Turnos admin+Equipo en **Equipo**; `/home /today /shift/*` del staff desaparecen a favor de `/turno/*` (la tablet y el teléfono del barista son la misma app). Combos, listas de precios, importación CSV, notificaciones, WhatsApp salen de la navegación (rutas siguen vivas bajo «Más → Avanzado»).
5. Velocidad: POS con Favoritos (top-12) por defecto, cobro **Efectivo / Transferencia en un toque**, barista = persona que entró; inventario del dueño con **«Corregir» en un sheet con teclado numérico y motivo** (hoy 848 ajustes manuales, 810 del dueño); ficha de producto con receta editable en línea y costo/margen en vivo.

**No cambia**
- Motor del POS (`app/pos/pos-store.ts`, outbox, `public/pos-sw.js`, impresión `lib/printer/*`, etiquetas, relay), esquema de base de datos (cero migraciones), server actions existentes (sólo se añaden campos opcionales), `lib/neon/*` salvo una función (ver F2), rutas públicas `/menu /menu/caja /menu/puntos /c/[codigo] /privacidad`, tipografías del menú y de la etiqueta, el manifest del POS (`/pos/manifest.webmanifest`, id `/pos`) y el `.bat` de arranque de la caja.

---

## 1. Ranking de módulos (uso 30 días × valor para el negocio)

Escala: Uso 0–5 (frecuencia real), Valor 0–5 (dinero/control/riesgo). Decisión: **Elevar** (tab o home), **Mantener** (visible, rediseñar), **Simplificar** (rediseñar reduciendo pasos), **Fusionar**, **Secundario** (detrás de «Más»), **Quitar de la navegación** (ruta viva, sin enlace).

| # | Módulo (rutas actuales) | Uso | Valor | Datos | Decisión |
|---|---|---|---|---|---|
| 1 | **POS** `/pos` | 5 | 5 | 922 órdenes, 765 pagadas, $12.740 ticket, pico 9–10h, 16,6 % canceladas | **Elevar.** Tab «POS» en ambas caras. Rediseñar UI y flujo de cobro; motor intacto. |
| 2 | **Tareas del turno (tablet)** `/turno` | 5 | 4 | 1.556 completadas, 60 turnos cerrados, 24 novedades | **Elevar.** Es la referencia visual. Hoy + Tareas + Abrir/Cerrar guiados. |
| 3 | **Caja (tablet)** `/turno/caja*` | 4 | 5 | 23 arqueos+base, movimientos diarios; controla el efectivo (440 ventas efectivo) | **Elevar.** Tab «Caja» del equipo. Dueño revisa en Hoy (caja vs arqueo) y `/caja`. |
| 4 | **Inventario (tablet)** `/turno/inventario*`, faltantes | 4 | 4 | 155 faltantes reportados, conteo diario al cierre | **Elevar.** Tab «Inventario» del equipo = «¿Qué se está acabando?» (ya existe, restyle). |
| 5 | **Números del dueño** `/numeros` | 4 | 5 | Lo que el dueño mira a diario: ventas, cobros, caja vs arqueo, top sellers, rentabilidad | **Elevar → home del dueño.** Fusionar con `/hoy`. |
| 6 | **Inventario del dueño** `/inventario*`, `/historial`, kardex | 4 | 5 | 848 ajustes (810 del dueño), 20 ítems en negativo, 1 conteo revisado, 14 costos a revisar | **Simplificar fuerte.** Tab «Inventario» del dueño: «Por revisar» + lista con «Corregir» en 2 toques. |
| 7 | **Recetas** `/recetas` | 3 | 5 | 126 ediciones de receta_items; recetas descuentan stock (4.599 ventas automáticas) | **Fusionar** con Catálogo en **Productos** (ficha por producto). |
| 8 | **Catálogo** `/catalogo` | 3 | 4 | 23 productos nuevos, favoritos | **Fusionar** en **Productos**. |
| 9 | **Hoy admin (turnos de hoy)** `/hoy`, `/hoy/[date]` | 3 | 3 | Revisado (`revisado`) de cierres, inmediatas | **Fusionar** en el Hoy del dueño (tarjeta «Turnos de hoy»); el detalle por fecha queda en `/hoy/[date]/turnos`. |
| 10 | **Compras / Por pedir** `/compras` | 2 | 4 | 1 compra registrada, 6 proveedores, pero alimentado por 155 faltantes | **Mantener** dentro de Inventario como «Pedidos». |
| 11 | **Turnos admin** `/turnos/*` (resumen, asignación, tareas, historial, reportes) | 2 | 3 | 22 asignaciones semanales; plantillas se tocan poco | **Fusionar** en **Equipo** (tab del dueño). Simplificar asignación para teléfono. |
| 12 | **Equipo (cuentas)** `/configuracion/equipo` | 1 | 5 | Imprescindible para el login único (contraseñas) | **Elevar** a `/equipo` (primera pestaña del tab Equipo). |
| 13 | **Gastos** `/gastos` | 2 | 4 | 7 gastos, costos fijos mensuales, comisión Bold | **Secundario** («Más → Gastos»), tarjeta de resumen en Hoy. |
| 14 | **Calificaciones + Puntos + Baristas** `/calificaciones`, `/baristas` | 2 | 3 | 623 calificaciones, 22 clientes con puntos | **Fusionar** en **Clientes** («Más → Clientes»; pestañas Reseñas · Puntos · Baristas). |
| 15 | **Caja del dueño** `/caja` | 2 | 4 | Revisión de arqueos y movimientos | **Mantener** en «Más → Caja»; lo esencial (esperado vs arqueo) va en Hoy. |
| 16 | **Dispositivos POS** `/configuracion/pos` | 1 | 4 | Emparejamiento (código) | **Mantener** como `/ajustes/dispositivos`. |
| 17 | **Sede / Preferencias** `/configuracion/*` | 1 | 2 | Tema, logo, zona horaria | **Secundario** `/ajustes`. Preferencias pasa a Claro/Oscuro/Automático. |
| 18 | **Modificadores** `/modificadores` | 1 | 3 | 1 grupo real («Base» de jugos, descuenta stock) | **Secundario**: enlace desde la ficha del producto; ruta se mantiene en Avanzado. |
| 19 | **Mermas / Sugerencias / Niveles / Conteos (dueño)** | 1 | 3 | 0 mermas, 3 sugerencias, 1 conteo revisado | **Fusionar** en «Por revisar» del Inventario del dueño; rutas se mantienen como detalle. |
| 20 | **Importar factura (IA)** `/importar-factura` | 1 | 3 | Bloqueado por créditos Anthropic | **Quitar de la navegación** (enlace sólo desde Pedidos → «Desde una foto»). |
| 21 | **Notificaciones (alertas de stock)** `/notificaciones` | 1 | 2 | Redundante con niveles/acabando | **Quitar de la navegación**; su lógica alimenta «Por revisar». |
| 22 | **Listas de precios** `/precios`, **Combos** `/combos`, **Importación CSV** `/importacion`, `/dashboard` | 0 | 1 | 0 listas, 0 combos, 0 uso | **Quitar de la navegación.** `/dashboard` → redirige a `/hoy`. Rutas vivas en «Más → Avanzado». |
| 23 | **Staff home/today/shift** `/home /today /shift/[id]*` | 2 | 2 | Duplican la tablet con otra UI | **Fusionar** en `/turno/*` con redirecciones. |
| 24 | **WhatsApp agente** `/api/whatsapp` | 0 | 1 | 0 conversaciones | Sin cambios, sin navegación. |
| 25 | **Organizaciones** `/organizaciones` | 0 | 2 | Sólo si el usuario no tiene org | Sin navegación; restyle mínimo. |

Top-5 por prioridad de implementación: POS, Tablet (Hoy/Tareas/Abrir/Cerrar), Caja, Inventario (ambas caras), Hoy del dueño.

---

## 2. Arquitectura de información

### 2.1 Roles y caras
- **Equipo** (`role = staff`, y también el dueño cuando entra en un dispositivo emparejado): cara «Turno».
- **Dueño/admin** (`role = admin`) en dispositivo personal: cara «Panel». Desde el panel puede saltar a la cara Turno («Ver como equipo» → `/turno`) y al POS.

### 2.2 Navegación cara Equipo (teléfono 390 px → tablet 1280×800 → escritorio)
Barra inferior fija (5 tabs, exactamente la referencia):

| Tab | Ruta | Contenido |
|---|---|---|
| Hoy | `/turno` | Pantalla «Main»: tarjeta **Ahora** (próximas 2–3 tareas, la atrasada destacada en rojo), **Debería haber en caja** con ± Entrada/Salida, link-card «N se están acabando», link-card «Cierre a las HH:MM» (o «Abrir el turno» antes de la apertura). Encabezado: logo, «Hoy», turno · horario, botón «Novedad», avatar+nombre, reloj. Badge en Tareas = atrasadas. |
| Tareas | `/turno/tareas` | Segmentado «Pendientes · N / Hechas · N», filas con hora, título, descripción (2 líneas), check / foto, pill «Inmediata» o «Atrasada X min». |
| Caja | `/turno/caja` | Pantalla «Caja» de la referencia (ya implementada en `caja-app.tsx`, se restyla): esperado con desglose, +Entrada/−Salida, movimientos de hoy; arqueo y validar base como flujos de pasos. |
| Inventario | `/turno/inventario` | «¿Qué se está acabando?» (ya implementado en `acabando-screen.tsx`, se restyla): segmentado por zona, Hay/Poco/Se acabó, link-cards Recibir pedido · Registrar merma · Falta algo en la lista. Subrutas existentes se mantienen. |
| POS | `/pos` | Terminal a pantalla completa (sin barra de tabs; botón «←» vuelve a `/turno`). |

Flujos de pantalla completa (header «flow» con puntos de progreso, sin barra de tabs):
- `/turno/abrir` — Abrir el turno: 1 Validar la base → 2…n bloques de tareas de apertura (los bloques de `lib/turno/blocks.ts`) → último «Abrir al público» (hora de apertura del template).
- `/turno/cerrar` — Cerrar el turno: 1 Tareas de cierre (segmentado por zona/bloque) → 2 Conteo rápido (`/turno/conteo` embebido como paso) → 3 Arqueo de caja (componente `arqueo.tsx` existente) → 4 Base para mañana (plan de base) → 5 Entregar (novedades + recibo) → pantalla «Turno entregado» con «Salir de la tablet» (cierra la sesión de la persona, no el emparejamiento).
- Novedad: sheet sobre cualquier pantalla (chips Se dañó algo · Faltó algo · Un cliente · Otro, texto, foto, Guardar). Sin ruta propia; `?novedad=1` abre el sheet (para redirecciones).

Adaptación por tamaño:
- **Teléfono (≤ 639)**: una columna; header 56 px (logo, título, avatar); tab bar 64 px + `env(safe-area-inset-bottom)`; tarjetas apiladas en el orden Ahora → Caja → Acabando → Cierre.
- **Tablet (640–1279, referencia a 1280×800 incluida: usar `max-width: 1365px` para la barra inferior)**: dos columnas (principal `flex:1` + lateral 380 px), header 76 px con reloj y nombre, tab bar 84 px. Exactamente la referencia.
- **Escritorio (≥ 1366 y puntero fino)**: misma barra inferior (la cara Equipo nunca usa sidebar; en el PC de la caja se usa el POS).

Perfil (toque en avatar) → sheet: nombre, rol, «Cambiar persona», «Salir», «Modo oscuro / claro / automático», «Instalar en este dispositivo», y para admin «Ir al panel».

### 2.3 Navegación cara Dueño
Teléfono: barra inferior 5 tabs. Tablet/escritorio (`≥ 1024` y puntero fino): rail lateral 240 px con los mismos ítems y «Más» expandido como grupo.

| Tab | Ruta | Contenido |
|---|---|---|
| Hoy | `/hoy` (`/hoy/[date]`) | **Números del día** (ventas pagadas, # órdenes, ticket promedio, efectivo/transferencia/tarjeta, cobros), **Caja**: esperado vs arqueo del turno, **Turnos de hoy** (tarjeta por turno: persona, progreso, atrasadas, novedades, «revisado»; → `/hoy/[date]/turnos`), **Por atender** (se está acabando, base por validar, conteo por aprobar, costos por revisar, pedidos pendientes POS, sugerencias), **Más vendidos** y **Rentabilidad** (existente), **Gastos del día**. Acciones rápidas: «Inmediata» (asignar tarea al turno), «Abrir POS». Navegación por fecha ‹ › y selector. |
| Inventario | `/inventario` | **Por revisar** arriba (negativos, costos sin precio, conteos por aprobar, sugerencias, mermas recientes) + **lista buscable** (búsqueda primero; por zona/categoría) con stock, unidad, nivel y botón **«Corregir»** (sheet). Subrutas: `/inventario/[id]` (kardex + corregir + nivel + proveedor), `/inventario/pedidos` (por pedir + compras + recibir; «Desde una foto» enlaza a `/importar-factura`), `/inventario/conteos[/id]`, `/inventario/movimientos` (ex `/historial`), `/inventario/mermas`, `/inventario/niveles`, `/inventario/sugerencias`. |
| Productos | `/productos` | Lista buscable (categoría, precio, margen, stock de receta, ★ favorito POS) + «Nuevo producto». `/productos/[id]`: ficha con segmentado **Datos · Receta · Preparación · Modificadores**; costo y margen en vivo; «Ver en POS». |
| Equipo | `/equipo` | Pestañas (segmentado o sub-nav): **Personas** (`/equipo`, ex configuracion/equipo: cuentas, contraseña, activo), **Horario** (`/equipo/horario`, ex turnos/asignacion), **Turnos** (`/equipo/turnos`, ex turnos/resumen + nuevo/editar), **Tareas** (`/equipo/tareas`), **Historial** (`/equipo/historial`), **Reportes** (`/equipo/reportes`). |
| Más | `/mas` | Lista de link-cards: **Caja** `/caja`, **Gastos** `/gastos`, **Clientes** `/clientes` (Reseñas · Puntos · Baristas), **Ajustes** `/ajustes` (Sede, Apariencia, Dispositivos), **Ver como equipo** `/turno`, **Punto de venta** `/pos`, **Menú público** `/menu` (abre en nueva pestaña), **Instalar en este dispositivo**, **Avanzado** (Modificadores, Combos, Listas de precios, Importar factura, Importación CSV, Notificaciones, Organizaciones), **Salir**. |

### 2.4 Mapa de rutas (viejo → nuevo) y redirecciones
Regla de implementación: **cada ruta vieja se convierte en una página que hace `redirect()`** (server component de 3 líneas) dentro de su propio directorio; así cada paquete es dueño de sus redirecciones y no hay un archivo compartido. Las rutas con parámetros preservan el parámetro. Las nuevas páginas se crean con `git mv` de los archivos existentes y se actualizan imports relativos.

| Vieja | Nueva | Paquete |
|---|---|---|
| `/` | sin cambio: dispositivo emparejado → `/turno`; admin → `/hoy`; staff → `/turno` | F2 |
| `/login` | único login (ver 3) | F2 |
| `/home`, `/today` | `/turno`, `/turno/tareas` | P1 |
| `/shift/[id]` | `/turno?turno=[id]` | P1 |
| `/shift/[id]/caja`, `/shift/[id]/inventario`, `/shift/[id]/novedades` | `/turno/caja`, `/turno/inventario`, `/turno?turno=[id]&novedad=1` | P1 |
| `/turno/conteo`, `/turno/caja/movimientos`, `/turno/inventario/*` | sin cambio (restyle) | P1 |
| `/pos` | sin cambio (exige persona) | F2 / P2 |
| `/numeros`, `/numeros/[fecha]` | `/hoy`, `/hoy/[fecha]` | P3 |
| `/hoy/[date]` (detalle de turnos) | `/hoy/[date]/turnos` | P3 |
| `/dashboard` | `/hoy` | P3 |
| `/shifts/[id]` | sin cambio (detalle admin de un turno; restyle) | P3 |
| `/turnos`, `/turnos/resumen`, `/turnos/resumen/nuevo`, `/turnos/resumen/[id]/editar` | `/equipo/turnos`, `/equipo/turnos/nuevo`, `/equipo/turnos/[id]/editar` | P3 |
| `/turnos/asignacion` | `/equipo/horario` | P3 |
| `/turnos/tareas`, `/turnos/historial`, `/turnos/reportes` | `/equipo/tareas`, `/equipo/historial`, `/equipo/reportes` | P3 |
| `/configuracion`, `/configuracion/sede`, `/configuracion/preferencias`, `/configuracion/pos` | `/ajustes`, `/ajustes/sede`, `/ajustes/apariencia`, `/ajustes/dispositivos` | P3 |
| `/configuracion/equipo` | `/equipo` | P3 |
| `/calificaciones`, `/baristas` | `/clientes`, `/clientes/baristas` | P3 |
| `/caja`, `/gastos`, `/organizaciones` | sin cambio (restyle) | P3 |
| `/catalogo`, `/recetas`, `/recetas?producto=X` | `/productos`, `/productos?vista=recetas`, `/productos/X` | P4 |
| `/historial` | `/inventario/movimientos` | P4 |
| `/compras` | `/inventario/pedidos` | P4 |
| `/inventario/faltantes` | `/inventario?vista=acabando` | P4 |
| `/inventario/kardex/[id]` | `/inventario/[id]` | P4 |
| `/inventario/conteos*`, `/mermas`, `/niveles`, `/sugerencias` | sin cambio (restyle) | P4 |
| `/modificadores`, `/combos`, `/precios`, `/importacion`, `/importar-factura`, `/notificaciones` | sin cambio (restyle ligero; sólo desde Más → Avanzado) | P4 |
| `/menu*`, `/c/[codigo]`, `/privacidad`, `/api/*`, `/auth/*` | **sin cambio** | — |
| nuevo `/emparejar` | pantalla de emparejamiento (ex `PosRegister` en `/pos`) | F2 |
| nuevo `/offline` | página estática de «Sin conexión» para el service worker | F1 |

`lib/supabase/middleware.ts` (`isStaffPath`) debe permitir al staff: `/`, `/turno/*`, `/pos`, `/organizaciones`, `/emparejar`, `/offline` y las rutas viejas que redirigen (`/home`, `/today`, `/shift/*`). Todo lo demás es admin.

---

## 3. Login único y sesión de persona

### 3.1 Principios
- **Dispositivo emparejado** (cookie `comanda_pos_device`, tabla `pos_devices`) = **sede**. Sólo eso. Nunca autoriza una venta o una tarea "sin nombre" desde la UI.
- **Persona** = sesión de usuario (Supabase Auth en prod / Better Auth en Neon), igual que hoy en `/turno`. Todo tick, venta, movimiento y novedad lleva `profile.id`.
- Un solo `/login` decide qué mostrar según haya o no cookie de dispositivo. Nunca se listan nombres del equipo sin cookie de dispositivo.
- La sesión dura lo que dura (Better Auth 30 días; Supabase refresca). En la tablet nadie "cierra sesión" salvo con «Cambiar persona» / «Salir de la tablet».

### 3.2 Pantallas
`/login` (server component, `app/login/page.tsx`):
1. `const device = await getPosDeviceFromCookie()` y `const user = sesión actual`.
2. Si `user` ya existe → `redirect(landingFor(user, device))` (salvo `?switch=1`, que fuerza mostrar la pantalla para cambiar de persona tras cerrar la sesión local).
3. Si `device` → **TeamLogin** (referencia «Entrar»): tarjeta centrada 600 px (teléfono: ancho completo), logo + «¿Quién eres?» + «PAYO · Matutino empieza a las 6:00» (sede + próximo turno del template, opcional) + reloj; fichas `PersonTile` del roster activo de la sede (nombre + iniciales; admins incluidos), campo Contraseña, botón grande «Entrar», «Entrar con Google», enlace «Otra cuenta» → formulario correo+contraseña. Error por ficha: «Esta cuenta entra con Google» / «Contraseña incorrecta».
4. Si no hay `device` → **PersonalLogin**: Google arriba, separador «o con contraseña», correo + contraseña, enlace «¿Es una tablet o la caja? Emparejar este dispositivo» → `/emparejar` (sólo visible si `?device=1` o en pantallas ≥ 768 para no confundir en teléfonos).

`/emparejar`: la `PosRegister` actual (código de 8 caracteres + nombre del dispositivo) con el nuevo sistema de diseño; al emparejar → `/login`.

### 3.3 Dónde cae cada uno (`landingFor`)
`lib/auth.ts` → `export function landingFor(role: "admin"|"staff", viaDevice: boolean, next?: string): string`:
- `next` válido (relativo, no `//`) → `next`.
- `viaDevice` → `/turno` (dueño incluido: en la tablet trabaja como equipo; «Ir al panel» en el perfil).
- `admin` → `/hoy`; `staff` → `/turno`.

### 3.4 Cambiar de persona / salir
- `signOutLocal()` (ya existe como `signOutTurno`, mover a `app/login/actions.ts` y reexportar): `supabase.auth.signOut({ scope: "local" })` → `redirect("/login")`. En Better Auth revoca sólo esa sesión.
- «Cambiar persona» en el POS y en el perfil de la tablet llama a lo mismo; en un dispositivo emparejado la pantalla siguiente son las fichas.
- «Salir de la tablet» (pantalla Turno entregado) = igual.
- Desemparejar el dispositivo queda sólo en `/ajustes/dispositivos` (admin) y en el POS «⋯ → Desvincular esta caja» (ya existe, con confirmación).

### 3.5 Cambios de servidor (F2)
`lib/auth.ts`
- `getSessionPerson(): Promise<{ user, profile } | null>` — no redirige (lo necesitan POS y tablet).
- `landingFor(...)` (arriba). `requireUser`/`requireAdmin` sin cambios.

`lib/pos/devices.ts` — sin cambios funcionales. (Opcional: `listDeviceRoster(device): Promise<TurnoPerson[]>` puede vivir aquí o en `lib/turno/server.ts`; elegir `lib/turno/server.ts` y exportar `listRosterForSede(admin, organizationId, restaurantId|null)` factorizado de `listTurnoRoster`.)

`lib/pos/server.ts`
- `PosActor` pasa a: `{ kind: "device"; device: PosDevice; person: { profileId: string; fullName: string; role: "admin"|"staff" } | null } | { kind: "user"; … }`.
- `loadPosContext()` / `requirePosAuth()`: con `device`, resolver además la sesión de usuario (`getSessionPerson`) y validarla contra la org del dispositivo (misma lógica que `resolveActor` en `lib/turno/server.ts` — extraer a `lib/auth-person.ts` o exportarla desde `lib/turno/server.ts`: `resolvePersonInOrg(admin, userId, organizationId)`); si pertenece → `person`, si no → `person: null`.
- `loadPosContext()` devuelve también `requiresPerson: boolean` = `device && !person`. `app/pos/page.tsx`: si `!ctx` → `redirect("/login?next=/pos")` cuando no hay dispositivo ni usuario (la pantalla de emparejar ya no vive en `/pos`); si `ctx.requiresPerson` → `redirect("/login?next=/pos")` (en dispositivo emparejado → fichas). Pasar a `PosTerminal` una prop nueva `person: { id, name, role } | null` (P2 la usa para el chip de persona y el barista por defecto).
- **Resiliencia offline**: las acciones del outbox se reproducen más tarde; si para entonces la sesión caducó, el dispositivo sigue autorizando la venta. Por eso `crearOrden`/`guardarPendiente` aceptan un campo opcional `creadoPor: uuid` que el cliente pone en el payload al crear la orden (el id de la persona que estaba en sesión). Servidor (`app/pos/actions.ts`, F2 toca sólo estas líneas): `created_by = actor.kind === "user" ? actor.profileId : (persona de la sesión ?? creadoPor validado como miembro de la org ?? null)`. `barista_id`: si viene vacío y la persona en sesión es staff del equipo (`catalog.equipo`), usar la persona.

`lib/turno/server.ts`
- `loadTurnoGate()`: `needs_login` ya no renderiza un formulario propio; las páginas de `/turno/*` hacen `redirect("/login?next=<ruta>")` (F2 cambia `app/turno/page.tsx`, `app/turno/caja/page.tsx`, `app/turno/inventario/page.tsx` y las demás páginas `/turno/**` sólo en la rama `needs_login`/`unpaired`; P1 después las reorganiza). `unpaired` sin usuario → `redirect("/login?next=…")` también (personal login sirve: la sede se resuelve por membresía, como ya hace el gate sin dispositivo).
- Exportar `listRosterForSede` y `resolvePersonInOrg` (reutilizados por el login y el POS).

`lib/supabase/middleware.ts`
- `isPublic`: añadir `/emparejar`, `/offline`, `/sw.js`. `/pos` y `/turno/*` siguen públicos aquí (la cookie de dispositivo no se puede resolver sin DB en el proxy); la página decide.
- `isStaffPath`: lo dicho en 2.4.
- `proxy.ts` (F1): el matcher excluye además `sw\\.js` y `offline`.

`lib/neon/client.ts` (única excepción al "no tocar lib/neon"): añadir `adminApi.getUserById(id)` (lee `ba_user` por id → `{ data: { user: { id, email } } }`) para que `signInAsMember({ profileId, password })` pueda resolver el correo en ambos backends (`admin.auth.admin.getUserById` existe en Supabase).

`app/login/actions.ts`
- `signInAsMember(prev, formData{ profileId, password, next })`: comprobar que hay cookie de dispositivo y que `profileId` está en el roster de esa sede (nunca aceptar ids arbitrarios), resolver correo con `getUserById`, `signInWithPassword`, `redirect(landingFor(...))`. Mensajes: «Contraseña incorrecta.», «Esta cuenta entra con Google; toca "Entrar con Google".», «Demasiados intentos. Espera un minuto.».
- `signInWithPassword` (existente): redirige con `landingFor`.
- `signOut` (global) y `signOutLocal` (local).
- Google: sin cambios (`GoogleSignInButton`), `callbackURL`/`next` → `/` que ya decide por rol (F2 actualiza `app/page.tsx` para mirar la cookie de dispositivo primero).

### 3.6 Datos
Sin migraciones. `ordenes.created_by`, `ordenes.barista_id`, `task_completions.completed_by` ya existen y pasan a estar siempre poblados cuando hay persona.

---

## 4. PWA

- **Un manifest de app** `public/manifest.json` (F1): `id: "/"`, `name: "Comanda · PA'YO"`, `short_name: "Comanda"`, `start_url: "/?source=pwa"`, `scope: "/"`, `display: "standalone"`, `orientation: "any"`, `background_color: "#f5f5f4"`, `theme_color: "#f5f5f4"`, `lang: "es"`, iconos existentes (`/icons/icon-192.png`, `icon-256`, `icon-512`, `icon-maskable-512.png`, SVGs) — ya son la marca mano-y-taza; `shortcuts`: Punto de venta `/pos`, Caja `/turno/caja`, Inventario `/turno/inventario`, Hoy `/hoy`.
- **El manifest del POS no se toca** (`app/pos/manifest.webmanifest/route.ts`, `id: "/pos"`): la caja Windows sigue instalada como app aparte y arranca con el `.bat`.
- **Service worker nuevo** `public/sw.js`, registrado con `scope: "/"` desde `components/pwa/register-sw.tsx` (montado en `app/layout.tsx`; sólo en producción; **no registrar cuando `location.pathname` empieza por `/pos`**, el terminal registra `pos-sw.js`). Convivencia: la especificación elige la registración con el scope más largo que coincida, así que `/pos*` queda bajo `pos-sw.js` (scope `/pos`) y todo lo demás bajo `sw.js`. Reglas de `sw.js`: ignorar `method !== GET`, `/pos*`, `/api/*`, peticiones RSC (`RSC: 1` / `_rsc`), `/_next/image` se trata como asset; `/_next/static/*` cache-first; iconos, fuentes, `manifest.json` stale-while-revalidate; **navegaciones network-only con fallback** a `/offline` precacheado en `install` (no se cachea HTML de páginas con datos: evita mostrar números viejos o la sesión de otra persona). Versionar caches con prefijo `app-` (el POS usa `pos-`), y en `activate` borrar sólo las `app-*` viejas.
- `/offline` (`app/offline/page.tsx`, estático): «Sin conexión» + «Reintentar» + enlace «Abrir el punto de venta» (que sí funciona offline si fue cacheado por `pos-sw.js`).
- **Aviso de instalación** `components/pwa/install-banner.tsx`: usa `lib/pwa/desktop.ts` (`useDesktopApp`, `installApp`) para Android/Chrome/Edge; en iOS (sin `beforeinstallprompt`) muestra un sheet con 2 pasos (Compartir → «Añadir a pantalla de inicio») detectando `navigator.standalone === undefined && /iphone|ipad/i`. Aparece como link-card en el perfil / en «Más» siempre, y como banner discreto en la primera visita (descartable; `localStorage: comanda:install-dismissed` 30 días). No aparece si ya está en `display-mode: standalone`.
- **iOS meta** (en `app/layout.tsx` `metadata`/`viewport`): `appleWebApp.capable`, `statusBarStyle: "default"` (fondo claro), `title: "Comanda"`, `apple-touch-icon` 180 ya existe, `viewportFit: "cover"`, `themeColor` con `media` para claro `#f5f5f4` y oscuro `#121212`. La barra de tabs y los headers usan `padding-bottom: env(safe-area-inset-bottom)` / `padding-top: env(safe-area-inset-top)`.
- `proxy.ts` matcher: excluir `sw\\.js`, `offline`.

---

## 5. Sistema de diseño (F1)

### 5.1 Tokens (copiados de `app.css` de la referencia) → `app/globals.css`
Definir en `:root` (claro) y en `:root[data-theme="oscuro"]` + `@media (prefers-color-scheme: dark) { :root:not([data-theme="claro"]) {…} }`:

| Token | Claro | Oscuro |
|---|---|---|
| `--bg` | `#f5f5f4` | `#121212` |
| `--surface` | `#ffffff` | `#1c1c1c` |
| `--surface-2` | `#f0f0ef` | `#262626` |
| `--line` | `#e4e4e2` | `#2e2e2e` |
| `--text` | `#171717` | `#f2f2f2` |
| `--muted` | `#666666` | `#a3a3a3` |
| `--brand` | `#f1a900` | `#f1a900` |
| `--on-brand` | `#171717` | `#171717` |
| `--brand-soft` | `#fdf3d6` | `rgba(241,169,0,.14)` |
| `--ok` / `--ok-soft` | `#1f7a3a` / `#e7f4ea` | `#5fcf7a` / `rgba(95,207,122,.12)` |
| `--late` / `--late-soft` | `#c0392b` / `#fbeae8` | `#ff7b6b` / `rgba(255,123,107,.12)` |
| `--strong` / `--on-strong` | `#171717` / `#ffffff` | `#f2f2f2` / `#121212` |
| `--focus` | `#171717` | `#f1a900` |

Medidas: `--r-card: 16px`, `--r-btn: 12px`, `--r-sheet: 20px`, `--r-chip: 999px`; `--h-control: 56px`, `--h-control-sm: 48px`, `--h-control-lg: 72px`, `--h-row: 76px`, `--h-head: 76px` (teléfono 56), `--h-tabs: 84px` (teléfono 64 + safe-area). Tipografía Inter (400/600/700) vía `next/font/google` en `--font-sans`; escala: h1 28/700/-0.01em, h2 20/700, big 48/700/tabular, title 17/600, sub 14 muted, label 13/600 muted, body 16/1.4. Foco visible: `outline: 3px solid var(--focus); offset 2px`.

`@theme inline` de Tailwind 4: exponer `--color-bg, --color-surface, --color-surface-2, --color-line, --color-text, --color-muted, --color-brand, --color-on-brand, --color-brand-soft, --color-ok, --color-ok-soft, --color-late, --color-late-soft, --color-strong, --color-on-strong`, `--radius-card/-btn/-sheet`, `--font-sans`, y conservar `--font-mono` (JetBrains Mono: números tabulares en recibos/etiquetas/kardex), `--font-slab` (Dela Gothic One: sólo marca y menú público), `--font-frase` (etiqueta).

**Alias de compatibilidad** (clave para que lo no rediseñado se vea bien el día uno): en `:root` definir `--paper: var(--bg); --paper-lt: var(--surface); --paper-dk: var(--surface-2); --ink: var(--text); --ink-2: var(--text); --rule: var(--line); --rule-soft: var(--line); --red: var(--late); --red-dk: var(--late); --green: var(--ok); --amber: var(--brand); --stamp: var(--late)`. Eliminar los 5 temas de papel; `comanda-theme` cookie acepta `claro | oscuro | auto` (valores viejos → `papel/sepia/indigo/rojo` = claro, `carbon` = oscuro; `restaurants.theme` en DB no se migra: se mapea en `lib/data/sede.ts`). `.cmd-paper`/`.cmd-paper-lt` pasan a fondo plano (sin rayas ni viñeta); `.cmd-noise` sin efecto; `.cmd-btn` → 56 px / radio 12 / Inter; `html, body { font-family: var(--font-sans) }` (el mono sólo donde se pida con `font-mono`/`cmd-num`). `.turno-ui` se vuelve no-op. Conservar `input{font-size:16px}` y `min-height:44px` para botones/enlaces.

### 5.2 Componentes `components/ui/*` (todos `"use client"` salvo los puramente presentacionales; `cn` de `lib/utils`)
| Componente | Props clave |
|---|---|
| `Button` | `variant: "primary"\|"ghost"\|"strong"\|"danger"`, `size: "sm"\|"md"\|"lg"`, `block?`, `loading?`, `icon?`, `href?` (renderiza `Link`), resto de `<button>` |
| `IconButton` | `label` (aria), `size`, `href?` |
| `Card` | `tight?`, `as?`, `aria-labelledby` |
| `LinkCard` | `title`, `sub?`, `href`, `badge?`, `icon?`, `tone?: "neutral"\|"late"\|"ok"` |
| `Row` | `time?`, `title`, `desc?` (2 líneas, `full?`), `trailing?`, `href?`/`onClick?`, `muted?` |
| `Check` | `done`, `kind: "check"\|"photo"`, `onToggle`, `disabled?`, `label` |
| `Pill` | `tone: "neutral"\|"ok"\|"late"\|"brand"`, `children` |
| `Segmented` | `options: {value,label,count?}[]`, `value`, `onChange`, `size?` |
| `Steps`, `StepItem` | `items: {n,title,sub,state:"todo"\|"now"\|"done",href?}[]` |
| `FlowHeader` | `title`, `sub`, `step`, `total`, `backHref`, `right?` (pill/reloj) |
| `ProgressBar` | `value` (0–1), `label` |
| `Field`, `TextArea`, `SearchField` | `label?`, `error?`, `hint?`, resto de `<input>` |
| `Chips`, `Chip` | `pressed`, `onClick` |
| `Counter` | `value`, `onChange`, `min?`, `step?`, `inputMode="numeric"` |
| `Keypad` | `onKey(k)`, `keys?` (dígitos, `⌫`, `C`, `00`) |
| `Sheet` | `open`, `onClose`, `title`, `side: "bottom"\|"center"` (teléfono: bottom; ≥ 640: centrado 760 px), `footer?`, bloqueo de scroll, cierre con Escape/scrim/swipe-down |
| `BigNumber` | `label`, `value`, `sub?`, `size?` |
| `StatTile` | `label`, `value`, `delta?`, `href?` |
| `Avatar` | `name` (iniciales con `makeInitials`), `size` |
| `PersonTile` | `name`, `initials`, `pressed`, `onClick` |
| `EmptyState` | `title`, `text?`, `action?` |
| `Banner` | `tone`, `onClose?` |
| `Toast` + `useToast` | `message`, `tone` |
| `Money` | `value` (COP, `posMoney`), `signed?` |
| `TabBar` | `items: {href,label,icon,badge?}[]`, `current` (de `usePathname`), safe-area |
| `TopBar` | `title`, `sub?`, `logo?`, `actions?`, `who?: {name,initials}`, `clock?` |
| `PageHeader` | `title`, `sub?`, `back?`, `actions?` |
| `AppShell` | `nav: NavItem[]`, `profile: {name,initials,role}`, `variant: "equipo"\|"dueno"`, `children`; barra inferior siempre en `equipo`; rail lateral `≥ lg` en `dueno` |
| `Clock` | `tz` (reloj vivo, SSR seguro: `serverNow` prop) |

Iconos: `lucide-react` (ya instalado). Objetivos táctiles ≥ 44 px, controles 56 px. Todo con tokens; **nunca** `display` inline junto a utilidades responsive (ver memoria).

### 5.3 `lib/nav/*` (F1)
- `lib/nav/items.ts`: `EQUIPO_TABS` (Hoy, Tareas, Caja, Inventario, POS), `DUENO_TABS` (Hoy, Inventario, Productos, Equipo, Más), `MAS_ITEMS`, `AVANZADO_ITEMS`, con `href`, `label`, `icon`, `match(pathname)`.
- `lib/nav/active.ts`: `activeTabFor(pathname, items)`.

---

## 6. Velocidad: POS · Productos/Recetas · Inventario

### 6.1 POS (P2) — rediseñar UI y flujos sin tocar el motor
Datos: 1,82 ítems/orden, ~12 productos concentran el volumen, efectivo 440 / transferencia 316 / tarjeta 8, 16,6 % canceladas, 892/922 bajo cuenta admin.
1. **Favoritos primero**: `catalog.top` (ya calcula top-12 a 30 días) + ★ como pestaña inicial siempre que haya datos; tiles grandes (tablet: 6×2 visibles sin scroll; teléfono 390: 3 columnas, 104 px). Toque = añadir; mantener = receta (existe).
2. **Cobro en un toque**: pie del ticket con dos botones de 72 px: **«Efectivo»** y **«Transferencia»** (+ «Otro» → tarjeta / dividir / pagar después). Transferencia completa la venta directamente (`posStore.set({ payMethod })` + `completeSale()`); Efectivo abre el teclado con el total como «exacto» y atajos ($20.000/$50.000/redondeo), confirma con un toque. Reutiliza `TenderScreen` reducido; la pantalla de dividir por persona permanece bajo «Otro».
3. **Persona y barista**: chip de persona en la barra superior (nombre de la sesión; toque → «Cambiar persona» = `signOutLocal` → `/login`). `barista` por defecto = persona en sesión si es staff del `catalog.equipo` (un toque menos; el picker sigue disponible).
4. **Cancelaciones**: al cancelar, chips de motivo (Error al marcar · Cliente se fue · Duplicado · Prueba) que se anteponen a `notes` (sin cambio de esquema) para entender el 16,6 %.
5. **Chrome**: barra superior = ← volver (a `/turno` o `/hoy` según rol), buscador, Pendientes (badge), Persona, «⋯» (Etiquetas, Puntos, Reseñas, Impresora, Instalar/Pantalla completa, Asistente de voz, Desvincular). El asistente IA deja de ocupar espacio permanente (créditos agotados; Groq opcional).
6. **Teléfono**: layout estrecho existente (<900: barra de carrito + ticket deslizable) pulido con los componentes nuevos; cobro a pantalla completa con botones grandes; pendientes como lista de tarjetas.
7. **Pendientes/Completados**: tarjetas con check de entrega (existe), restyle.
Intocable: `pos-store.ts` (salvo añadir `creadoPor`/`person` al estado y al payload), `pos-live.ts`, `pos-window.ts`, outbox, `registerOfflineWorker`, `lib/printer/*`, etiquetas, relay.

### 6.2 Productos y recetas (P4)
- `/productos`: una lista buscable que sustituye a Catálogo + Recetas; cada fila: nombre, categoría, precio, costo de receta, margen (regla 55 % de `lib/cost`), estado de stock de la receta, ★ favorito. Filtros por categoría (segmentado scrollable). «Nuevo producto» = sheet con 4 campos (nombre, categoría, precio, SKU auto) y «Añadir receta después».
- `/productos/[id]`: ficha con segmentado **Datos · Receta · Preparación · Modificadores**. Receta: líneas editables en línea (`Counter` 44 px para cantidad, unidad visible, costo por línea), buscador de insumos con «recientes/frecuentes» arriba, «Duplicar receta de…», costo total y margen en vivo (`lib/cost`), guardado por línea (acciones existentes de `app/(admin)/recetas/actions.ts`). Preparación: pasos numerados editables (`PreparacionEditor`). Modificadores: grupos aplicados + enlace a `/modificadores`. Botón «Ver en POS» (`/pos?buscar=<sku>` — P2 lee `?buscar`).
- Móvil primero: formulario de una columna, botones de guardar pegajosos al fondo.

### 6.3 Inventario del dueño (P4) — cortar los 848 ajustes
- `/inventario` abre con **Por revisar**: ítems en negativo (hoy 20), costos sin precio (14), conteos por aprobar (un toque «Aprobar» usa `conteos/actions.ts`), sugerencias del equipo (aplicar/rechazar), últimas mermas. Debajo, **buscador** y lista por zona (misma agrupación que la tablet) con stock + unidad + nivel.
- **«Corregir»** en cada fila → `Sheet` con `Keypad`: «¿Cuánto hay?» (cantidad total, no delta; se calcula el delta como hace `adjustIngredienteStock`), chips de **motivo**: «Conté» (→ `ajuste`, nota «Conteo»), «Se dañó / venció» (→ movimiento `merma` con `lib/inventario/mermas`), «Compra sin registrar» (→ `import` con precio opcional, `lib/compras/recepcion`), «Error de receta» (→ `ajuste` + enlace a la receta más vendida que usa el insumo). Un toque «Guardar». Resultado: cada corrección queda clasificada y el kardex deja de ser una lista de «Ajuste manual».
- `/inventario/[id]`: kardex (existente) + corregir + nivel/proveedor + «ventas desde el último conteo».
- `/inventario/pedidos`: Por pedir (faltantes abiertos agrupados por proveedor con `wa.me`, existente en `/compras`) + pedidos en camino + recibir; enlace «Desde una foto» a `/importar-factura`.
- La tablet mantiene su pantalla (P1 restyle) y su conteo rápido; el dueño aprueba desde Por revisar.

---

## 7. Paquetes de trabajo y olas

Reglas comunes para todos los paquetes
- Rama `dev`. Un commit por unidad lógica (conventional commits), push inmediato; no tocar `main` hasta la Ola 3.
- Copias en español, 390 px primero, objetivos táctiles ≥ 44 px, sin `display` inline junto a utilidades responsive, fechas deterministas en SSR (ver memorias).
- Sólo se edita lo listado en «Propiedad». Si algo necesario está fuera, se deja un `TODO(paquete):` en un comentario y se reporta; no se edita.
- Aceptación mínima en cada paquete: `npx tsc --noEmit` limpio, `pnpm vitest run` verde, `pnpm lint` sin errores nuevos, y `node .e2e/neon/crawl.mjs` (read-only; con `BASE=https://dev.co-manda.com` tras desplegar) sin páginas rotas en las rutas del paquete. Capturas Playwright de solo lectura a 390×844 y 1280×800 en `.e2e/neon/shots/<paquete>/`. Scripts e2e nuevos en `.e2e/neon/<paquete>-*.mjs`; los que escriben: preferir la sede «Taller»; la DB de dev es una COPIA en Neon (no producción), así que se puede escribir a cualquier hora. Excepción: NO subir fotos en e2e — el storage todavía es el de producción (Supabase).
- `.e2e/neon/crawl.mjs` sólo lo edita la Ola 3.

### Ola 1 — fundaciones (dos paquetes en paralelo; deben aterrizar antes de la Ola 2)

#### F1 · Sistema de diseño + shell + PWA (pequeño y rápido)
Objetivo: tokens, componentes, shells de navegación, manifest/SW, página offline. Al terminar, toda la app se ve neutra (alias) aunque nada esté rediseñado.
Propiedad (crear/editar): `app/globals.css`, `app/layout.tsx` (Inter, tema claro/oscuro/auto, meta PWA/iOS, montaje de `RegisterSw` e `InstallBanner`), `components/ui/**`, `components/shell/**` (si se separa de ui), `components/pwa/**`, `lib/nav/**`, `lib/theme.ts` (cookie → tema), `public/manifest.json`, `public/sw.js`, `app/offline/page.tsx`, `proxy.ts` (sólo el matcher), `lib/data/sede.ts` (mapeo de tema), `app/(admin)/layout.tsx` y `app/(admin)/_components/**` (reemplazar sidebar/header por `AppShell variant="dueno"` con `DUENO_TABS`; borrar los mocks de secciones que ya no se usen en nav; `lib/mock/*` se deja intacto porque exporta tipos usados por otras pantallas), `app/(admin)/mas/page.tsx` (lista estática de link-cards con los enlaces de la tabla 2.3 — las rutas destino existen hoy con sus nombres viejos; P3/P4 las migran y ésta página se actualiza en Ola 3), `docs/redesign/DESIGN.md` (guía corta de uso de componentes).
No tocar: `app/turno/**`, `app/(staff)/**`, `app/pos/**`, `app/login/**`, `lib/auth.ts`, `lib/pos/**`, `lib/turno/**`, `lib/supabase/**`, `lib/neon/**`, `public/pos-sw.js`, `app/pos/manifest.webmanifest/**`, `app/menu/**`, `app/c/**`, páginas de módulos.
Dependencias: ninguna.
Aceptación: además de lo común, `AppShell` renderiza en 390/768/1280/1440 sin scroll horizontal; `/offline` se sirve estático; `sw.js` no intercepta `/pos*` ni POST (test manual en dev deploy: DevTools → Application → dos registraciones, scopes `/` y `/pos`); modo oscuro vía cookie y vía `prefers-color-scheme`; crawl completo sin regresiones (todas las páginas siguen renderizando con los alias).

#### F2 · Login único + sesión de persona
Objetivo: lo descrito en la sección 3. UI con tokens CSS (variables) y clases Tailwind simples; si F1 ya publicó `components/ui`, usarlos; si no, estilos propios mínimos coherentes con 5.1 (P1/P2 los reemplazan después).
Propiedad: `app/login/**`, `app/emparejar/**`, `app/page.tsx`, `lib/auth.ts`, `lib/auth-person.ts` (nuevo: `resolvePersonInOrg`, `listRosterForSede`), `lib/pos/server.ts`, `lib/pos/devices.ts` (si hace falta), `lib/turno/server.ts` (gate + exports), `lib/supabase/middleware.ts`, `lib/neon/client.ts` (sólo `adminApi.getUserById`), `app/pos/page.tsx` (gate de persona + prop `person`), `app/pos/actions.ts` (sólo `created_by`/`barista_id`/`creadoPor` en `crearOrden` y `guardarPendiente`, y el schema zod correspondiente), `app/pos/pos-store.ts` (sólo: campo `person` en el estado + `creadoPor` en los payloads de `completeSale`/`savePending`), `app/pos/pos-terminal.tsx` (sólo: aceptar la prop `person` y sembrarla en el store — nada de UI), `app/turno/auth-actions.ts` (reexportar desde login/actions), `app/turno/_components/turno-login.tsx` (borrar), `app/turno/unpaired.tsx` (borrar), páginas `app/turno/**/page.tsx` sólo en sus ramas `unpaired`/`needs_login` → `redirect("/login?next=…")`, `app/pos/pos-register.tsx` (mover a `app/emparejar/`), `.e2e/neon/f2-login.mjs`, `.e2e/neon/session.mjs` (si necesita soportar el nuevo flujo).
No tocar: estilos globales, `components/ui`, resto de `app/pos/**` (UI), `app/turno/**` fuera de las ramas indicadas, módulos admin.
Dependencias: ninguna (coordina con F1 sólo por nombres de tokens).
Aceptación: e2e Playwright en dev deploy: (a) sin cookie de dispositivo → `/login` muestra Google + correo, nunca nombres; (b) con cookie de dispositivo (usar `.e2e/pos-pairing.mjs` como base para emparejar la sede Taller) → fichas del equipo, contraseña correcta → `/turno`; incorrecta → mensaje; (c) `/pos` con dispositivo y sin persona → `/login` con fichas; con persona → terminal; (d) venta de prueba en Taller (`.e2e/neon/pos-sale.mjs` adaptado) deja `ordenes.created_by` = persona y `barista_id` por defecto; (e) «Cambiar persona» cierra sólo la sesión local; (f) admin en teléfono → `/hoy`, staff → `/turno`; (g) `/home`, `/today` siguen respondiendo (aún sin redirigir; P1) y el middleware no bloquea `/turno/*` al staff. `pnpm vitest run` incluye tests puros nuevos para `landingFor` y el validador de `creadoPor`.

### Ola 2 — cuatro paquetes en paralelo (requieren F1 y F2 fusionados)

#### P1 · App del equipo (tablet + teléfono) `/turno/*`
Objetivo: las 11 pantallas de la referencia sobre los datos y acciones existentes. Hoy, Tareas, Novedad (sheet), Abrir el turno (pasos), Cerrar el turno (pasos: tareas → conteo rápido → arqueo → base → entregar), Turno entregado, Caja (restyle de `caja-app.tsx`), Inventario (restyle de `acabando-screen.tsx` y subpantallas), modo oscuro. Redirecciones de `/home /today /shift/*`.
Propiedad: `app/turno/**` (todo), `app/(staff)/**` (convertir cada `page.tsx` en redirect; eliminar `layout.tsx` o dejarlo vacío), `components/turno/**` (nuevo, si se necesita compartir entre pantallas), `lib/turno/*.ts` **excepto `server.ts`** (puros: `blocks.ts`, `steps.ts`, `state.ts` — pueden extenderse con funciones puras + tests para «Ahora», pasos de apertura/cierre), `components/photo-capture.tsx`, `components/task-row.tsx`, `components/task-todo-row.tsx`, `components/ad-hoc-task-row.tsx`, `components/inventario/**`, `.e2e/neon/p1-*.mjs`.
No tocar: `lib/turno/server.ts` (si falta un dato, añadir una función de lectura nueva en `lib/turno/reads.ts` propio), `app/pos/**`, `app/(admin)/**`, `components/ui/**` (pedir cambios a F1 vía TODO), `lib/caja/*` y `lib/inventario/*` (sólo lectura; nuevas funciones puras en archivos nuevos `lib/turno/*` si hacen falta), acciones existentes (`app/turno/actions.ts`, `app/turno/caja/actions.ts`, `app/turno/inventario/actions.ts` sí son suyas, pero sin cambiar firmas usadas por el dueño).
Dependencias: F1 (ui/shell), F2 (gate → `/login`).
Aceptación: capturas 390×844 y 1280×800 de las 11 pantallas; e2e read-only `p1-turno-shots.mjs`; e2e de escritura en Taller fuera de horario: abrir turno (validar base → marcar tareas → abrir), novedad, cerrar (conteo → arqueo → base → entregar) usando como base `.e2e/turno-tablet.mjs`, `.e2e/caja-modulo.mjs`, `.e2e/acabando.mjs`; `/home`, `/today`, `/shift/<id>` redirigen; `turnoProgress` y nuevas funciones puras con tests.

#### P2 · POS: UI y flujos de venta
Objetivo: sección 6.1 con el motor intacto.
Propiedad: `app/pos/pos-terminal.tsx` (puede dividirse en `app/pos/_components/*.tsx`: `top-bar`, `catalog`, `ticket`, `tender`, `ordenes`, `sheets`, `menu-mas`…), `app/pos/pos-store.ts` **sólo** para: estado `person` (ya sembrado por F2), `cancelReason`, preselección de método y la función `payNow(method)` que encadena `startTender` + `completeSale` para transferencia; `app/pos/actions.ts` sólo `cancelarPendiente` (motivo en `notes`), `lib/pos/types.ts` (tipos aditivos), `lib/pos/cart.ts`/`pagos.ts` sólo con funciones puras nuevas + tests, `.e2e/neon/p2-*.mjs`, `.e2e/pos-*.mjs` existentes si deben adaptarse a selectores nuevos.
No tocar: `lib/printer/**`, `public/pos-sw.js`, `app/pos/manifest.webmanifest/**`, `app/pos/pos-live.ts`, `app/pos/pos-window.ts`, outbox (`hydrateOutbox/runOutbox/queuedOrders`), `completeSale`/`savePending`/`paySplit` internals, `lib/pos/server.ts`, `lib/pos/devices.ts`, `app/pos/page.tsx`, `lib/ai/**`.
Dependencias: F1 (tokens; el POS puede seguir con su `POS_CSS` pero debe pasar a tokens nuevos; usar `components/ui` donde encaje: `Button`, `Sheet`, `Keypad`, `Pill`, `Segmented`), F2 (`person`).
Aceptación: capturas 390×844, 800×1280 (tablet vertical), 1280×800, 1920×1080; `.e2e/pos-register.mjs`, `pos-pendientes.mjs`, `pos-dividir.mjs`, `pos-offline.mjs`, `pos-relay.mjs` (con impresora falsa) pasan en Taller fuera de horario; venta en efectivo en ≤ 3 toques desde Favoritos (añadir → Efectivo → Confirmar exacto) y transferencia en 2 (añadir → Transferencia); el outbox sigue reproduciendo ventas offline con `creadoPor`; Lighthouse PWA del POS sin regresión; sin regresiones en impresión (prueba manual del dueño con la Niimbot, hard-reload `/pos`).

#### P3 · Panel del dueño: Hoy, Equipo, Más (Caja, Gastos, Clientes, Ajustes)
Objetivo: sección 2.3 para Hoy/Equipo/Más y redirecciones de `/numeros /dashboard /turnos /configuracion /calificaciones /baristas`.
Propiedad: `app/(admin)/hoy/**`, `app/(admin)/numeros/**` (fusionar en hoy; dejar redirects), `app/(admin)/dashboard/**` (redirect), `app/(admin)/turnos/**` (redirects) → `app/(admin)/equipo/**` (nuevo, `git mv` de las pantallas), `app/(admin)/configuracion/**` (redirects) → `app/(admin)/ajustes/**`, `app/(admin)/configuracion/equipo/**` → `app/(admin)/equipo/page.tsx`, `app/(admin)/calificaciones/**` + `app/(admin)/baristas/**` (redirects) → `app/(admin)/clientes/**`, `app/(admin)/caja/**`, `app/(admin)/gastos/**`, `app/(admin)/shifts/**`, `app/organizaciones/**`, `app/(admin)/mas/page.tsx` (actualizar enlaces a las rutas nuevas), `lib/numeros/**`, `lib/db/reports.ts`, `lib/db/assignments.ts`, `lib/db/shifts.ts`, `lib/db/tasks.ts`, `lib/db/roster.ts`, `lib/db/puestos.ts`, `lib/caja/**` (sólo funciones de lectura nuevas), `lib/gastos/**`, `lib/calificaciones/**`, `lib/baristas/**`, `.e2e/neon/p3-*.mjs`.
No tocar: `app/(admin)/layout.tsx` y `_components` (F1), `app/(admin)/{catalogo,recetas,inventario,historial,compras,modificadores,combos,precios,importacion,importar-factura,notificaciones}/**` (P4), `app/turno/**`, `app/pos/**`, `lib/inventario/**`, `lib/db/{ingredients,recetas,productos,movements,costos-pendientes,combos,modificadores,precios}.ts`.
Dependencias: F1, F2.
Aceptación: `/hoy` en 390 y 1280 con todos los bloques; `/hoy/<fecha pasada>`; `/hoy/<fecha>/turnos` conserva «revisado» e inmediatas; `/equipo` permite crear cuenta con contraseña y restablecerla (flujo del login único); `/equipo/horario` usable en teléfono (asignación por día en lista, grid en escritorio); redirects verificados; `.e2e/numeros.mjs`, `.e2e/hoy-mobile.mjs`, `.e2e/turnos.mjs`, `.e2e/gastos.mjs` adaptados en `.e2e/neon/p3-*`.

#### P4 · Productos e Inventario del dueño
Objetivo: secciones 6.2 y 6.3 y redirecciones de `/catalogo /recetas /historial /compras /inventario/faltantes /inventario/kardex`.
Propiedad: `app/(admin)/productos/**` (nuevo; `git mv` desde catalogo/recetas), `app/(admin)/catalogo/**` y `app/(admin)/recetas/**` (redirects), `app/(admin)/inventario/**` (reescribir `inventario-client.tsx` de 2.683 líneas en componentes `_components/*`), `app/(admin)/historial/**` (redirect) → `app/(admin)/inventario/movimientos/**`, `app/(admin)/compras/**` (redirect) → `app/(admin)/inventario/pedidos/**`, `app/(admin)/{modificadores,combos,precios,importacion,importar-factura,notificaciones}/**` (restyle ligero con `PageHeader`), `lib/db/{ingredients,recetas,productos,movements,costos-pendientes,combos,modificadores,precios}.ts`, `lib/inventario/**` (funciones nuevas + tests; no romper las que usa la tablet), `lib/compras/**`, `lib/cost.ts`, `lib/notificaciones.ts`, `lib/importacion.ts`, `.e2e/neon/p4-*.mjs`.
No tocar: `app/turno/**`, `app/pos/**`, `lib/pos/**` (el catálogo del POS lee `lib/pos/catalog.ts`: no cambiar su contrato), P3 y F1 files.
Dependencias: F1, F2.
Aceptación: «Corregir» crea el movimiento del tipo correcto según motivo (verificar en kardex) en Taller fuera de horario; receta editable en línea con costo/margen correcto (tests de `lib/cost`); `/productos/<id>` para un producto sin receta ofrece crearla; `/inventario` «Por revisar» muestra negativos y conteos pendientes; redirects verificados; `.e2e/recetas.mjs`, `.e2e/stock.mjs`, `.e2e/kardex.mjs`, `.e2e/compras.mjs`, `.e2e/niveles.mjs` adaptados.

### Ola 3 — integración (un agente)
- Actualizar `.e2e/neon/crawl.mjs` con las rutas nuevas (y las viejas para comprobar redirects); correr crawl como dueño y staff en dev deploy.
- Barrido de enlaces internos a rutas viejas (`grep -rn '"/catalogo\|"/recetas\|"/numeros\|"/turnos\|"/configuracion\|"/home"\|"/today"\|"/shift/'`) y corrección a las nuevas (fuera de las páginas de redirect).
- Revisar `app/(admin)/mas/page.tsx`, `lib/nav/items.ts` y `TabBar` badges con datos reales (atrasadas, pendientes).
- Lighthouse PWA (instalable, offline fallback) en `/` y `/pos`; prueba de instalación en Android y iPhone; prueba del `.bat` de la caja (abre `/pos`, pide persona una vez, imprime).
- Eliminar código muerto (temas de papel, `comanda-module-nav`, `admin-sidebar-nav`, primitivos `Stamp/Scribble/Folio` si ya no se usan; `Wordmark` se conserva para el menú si lo usa).
- Merge `dev` → `main` (`--no-ff`) tras verificación del dueño; recordar que prod sigue en Supabase (el login único debe probarse también ahí: `auth.admin.getUserById`, `signOut({scope:"local"})`).

---

## 8. Riesgos y lo que NO se cambia ahora

Riesgos
1. **Sesión caducada en la tablet/caja en pleno turno** → la UI pide persona otra vez. Mitigación: Better Auth 30 días; en Supabase el refresh token vive mientras haya red; el outbox lleva `creadoPor` para no perder atribución. Vigilar si molesta y añadir después un "bloqueo por inactividad" con PIN (fuera de alcance).
2. **Dos service workers**: `sw.js` (scope `/`) y `pos-sw.js` (scope `/pos`). Si `sw.js` cachea HTML o intercepta `/pos`, el POS offline se rompe. Regla: `sw.js` nunca cachea navegaciones ni toca `/pos*`, `/api/*`, RSC; prefijos de cache distintos.
3. **Alias de tokens**: pantallas viejas que usaban `--amber` para avisos se verán amarillo-marca (aceptable y temporal); textos con `--ink-2` pierden un matiz. Revisar en la Ola 3.
4. **Renombrar rutas** rompe marcadores/accesos del dueño: por eso toda ruta vieja redirige y el PWA `start_url` es `/`.
5. **Prod (Supabase) vs dev (Neon)**: el login único usa `admin.auth.admin.getUserById` (Supabase) / `ba_user` (shim). Probar en ambos antes de `main`.
6. **Tamaño de los archivos a reescribir** (`pos-terminal.tsx` 3.170, `inventario-client.tsx` 2.683): dividir en componentes dentro del directorio del paquete; no mover lógica a `lib` compartida en esta fase.
7. **Fotos**: el storage aún es Supabase de producción; los e2e no suben fotos. La DB de dev es copia (se refresca con `.e2e/neon/setup-dev.sh`).
8. **Google en Neon**: configurado (cliente propio del dueño) en local y en dev.co-manda.com; sólo funciona en esos dos orígenes.

No se cambia ahora
- Esquema de base de datos y RLS; migraciones = 0.
- Motor del POS, impresión Niimbot, relay de etiquetas, manifest del POS, `.bat` de arranque.
- Menú público, calificaciones por QR, `/c/[codigo]`, `/privacidad`, fuentes Dela Gothic One/Nority/Delight.
- `lib/neon/**` salvo `getUserById`; `lib/supabase/{server,admin,client}.ts`.
- Lógica de dominio en `lib/*` (costos, arqueo, base, conteo, niveles): sólo lecturas nuevas y funciones puras con tests.
- WhatsApp, cron de turnos, importación CSV, listas de precios, combos (se conservan tal cual, sin navegación).
- No se introducen features sin dato que las respalde (p. ej. propinas, mesas, reservas, multi-sede UI).

---

## Apéndice A — Pantallas de la referencia → rutas
| Board | Ruta nueva | Notas |
|---|---|---|
| 1 Hoy | `/turno` | Ahora + Caja + Acabando + Cierre; tabs |
| 2 Tareas | `/turno/tareas` | Segmentado Pendientes/Hechas |
| 3 Novedad | sheet (`?novedad=1`) | Chips de tipo + foto |
| 4 Entrar | `/login` (con dispositivo) | Fichas + contraseña + Google |
| 5 Abrir el turno | `/turno/abrir` | Pasos: base → bloques → abrir al público |
| 6 Validar la base | `/turno/abrir` paso 1 (reutiliza `caja-app` validar base) | «Sí, está completa / No, hay otra cantidad» |
| 7 Caja | `/turno/caja` | Esperado con desglose, ±, movimientos |
| 8 Inventario | `/turno/inventario` | Hay/Poco/Se acabó por zona |
| 9 Cerrar el turno | `/turno/cerrar` | Pasos: tareas → conteo → arqueo → base → entregar |
| 10 Arqueo | `/turno/cerrar` paso 3 (reutiliza `arqueo.tsx`) | Denominaciones con `Counter` |
| 11 Turno entregado | `/turno/cerrar` fin | Resumen + «Salir de la tablet» |
| 12 Hoy oscuro | tema `oscuro` | Tokens de 5.1 |

## Apéndice B — Archivos clave existentes (para orientarse)
- Auth/gate: `lib/auth.ts`, `lib/supabase/middleware.ts`, `proxy.ts`, `lib/pos/devices.ts`, `lib/pos/server.ts`, `lib/turno/server.ts`, `app/login/*`, `app/turno/auth-actions.ts`, `lib/neon/{auth,client}.ts`.
- Shells actuales: `app/(admin)/layout.tsx` + `_components/*`, `app/(staff)/layout.tsx`, `app/turno/_components/shell.tsx`, `app/turno/turno-board.tsx`.
- POS: `app/pos/{page,pos-terminal,pos-store,actions,pos-live,pos-window}.ts(x)`, `public/pos-sw.js`, `app/pos/manifest.webmanifest/route.ts`, `lib/pwa/desktop.ts`.
- Tablet: `app/turno/caja/_components/{caja-app,arqueo}.tsx`, `app/turno/inventario/acabando-screen.tsx`, `app/turno/conteo/conteo-screen.tsx`, `lib/turno/{blocks,steps,state}.ts`, `lib/caja/{estado,cierres,arqueo,base}.ts`, `lib/inventario/{acabando,rutina,conteo}.ts`.
- Dueño: `app/(admin)/numeros/[[...fecha]]/page.tsx` + `_components`, `app/(admin)/hoy/{page,[date]/page}.tsx`, `app/(admin)/inventario/{inventario-client,actions}.ts(x)`, `app/(admin)/recetas/{recetas-client,actions}.ts(x)`, `app/(admin)/catalogo/*`, `app/(admin)/configuracion/equipo/_actions.ts` (`createMemberWithPassword`, `setMemberPassword`), `app/(admin)/configuracion/pos/_actions.ts` (códigos de emparejamiento).
- Harness: `.e2e/neon/README.md`, `crawl.mjs`, `session.mjs`, `pos-sale.mjs`; `vitest.config.ts` (`lib/**/*.test.ts`, `app/**/*.test.ts`).
