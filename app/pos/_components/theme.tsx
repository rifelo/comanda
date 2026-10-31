"use client";

import * as React from "react";

// ── design tokens → app CSS variables ───────────────────────────
export const C = {
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  paper: "var(--paper)",
  paperLt: "var(--paper-lt)",
  paperDk: "var(--paper-dk)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  ruleSoft: "var(--rule-soft)",
  red: "var(--red)",
  green: "var(--green)",
  amber: "var(--amber)",
} as const;
export const F = {
  mono: "var(--font-mono)",
  slab: "var(--font-slab)",
  script: "var(--font-script)",
} as const;

/** Category accent colours for tiles (Square colours its tiles per item). */
export const TILE_ACCENTS = [C.red, C.green, C.amber, "#4a6fa5", "#7a4fa0", "#b5651d", "#2f8f8f"];

export const DRAWER_W = 400;

// ── one-time CSS ────────────────────────────────────────────────
export const POS_CSS = `
  @keyframes pos-eq { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
  @keyframes pos-rec { 0%,100%{opacity:1} 50%{opacity:.25} }
  @keyframes pos-in  { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  @keyframes pos-slide { from{transform:translateX(24px); opacity:0} to{transform:none; opacity:1} }
  @keyframes pos-hl { 0%,100%{box-shadow:0 0 0 0 rgba(176,58,46,0)} 50%{box-shadow:0 0 0 5px rgba(176,58,46,.16)} }
  .pos-root, .pos-root * { box-sizing: border-box; }
  .pos-root button:not(.cmd-btn){min-height:0}
  .pos-root a{min-height:0}
  .pos-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .pos-tile:active:not(:disabled){transform:scale(.97)}
  .pos-tile{-webkit-touch-callout:none;user-select:none}
  /* Kiosk: no browser callout / text-selection bubble on a long press anywhere. */
  .pos-root{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
  .pos-root input,.pos-root textarea{-webkit-user-select:text;user-select:text}
  .pos-tile{transition:transform .06s, border-color .12s}
  .pos-eq i{display:inline-block;width:3px;height:14px;background:currentColor;transform-origin:bottom;
    animation:pos-eq .9s ease-in-out infinite}
  .pos-eq i:nth-child(2){animation-delay:.15s} .pos-eq i:nth-child(3){animation-delay:.3s}
  .pos-eq i:nth-child(4){animation-delay:.45s} .pos-eq i:nth-child(5){animation-delay:.6s}
  .pos-eq.paused i{animation-play-state:paused;transform:scaleY(.4);opacity:.45}
  .pos-rec{animation:pos-rec 1.3s ease-in-out infinite}
  .pos-card{animation:pos-in .35s ease both}
  .pos-drawer{animation:pos-slide .18s ease both}
  .pos-hl{animation:pos-hl 1.6s ease-in-out infinite}
  .pos-scroll{scrollbar-width:thin}
  .pos-scroll::-webkit-scrollbar{width:8px;height:8px} .pos-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:8px}
  .pos-key:active{background:var(--paper-dk)}
  .pos-line:active{background:var(--paper-dk)}

  /* Recipe sheet: photo on top, ingredients | steps side by side, each column scrolls. */
  .pos-receta{width:min(1100px,96vw);height:min(860px,92dvh)}
  .pos-receta-photo{height:240px}
  .pos-receta-cols{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
  .pos-receta-col{min-height:0;overflow-y:auto;padding:14px 22px 18px}
  .pos-receta-col + .pos-receta-col{border-left:1px solid var(--rule)}
  @media (max-height:760px){ .pos-receta-photo{height:170px} }
  @media (max-width:719px){
    .pos-receta{height:auto;max-height:92dvh}
    .pos-receta-photo{height:180px}
    .pos-receta-cols{display:block;overflow-y:auto}
    .pos-receta-col{overflow:visible}
    .pos-receta-col + .pos-receta-col{border-left:none;border-top:1px solid var(--rule)}
  }

  /* ── responsive layout ─────────────────────────────────────────
     Every size that changes with the screen lives here and not inline: an
     inline style beats a media query. Touch sizes are custom properties the
     inline styles read (var(--pos-qty)…), so a finger gets bigger targets
     and the mouse keeps the compact ones. */
  html:has(.pos-root), html:has(.pos-root) body{overscroll-behavior:none} /* no pull-to-refresh: it would wipe the ticket */
  .pos-scroll{overscroll-behavior:contain}
  .pos-root{--pos-qty:34px;--pos-chip:34px;--pos-x:28px;--pos-close:36px}
  @media (pointer:coarse){
    .pos-root{--pos-qty:44px;--pos-chip:42px;--pos-x:40px;--pos-close:44px}
  }
  .pos-hdr{height:58px;display:flex;align-items:center;gap:14px;padding:0 16px;border-bottom:1.5px solid var(--ink);background:var(--paper-lt);flex-shrink:0}
  .pos-barista-ask-short{display:none}
  .pos-root button.pos-textbtn{padding:4px 0}
  .pos-root button.pos-textbtn.tight{padding:0}
  .pos-linebadge{font-size:8.5px;padding:2px 5px}
  @media (pointer:coarse){
    .pos-root button.pos-textbtn,.pos-root button.pos-textbtn.tight{min-height:40px;padding:0 4px}
    .pos-linebadge{font-size:10.5px;padding:6px 8px}
  }

  /* ticket */
  .pos-ticket{width:400px}
  .pos-ticket-head{padding:12px 14px 10px}
  .pos-ticket-foot{padding:10px 14px 14px}
  .pos-otypes{display:flex;gap:6px}
  .pos-root button.pos-otype{flex:1;height:38px}
  /* The name for the cup: big, and it pulses until the ticket has one, so
     the barista never forgets to ask. */
  @keyframes pos-ask { 0%,100%{box-shadow:0 0 0 0 rgba(176,58,46,.45)} 50%{box-shadow:0 0 0 7px rgba(176,58,46,0)} }
  .pos-nombre{display:block;width:100%;height:56px;margin-top:10px;padding:0 14px;font-size:19px;font-weight:700;text-overflow:ellipsis;border:2px solid var(--ink);border-radius:6px;background:var(--paper);color:var(--ink);outline:none}
  .pos-nombre::placeholder{color:var(--muted);font-weight:600}
  .pos-nombre.ask{border-color:var(--red);animation:pos-ask 1.4s ease-out infinite}
  .pos-nombre.ask::placeholder{color:var(--red)}
  .pos-nombre:focus{animation:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(0,0,0,.12)}
  .pos-sum-note{margin-bottom:4px}

  /* Etiquetas — print / reprint labels on demand */
  .pos-etq{flex:1;overflow-y:auto;padding:18px 16px 28px}
  .pos-etq-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1120px;margin:0 auto;align-items:start}
  .pos-etq-card{border:1.5px solid var(--ink);border-radius:8px;background:var(--paper-lt);padding:16px 16px 18px;min-width:0}
  .pos-etq-card .pos-nombre{margin-top:0}
  .pos-etq-prev{display:block;width:100%;max-width:360px;height:auto;margin:14px auto 0;border:1px solid var(--rule);border-radius:4px;background:#fff;image-rendering:pixelated}
  .pos-etq-text{display:block;width:100%;padding:10px 12px;border:1.5px solid var(--ink);border-radius:6px;background:var(--paper);color:var(--ink);font-size:16px;line-height:1.4;outline:none;resize:none}
  .pos-etq-select{display:block;width:100%;height:46px;padding:0 10px;border:1.5px solid var(--rule);border-radius:6px;background:var(--paper);color:var(--ink);font-size:14px;outline:none}
  .pos-total{margin:6px 0 10px}
  .pos-total-amt{font-size:32px}
  .pos-actions{display:flex;flex-direction:column;gap:8px}
  .pos-root .pos-pay{width:100%;height:60px;font-size:15px}
  .pos-root .pos-send{width:100%;height:48px;font-size:13px}
  .pos-cartbar,.pos-scrim,.pos-tile-qty,.pos-ord-break{display:none}
  .pos-root button.pos-ticket-close{display:none}
  @keyframes pos-bump { 0%{transform:scale(1)} 40%{transform:scale(1.3)} 100%{transform:scale(1)} }
  .pos-bump{animation:pos-bump .28s ease}

  /* cobro */
  .pos-tender-body{flex:1;display:flex;min-height:0}
  .pos-tender-sum{width:360px;flex-shrink:0;display:flex;flex-direction:column;border-right:1.5px solid var(--ink);background:var(--paper-lt)}
  .pos-tender-total{padding:22px 20px 16px;border-bottom:1px solid var(--rule)}
  .pos-tender-amt{font-size:46px}
  .pos-tender-pay{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;padding:20px 28px;overflow-y:auto}
  .pos-cash{margin-top:18px;display:flex;gap:20px;flex:1;min-height:0}
  .pos-keypad{width:240px;flex-shrink:0}
  .pos-key{height:60px}

  /* pedidos */
  .pos-ord-tabs{display:flex;gap:6px;margin-left:10px}
  .pos-ord-day{display:flex;align-items:center;gap:6px;margin-left:12px}
  .pos-ord-hint{margin-left:12px}
  .pos-ord-body{flex:1;display:flex;min-height:0;position:relative}
  .pos-ord-detail{width:380px;flex-shrink:0;border-left:1.5px solid var(--ink);background:var(--paper-lt);display:flex;flex-direction:column}

  /* Between the two layouts (small laptops, iPad in landscape). */
  @media (min-width:900px) and (max-width:1099px){
    .pos-ticket{width:360px}
    .pos-tender-sum{width:320px}
    .pos-ord-detail{width:340px}
  }

  /* Wide but short — a tablet in landscape (Galaxy Tab A8: 1280 × ~650 with
     the browser bars). The two buttons share a row and the paddings tighten,
     so the ticket shows about two more lines. */
  @media (min-width:900px) and (max-height:760px){
    .pos-ticket-head{padding:8px 14px 8px}
    .pos-ticket-foot{padding:6px 14px 10px}
    .pos-root button.pos-otype{height:34px}
    .pos-nombre{height:46px;margin-top:6px;font-size:17px}
    .pos-sum{display:flex;flex-wrap:wrap;align-items:center;column-gap:12px;margin-bottom:8px}
    .pos-sum-note{flex:1 1 auto;gap:10px;margin-bottom:0}
    .pos-total{flex:1 1 auto;gap:10px;margin:0}
    .pos-total-amt{font-size:28px}
    .pos-actions{flex-direction:row-reverse}
    .pos-root .pos-pay,.pos-root .pos-send{width:auto;min-width:0;height:58px;padding:0 8px}
    .pos-root .pos-pay{flex:1.3;font-size:14px}
    .pos-root .pos-send{flex:1;font-size:12px;line-height:1.2}
    .pos-send-sep{display:none}
    .pos-send-sub{display:block;font-size:9.5px;opacity:.75}
    .pos-tender-total{padding:14px 20px 12px}
    .pos-tender-amt{font-size:40px}
    .pos-tender-pay{padding:14px 24px}
    .pos-cash{margin-top:12px}
    .pos-key{height:54px}
  }

  /* Narrow — a tablet in portrait (Galaxy Tab A8: 800 px), or a phone. The
     catalog takes the whole width; the ticket slides over it from the bar
     at the bottom. */
  @media (max-width:899px){
    .pos-barista-pre,.pos-barista-ask-long{display:none}
    .pos-barista-ask-short{display:inline}
    .pos-root button.pos-chip-c{padding:0 9px !important}
    .pos-etq-grid{grid-template-columns:1fr}
    .pos-ticket{position:absolute;top:0;right:0;bottom:0;z-index:26;width:min(480px,100%);
      transform:translateX(100%);visibility:hidden;transition:transform .2s ease,visibility 0s linear .2s;
      box-shadow:-18px 0 40px -24px rgba(0,0,0,.6)}
    .pos-ticket.open{transform:none;visibility:visible;transition:transform .2s ease}
    .pos-scrim.open{display:block;position:absolute;inset:0;z-index:25;background:rgba(20,14,8,.45)}
    .pos-root button.pos-ticket-close{display:inline-flex}
    .pos-cartbar{display:block;flex-shrink:0}
    .pos-tile-qty{display:inline-flex}
    .pos-hdr{gap:10px;padding:0 12px}

    .pos-tender-body{flex-direction:column}
    .pos-tender-sum{width:auto;max-height:32dvh;border-right:none;border-bottom:1.5px solid var(--ink)}
    .pos-tender-total{padding:14px 20px 12px}
    .pos-tender-amt{font-size:40px}
    .pos-tender-pay{padding:16px 20px 20px}

    .pos-ord-hdr{height:auto;min-height:58px;flex-wrap:wrap;row-gap:8px;padding:9px 12px}
    .pos-ord-right{order:1}
    .pos-ord-break{display:block;order:2;flex-basis:100%;height:0}
    .pos-ord-tabs{order:3;margin-left:0}
    .pos-ord-day,.pos-ord-hint{order:4;margin-left:auto}
    .pos-ord-detail{position:absolute;top:0;right:0;bottom:0;z-index:5;width:min(440px,100%);box-shadow:-18px 0 40px -24px rgba(0,0,0,.6)}
  }

  /* Phone width: the keypad goes under the amounts, the wordmark makes room for the search. */
  @media (max-width:639px){
    .pos-cash{flex-direction:column;flex:none}
    .pos-keypad{width:100%}
    .pos-wordmark{display:none}
    .pos-ord-tabs{overflow-x:auto;max-width:100%}
  }

  @media (prefers-reduced-motion:reduce){
    .pos-ticket,.pos-ticket.open{transition:none}
    .pos-bump{animation:none}
    .pos-nombre.ask{animation:none;box-shadow:0 0 0 3px rgba(176,58,46,.3)}
  }
`;

export function Overlay({ children, onClose, align }: { children: React.ReactNode; onClose?: () => void; align: "center" | "fill" }) {
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: align === "fill" ? C.paper : "rgba(20,14,8,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: align === "fill" ? 0 : 16 }}>
      {children}
    </div>
  );
}
