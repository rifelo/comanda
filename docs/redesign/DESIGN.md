# Comanda · sistema de diseño (guía corta)

Contrato completo: `docs/redesign/PLAN.md` §5. Esta guía dice **qué usar y cómo**. Todo vive en `components/ui/*` (barrel `@/components/ui`), tokens en `app/globals.css`, navegación en `lib/nav/*`, tema en `lib/theme.ts`.

## Reglas

1. **Tokens, nunca hex.** Tailwind: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-text`, `text-muted`, `bg-brand`/`text-on-brand`, `bg-ok`/`bg-ok-soft`/`text-ok`, `bg-late`/`bg-late-soft`/`text-late`, `bg-strong`/`text-on-strong`. Radios `rounded-card` (16), `rounded-btn` (12), `rounded-sheet` (20). En `style` inline: `var(--surface)` etc.
2. **Amarillo marca sólo** en la acción primaria, el tab activo y el logo. Verde = hecho/ok. Rojo = atrasado/error. Lo demás, blanco y grises.
3. **Tamaños táctiles**: controles 56 px (`Button` md), 48 px (sm), 72 px (lg, cobro); filas 76 px; nada por debajo de 44 px.
4. **Tipografía**: Inter para todo (`font-sans`, ya es el del body). Escala: `ui-h1` 28/700, `ui-h2` 20/700, `ui-big` 48/700 tabular, `ui-title` 17/600, `ui-sub` 14 muted, `ui-label` 13/600 muted, cuerpo 16. Números: `ui-num` (tabular). `font-mono` sólo para recibos/etiquetas/kardex; `font-slab` (Dela Gothic) sólo marca y menú público.
5. **Responsive**: 390 px primero. Nunca `display` en `style` inline junto a `md:hidden`/`lg:flex`… (el inline gana). Variante propia `desk:` = ≥ 1024 px **y** puntero fino (escritorio real; una tablet de 1280 táctil no la activa).
6. **Fechas/horas en SSR**: deterministas (ver `formatClock` en `clock.tsx`); nunca `toLocaleString`.
7. **Navegación**: `<Link>`/`Button href`, nunca `router.push` dentro de `startTransition`.
8. **Modo oscuro** sale gratis si usas tokens. Probar con la cookie `comanda-theme=oscuro`.

## Componentes

| Necesito… | Uso |
|---|---|
| Botón | `<Button>` (`variant` primary · ghost · strong · danger, `size` sm · md · lg, `block`, `loading`, `icon`, `href`). Sólo clase: `buttonClass({...})` para `<a>`/`<Link>` propios. |
| Botón de icono | `<IconButton label="Cerrar">…</IconButton>` (48 px, `href` opcional). |
| Tarjeta | `<Card>` (`tight`, `as`). Enlace grande: `<LinkCard title sub href icon badge tone>`. |
| Fila de tarea | `<Row time title desc trailing={<Check …/>} />`; `full` muestra la descripción completa. |
| Check / foto | `<Check done kind="check" \| "photo" label onToggle />` (52 px). |
| Estado | `<Pill tone="late">Atrasada · 9:00</Pill>`; contador rojo `<CountBadge value />`. |
| Pestañas internas | `<Segmented options={[{value,label,count}]} value onChange />`. |
| Flujo guiado | `<FlowHeader title sub step total backHref />` + `<Steps items />`; barra `<ProgressBar value label />`. |
| Formularios | `<Field label hint error />`, `<TextArea />`, `<SearchField value onChange />`, `<Chips><Chip pressed onClick/></Chips>`, `<Counter value onChange label />`, `<Keypad onKey />` + `applyKey(valor, tecla)`. |
| Modal | `<Sheet open onClose title footer side>` — abajo en teléfono, centrado ≥ 640; Escape, scrim y deslizar cierran. |
| Números | `<BigNumber label value sub />`, `<StatTile label value delta tone href />`, `<Money value signed />` (COP determinista). |
| Personas | `<Avatar name />`, `<PersonTile name pressed onClick />` (login con fichas). |
| Avisos | `<Banner tone onClose>`, `<EmptyState title text action />`, `toast("Guardado", "ok")` (el `<Toaster/>` ya está en `app/layout.tsx`). |
| Encabezados | `<TopBar title sub who clock actions />` (header de app, 56/76 px), `<PageHeader title sub back actions />` (dentro de la página), `<Clock tz serverNow />`, `<AppLogo />`. |
| Marco | `<AppShell variant="equipo" \| "dueno" nav profile actions header>` + `<TabBar items />`. |

## Shells

- **Dueño** (`app/(admin)/layout.tsx`): `AppShell variant="dueno"` con `DUENO_TABS`, `MAS_ITEMS`, `AVANZADO_ITEMS`. Teléfono/tablet: header + tira de subsecciones + tabs abajo. Escritorio (`desk:`): rail de 240 px con las subsecciones del tab activo y «Más» desplegado. Las subsecciones salen de `sections` en `lib/nav/items.ts`; agregar una ruta = agregar una línea ahí.
- **Equipo** (P1): `AppShell variant="equipo" nav={EQUIPO_TABS} header={<TopBar … clock />}` — tabs abajo a todo ancho; los flujos `/turno/abrir` y `/turno/cerrar` no usan shell (pantalla completa con `FlowHeader`).
- Perfil (toque en el avatar): apariencia Claro/Oscuro/Automático, ver como equipo / ir al panel, POS, instalar, y las acciones que pase el layout (`actions.signOut`, `actions.switchPerson` = `signOutLocal` de F2).
- `lib/nav/items.ts` apunta hoy a las rutas viejas (siguen vivas como redirect cuando P3/P4 las muevan); `match` ya incluye las nuevas. Ola 3 cambia los `href`.

## Tema

Cookie `comanda-theme` = `claro | oscuro | auto` (`lib/theme.ts`; valores viejos `papel/sepia/indigo/rojo` → claro, `carbon` → oscuro). `<html data-theme>` lo pone `app/layout.tsx`. Sin cookie = **claro** mientras haya pantallas sin migrar (un teléfono en modo oscuro pintaría tokens oscuros bajo colores fijos claros); en la Ola 3 pasar `DEFAULT_THEME` a `auto`. Las variables viejas (`--paper`, `--ink`, `--rule`, `--red`, `--amber`…) son **alias** de los tokens nuevos: no usarlas en código nuevo.

## PWA

`public/manifest.json` (id `/`), `public/sw.js` (scope `/`, nunca toca `/pos*`, `/api/*`, POST ni RSC; navegaciones sólo red con respaldo `/offline`), `components/pwa/register-sw.tsx` (sólo producción, nunca desde `/pos`), `components/pwa/install-banner.tsx` (`InstallBanner` en el layout raíz, `InstallLinkCard` para Más/perfil, hoja de pasos en iOS). El POS conserva su manifest y `pos-sw.js`.
