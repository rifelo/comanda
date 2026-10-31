"use client";

import * as React from "react";

// ── design tokens → app CSS variables (docs/redesign/DESIGN.md) ─
// The POS keeps its inline-style components; every colour is a token of the
// neutral system, so dark mode comes for free. The old names stay as keys so
// the screens read the same; their values are the new tokens.
export const C = {
  ink: "var(--text)",
  ink2: "var(--muted)",
  paper: "var(--bg)",
  paperLt: "var(--surface)",
  paperDk: "var(--surface-2)",
  muted: "var(--muted)",
  rule: "var(--line)",
  ruleSoft: "var(--line)",
  red: "var(--late)",
  redSoft: "var(--late-soft)",
  green: "var(--ok)",
  greenSoft: "var(--ok-soft)",
  /** Pending / warning text: brand yellow darkened enough to read on white (lightened on dark). */
  amber: "var(--pos-warn)",
  brand: "var(--brand)",
  onBrand: "var(--on-brand)",
  brandSoft: "var(--brand-soft)",
  strong: "var(--strong)",
  onStrong: "var(--on-strong)",
} as const;
export const F = {
  mono: "var(--font-sans)",
  slab: "var(--font-sans)",
  script: "var(--font-script)",
} as const;
/** Headline / big-number face (was the slab): Inter bold, tabular. */
export const H: React.CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 700, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" };

/** Category accent colours for tiles — muted, only a dot on the tile. */
export const TILE_ACCENTS = ["var(--brand)", "var(--ok)", "var(--late)", "#4a6fa5", "#7a4fa0", "#b5651d", "#2f8f8f"];

export const DRAWER_W = 400;

// ── one-time CSS ────────────────────────────────────────────────
// Every size that changes with the screen lives here and not inline: an
// inline style beats a media query (see memory: tailwind inline display).
//
// Breakpoints (devices: register PC 1920×1080, Galaxy Tab A8 1280×800 and
// 800×1280, phones 390×844):
//   · ≥ 900 wide — catalog | ticket side by side (ticket 400, 440 ≥ 1500).
//   · < 900 narrow — the catalog takes the width, the ticket slides over it
//     from the cart bar at the bottom.
//   · < 640 phone — 3 tile columns, compact header.
export const POS_CSS = `
  @keyframes pos-eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
  @keyframes pos-rec { 0%,100%{opacity:1} 50%{opacity:.25} }
  @keyframes pos-in  { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  @keyframes pos-slide { from{transform:translateX(24px); opacity:0} to{transform:none; opacity:1} }
  @keyframes pos-hl { 0%,100%{box-shadow:0 0 0 0 rgba(241,169,0,0)} 50%{box-shadow:0 0 0 5px rgba(241,169,0,.35)} }
  .pos-root{--pos-warn:color-mix(in srgb, var(--brand) 62%, var(--text));font-family:var(--font-sans)}
  .pos-root, .pos-root * { box-sizing: border-box; }
  .pos-root button:not(.cmd-btn){min-height:0}
  .pos-root a{min-height:0}
  .pos-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; font-family: inherit; }
  .pos-root :focus-visible{outline:3px solid var(--focus);outline-offset:2px}
  .pos-root .cmd-btn.brand{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
  .pos-root .cmd-btn.brand:hover{filter:brightness(.97)}
  .pos-tile:active:not(:disabled){transform:scale(.97)}
  .pos-tile{-webkit-touch-callout:none;user-select:none}
  /* Kiosk: no browser callout / text-selection bubble on a long press anywhere. */
  .pos-root{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
  .pos-root input,.pos-root textarea{-webkit-user-select:text;user-select:text}
  .pos-tile{transition:transform .06s, border-color .12s, box-shadow .12s}
  .pos-tile:hover:not(:disabled){border-color:color-mix(in srgb, var(--text) 25%, var(--line))}
  .pos-eq i{display:inline-block;width:3px;height:14px;background:currentColor;transform-origin:bottom;
    animation:pos-eq .9s ease-in-out infinite}
  .pos-eq i:nth-child(2){animation-delay:.15s} .pos-eq i:nth-child(3){animation-delay:.3s}
  .pos-eq i:nth-child(4){animation-delay:.45s} .pos-eq i:nth-child(5){animation-delay:.6s}
  .pos-eq.paused i{animation-play-state:paused;transform:scaleY(.4);opacity:.45}
  .pos-rec{animation:pos-rec 1.3s ease-in-out infinite}
  .pos-card{animation:pos-in .25s ease both}
  .pos-drawer{animation:pos-slide .18s ease both}
  .pos-hl{animation:pos-hl 1.6s ease-in-out infinite}
  .pos-scroll{scrollbar-width:thin}
  .pos-scroll::-webkit-scrollbar{width:8px;height:8px} .pos-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:8px}
  .pos-key:active{background:var(--surface-2)}
  .pos-line:active{background:var(--surface-2)}

  /* Recipe sheet: photo on top, ingredients | steps side by side, each column scrolls. */
  .pos-receta{width:min(1100px,96vw);height:min(860px,92dvh)}
  .pos-receta-photo{height:240px}
  .pos-receta-cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
  .pos-receta-col{min-height:0;overflow-y:auto;padding:14px 22px 18px}
  .pos-receta-col + .pos-receta-col{border-left:1px solid var(--line)}
  @media (max-height:760px){ .pos-receta-photo{height:170px} }
  @media (max-width:719px){
    .pos-receta{height:auto;max-height:92dvh}
    .pos-receta-photo{height:180px}
    .pos-receta-cols{display:block;overflow-y:auto}
    .pos-receta-col{overflow:visible}
    .pos-receta-col + .pos-receta-col{border-left:none;border-top:1px solid var(--line)}
  }

  html:has(.pos-root), html:has(.pos-root) body{overscroll-behavior:none} /* no pull-to-refresh: it would wipe the ticket */
  .pos-scroll{overscroll-behavior:contain}
  .pos-root{--pos-qty:40px;--pos-chip:40px;--pos-x:36px;--pos-close:44px}
  @media (pointer:coarse){
    .pos-root{--pos-qty:44px;--pos-chip:44px;--pos-x:44px;--pos-close:48px}
  }

  /* ── header ── */
  .pos-hdr{height:76px;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid var(--line);background:var(--surface);flex-shrink:0}
  .pos-hbtn{height:48px;min-width:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--text);
    font-size:15px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;text-decoration:none}
  .pos-hbtn:hover{background:var(--surface-2)}
  .pos-hbtn[aria-pressed="true"]{background:var(--strong);border-color:var(--strong);color:var(--on-strong)}
  .pos-hbtn.icon{width:48px;padding:0}
  .pos-hbtn.alert{border-color:var(--late);color:var(--late)}
  .pos-hbtn.warn{background:var(--brand-soft);border-color:var(--brand)}
  .pos-badge{min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:var(--late);color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
  .pos-search{flex:1;min-width:120px;max-width:560px;position:relative}
  .pos-search input{width:100%;height:48px;padding:0 44px 0 44px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font-size:16px;border-radius:12px;outline:none}
  .pos-search input:focus{background:var(--surface);border-color:var(--text)}
  .pos-who-name{max-width:140px;overflow:hidden;text-overflow:ellipsis}
  .pos-hide-narrow{}
  .pos-only-narrow{display:none}
  .pos-barista-ask-short{display:none}
  .pos-root button.pos-textbtn{padding:4px 0}
  .pos-root button.pos-textbtn.tight{padding:0}
  .pos-linebadge{font-size:12px;padding:3px 8px}
  @media (pointer:coarse){
    .pos-root button.pos-textbtn,.pos-root button.pos-textbtn.tight{min-height:44px;padding:0 4px}
    .pos-linebadge{font-size:12px;padding:8px 10px}
  }

  /* ── catalog ── */
  .pos-cats{display:flex;gap:8px;padding:14px 20px 12px;overflow-x:auto;flex-shrink:0}
  .pos-cat{flex-shrink:0;height:48px;padding:0 20px;border-radius:999px;cursor:pointer;font-size:15px;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--text);display:inline-flex;align-items:center;gap:8px}
  .pos-cat[aria-pressed="true"]{background:var(--strong);border-color:var(--strong);color:var(--on-strong)}
  .pos-cat.ia[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
  .pos-gridwrap{flex:1;overflow-y:auto;padding:4px 20px 24px}
  .pos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:12px;align-content:start}
  .pos-tile{min-height:116px;padding:14px 14px 12px;border-radius:16px}
  .pos-tile-name{font-size:16px;font-weight:600;line-height:1.25;overflow-wrap:anywhere;hyphens:auto}
  .pos-tile-price{font-size:16px;font-weight:700}
  @media (min-width:1500px){
    .pos-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
    .pos-tile{min-height:132px}
    .pos-tile-name{font-size:17px}
  }

  /* ── ticket ── */
  .pos-ticket{width:400px;border-left:1px solid var(--line);background:var(--surface)}
  @media (min-width:1500px){ .pos-ticket{width:440px} }
  .pos-ticket-head{padding:14px 18px 12px}
  .pos-ticket-foot{padding:12px 18px 16px}
  .pos-otypes{display:flex}
  .pos-root button.pos-otype{flex:1;height:40px}
  /* The name for the cup: big, and it pulses until the ticket has one, so
     the barista never forgets to ask. */
  @keyframes pos-ask { 0%,100%{box-shadow:0 0 0 0 rgba(241,169,0,.55)} 50%{box-shadow:0 0 0 6px rgba(241,169,0,0)} }
  .pos-nombre{display:block;width:100%;height:52px;margin-top:10px;padding:0 16px;font-size:17px;font-weight:600;text-overflow:ellipsis;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);color:var(--text);outline:none;font-family:inherit}
  .pos-nombre::placeholder{color:var(--muted);font-weight:500}
  .pos-nombre.ask{border-color:var(--brand);background:var(--brand-soft);animation:pos-ask 1.6s ease-out infinite}
  .pos-nombre.ask::placeholder{color:var(--text)}
  .pos-nombre:focus{animation:none;border-color:var(--text);background:var(--surface)}
  .pos-sum-note{margin-bottom:4px}
  .pos-total{margin:4px 0 12px}
  .pos-total-amt{font-size:32px}
  /* «Efectivo» | «Transferencia» (72 px) — then «Otro» | «Enviar · pagar después». */
  .pos-paybar{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .pos-paybtn{height:72px;border-radius:14px;font-size:19px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1px solid transparent}
  .pos-paybtn small{font-size:12px;font-weight:600;opacity:.75}
  .pos-paybtn.cash{background:var(--brand);color:var(--on-brand)}
  .pos-paybtn.transfer{background:var(--strong);color:var(--on-strong)}
  .pos-paybtn:disabled{opacity:.4;cursor:not-allowed}
  .pos-paybtn:active:not(:disabled){transform:translateY(1px)}
  .pos-paymore{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:10px}
  .pos-paymore button{height:48px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-size:15px;font-weight:600;cursor:pointer}
  .pos-paymore button:disabled{opacity:.4;cursor:not-allowed}
  .pos-paymore button.wide{grid-column:1 / -1}
  .pos-cartbar,.pos-scrim,.pos-tile-qty,.pos-ord-break{display:none}
  .pos-root button.pos-ticket-close{display:none}
  @keyframes pos-bump { 0%{transform:scale(1)} 40%{transform:scale(1.3)} 100%{transform:scale(1)} }
  .pos-bump{animation:pos-bump .28s ease}
  @keyframes pos-autoclose { from{width:0} to{width:100%} }
  .pos-autoclose{animation:pos-autoclose linear both}

  /* Etiquetas — print / reprint labels on demand */
  .pos-etq{flex:1;overflow-y:auto;padding:20px 20px 28px}
  .pos-etq-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1120px;margin:0 auto;align-items:start}
  .pos-etq-card{border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:18px 18px 20px;min-width:0}
  .pos-etq-card .pos-nombre{margin-top:0}
  .pos-etq-prev{display:block;width:100%;max-width:360px;height:auto;margin:14px auto 0;border:1px solid var(--line);border-radius:8px;background:#fff;image-rendering:pixelated}
  .pos-etq-text{display:block;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);color:var(--text);font-size:16px;line-height:1.4;outline:none;resize:none;font-family:inherit}
  .pos-etq-select{display:block;width:100%;height:48px;padding:0 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text);font-size:15px;outline:none;font-family:inherit}

  /* ── cobro ── */
  .pos-tender-body{flex:1;display:flex;min-height:0}
  .pos-tender-sum{width:380px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--surface)}
  .pos-tender-total{padding:22px 24px 16px;border-bottom:1px solid var(--line)}
  .pos-tender-amt{font-size:48px}
  .pos-tender-pay{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;padding:24px 28px;overflow-y:auto}
  .pos-cash{margin-top:18px;display:flex;gap:20px;flex:1;min-height:0}
  .pos-keypad{width:280px;flex-shrink:0}
  .pos-key{height:60px}
  .pos-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .pos-methods button{padding:8px 16px}
  .pos-method-label{font-size:17px}

  /* pedidos */
  .pos-ord-tabs{margin-left:8px}
  .pos-ord-day{display:flex;align-items:center;gap:6px;margin-left:12px}
  .pos-ord-hint{margin-left:12px}
  .pos-ord-body{flex:1;display:flex;min-height:0;position:relative}
  .pos-ord-detail{width:400px;flex-shrink:0;border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column}

  /* Between the two layouts (small laptops, iPad in landscape). */
  @media (min-width:900px) and (max-width:1099px){
    .pos-ticket{width:360px}
    .pos-tender-sum{width:320px}
    .pos-ord-detail{width:340px}
  }

  /* Wide but short — a tablet in landscape (Galaxy Tab A8: 1280 × ~650 with
     the browser bars). Paddings tighten so the ticket shows more lines. */
  @media (min-width:900px) and (max-height:760px){
    .pos-hdr{height:64px}
    .pos-ticket-head{padding:10px 16px 8px}
    .pos-ticket-foot{padding:8px 16px 12px}
    .pos-root button.pos-otype{height:36px}
    .pos-nombre{height:44px;margin-top:8px}
    .pos-total{margin:2px 0 8px}
    .pos-total-amt{font-size:28px}
    .pos-paybtn{height:64px}
    .pos-paymore{margin-top:8px}
    .pos-paymore button{height:44px}
    .pos-cats{padding:10px 20px 8px}
    .pos-tile{min-height:104px}
    .pos-tender-total{padding:14px 20px 12px}
    .pos-tender-amt{font-size:40px}
    .pos-tender-pay{padding:16px 24px}
    .pos-cash{margin-top:12px}
    .pos-key{height:54px}
  }

  /* Narrow — a tablet in portrait (Galaxy Tab A8: 800 px), or a phone. The
     catalog takes the whole width; the ticket slides over it from the bar
     at the bottom. */
  @media (max-width:899px){
    .pos-hdr{height:64px;gap:8px;padding:0 12px}
    .pos-hide-narrow{display:none}
    .pos-only-narrow{display:inline-flex}
    .pos-barista-pre,.pos-barista-ask-long{display:none}
    .pos-barista-ask-short{display:inline}
    .pos-etq-grid{grid-template-columns:1fr}
    .pos-ticket{position:absolute;top:0;right:0;bottom:0;z-index:26;width:min(480px,100%);
      transform:translateX(100%);visibility:hidden;transition:transform .2s ease,visibility 0s linear .2s;
      box-shadow:var(--shadow-2)}
    .pos-ticket.open{transform:none;visibility:visible;transition:transform .2s ease}
    .pos-scrim.open{display:block;position:absolute;inset:0;z-index:25;background:var(--scrim)}
    .pos-root button.pos-ticket-close{display:inline-flex}
    .pos-cartbar{display:block;flex-shrink:0}
    .pos-tile-qty{display:inline-flex}
    .pos-tile.has-qty .pos-tile-name{padding-right:30px}

    .pos-tender-body{flex-direction:column;overflow-y:auto}
    .pos-tender-sum{width:auto;max-height:30dvh;border-right:none;border-bottom:1px solid var(--line);flex-shrink:0}
    .pos-tender-total{padding:14px 20px 12px}
    .pos-tender-amt{font-size:40px}
    .pos-tender-pay{padding:16px 20px 20px;overflow:visible;flex:none}

    .pos-ord-hdr{height:auto;min-height:64px;flex-wrap:wrap;row-gap:8px;padding:8px 12px}
    .pos-ord-right{order:1}
    .pos-ord-break{display:block;order:2;flex-basis:100%;height:0}
    .pos-ord-tabs{order:3;margin-left:0;max-width:100%}
    .pos-ord-day,.pos-ord-hint{order:4;margin-left:auto}
    .pos-ord-detail{position:absolute;top:0;right:0;bottom:0;z-index:5;width:min(440px,100%);box-shadow:var(--shadow-2)}
  }

  /* Phone width: 3 tile columns, keypad under the amounts. */
  @media (max-width:639px){
    .pos-hdr{height:56px}
    .pos-hide-phone{display:none}
    .pos-hbtn{height:44px;min-width:44px;padding:0 10px}
    .pos-hbtn.icon{width:44px}
    .pos-search input{height:44px}
    .pos-cats{padding:10px 12px 8px}
    .pos-cat{height:44px;padding:0 16px}
    .pos-gridwrap{padding:4px 12px 16px}
    .pos-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .pos-tile{min-height:104px;padding:10px 10px 9px;border-radius:14px}
    .pos-tile-name{font-size:14px}
    .pos-tile-price{font-size:14px}
    .pos-cash{flex-direction:column;flex:none}
    .pos-keypad{width:100%}
    .pos-methods{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .pos-method-hint{display:none}
    .pos-methods button{padding:8px 6px;text-align:center;align-items:center}
    .pos-method-label{font-size:14px}
    .pos-ord-tabs{overflow-x:auto}
  }

  @media (prefers-reduced-motion:reduce){
    .pos-ticket,.pos-ticket.open{transition:none}
    .pos-bump{animation:none}
    .pos-nombre.ask{animation:none;box-shadow:0 0 0 3px rgba(241,169,0,.4)}
  }
`;

export function Overlay({ children, onClose, align }: { children: React.ReactNode; onClose?: () => void; align: "center" | "fill" }) {
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: align === "fill" ? C.paper : "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: align === "fill" ? 0 : 16 }}>
      {children}
    </div>
  );
}
