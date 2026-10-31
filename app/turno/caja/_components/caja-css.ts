// Layout lives in classes (never inline `display`): the two-column screens
// stack under 900 px, everything tightens on a short landscape tablet
// (≤ 680 px tall). Colours are the theme tokens, so «carbon» is the dark variant.
export const CAJA_CSS = `
.cj { --cj-mute: var(--muted); --cj-amber-bg: var(--brand-soft); --cj-red-bg: var(--late-soft); --cj-green-bg: var(--ok-soft);
  height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); color: var(--text); font-family: inherit; }
:where(.cj) button { font-family: inherit; color: inherit; cursor: pointer; }
:where(.cj) button:disabled { cursor: not-allowed; }
.cj button:focus-visible, .cj a:focus-visible, .cj input:focus-visible, .cj textarea:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.cj-slab { font-family: inherit; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.cj-lab { font-size: 13px; font-weight: 600; color: var(--muted); }
.cj-mute { color: var(--cj-mute); }

.cj-grow { flex: 1; min-width: 8px; }

/* offline / status band */
.cj-band { flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 12px 28px; background: var(--strong); color: var(--on-strong); }
.cj-band b { font-size: 15px; }
.cj-band small { font-size: 12px; opacity: .85; }
.cj-band-count { margin-left: auto; font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--on-strong) 16%, transparent); white-space: nowrap; }
.cj-band.amber { background: var(--brand-soft); color: var(--text); }

/* buttons */
.cj-btn { height: 56px; box-sizing: border-box; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); color: var(--text); font-size: 17px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 22px; text-decoration: none; white-space: nowrap; }
.cj-btn.sm { height: 48px; padding: 0 14px; font-size: 14px; }
.cj-btn.xs { height: 44px; padding: 0 14px; font-size: 13px; }
.cj-btn.dark { background: var(--strong); color: var(--on-strong); border-color: transparent; }
.cj-btn.red { background: var(--late); color: #fff; border-color: transparent; }
.cj-btn.green { background: var(--brand); color: var(--on-brand); border-color: transparent; }
.cj-btn.ghost { border-color: var(--line); color: var(--muted); }
.cj-btn:disabled { opacity: .45; }
.cj-btn.big { height: 72px; font-size: 20px; width: 100%; border-radius: 14px; }
.cj-btn.tall { height: 64px; font-size: 18px; width: 100%; }
.cj-chip { min-height: 48px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 15px; font-weight: 600; padding: 6px 18px; text-align: left; }
.cj-chip[aria-pressed="true"] { background: var(--strong); color: var(--on-strong); border-color: var(--strong); }
.cj-chips { display: flex; flex-wrap: wrap; gap: 8px; }

/* inicio */
.cj-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 420px minmax(0, 1fr); gap: 20px; padding: 24px 28px; box-sizing: border-box; }
.cj-col { display: flex; flex-direction: column; gap: 14px; min-height: 0; min-width: 0; }
.cj-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-sizing: border-box; padding: 20px 22px; display: flex; flex-direction: column; gap: 12px; }
.cj-card.soft { border-color: var(--line); padding: 12px 16px; gap: 8px; }
.cj-big { font-size: 56px; line-height: 1; letter-spacing: -.02em; }
.cj-toggle { height: 44px; margin: 0 -4px; padding: 0 4px; border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; text-align: left; }
.cj-desglose { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; font-size: 15px; border-top: 1px solid var(--line); padding-top: 14px; color: var(--muted); }
.cj-desglose > :nth-child(2n) { font-weight: 600; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.cj-estado { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
.cj-estado small { font-weight: 400; color: var(--cj-mute); font-size: 13px; }
.cj-estado.ok { color: var(--ok); } .cj-estado.pend { color: var(--text); } .cj-estado.bad { color: var(--late); }
.cj-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cj-mainbtn { height: 72px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 12px; border: none; border-radius: 14px; font-size: 20px; font-weight: 700; }
.cj-mainbtn.in { background: var(--brand); color: var(--on-brand); } .cj-mainbtn.out { background: var(--strong); color: var(--on-strong); }
.cj-arqueo { min-height: 76px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: var(--r-card); text-align: left; }
.cj-arqueo[data-hot="1"] { background: var(--brand-soft); border-color: transparent; }
.cj-arqueo-l { display: flex; align-items: center; gap: 12px; font-size: 17px; font-weight: 600; }
.cj-arqueo small { font-size: 13px; font-weight: 600; color: var(--muted); text-align: right; }
.cj-listhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cj-h2 { margin: 0; font-size: 20px; font-weight: 700; }
.cj-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface); }
.cj-row { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border: none; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--text); text-align: left; width: 100%; box-sizing: border-box; min-height: 76px; flex-shrink: 0; }
.cj-list > .cj-row:last-child { border-bottom: none; }
.cj-row[data-tone="pend"] { background: var(--brand-soft); }
.cj-row[data-tone="espera"] { background: var(--surface-2); }
.cj-row[data-anulado="1"] { opacity: .55; }
.cj-row[data-anulado="1"] .cj-row-monto { text-decoration: line-through; }
.cj-row-hora { width: 52px; font-size: 15px; font-weight: 700; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.cj-ico { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: var(--surface-2); }
.cj-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cj-row-t { font-size: 17px; font-weight: 600; }
.cj-row-t span { font-weight: 400; color: var(--cj-mute); }
.cj-row-q { font-size: 14px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cj-row-s { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.cj-row-s.pend { color: var(--text); } .cj-row-s.ok { color: var(--ok); } .cj-row-s.espera { color: var(--text); } .cj-row-s.bad { color: var(--late); }
.cj-row-monto { font-size: 18px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cj-in { color: var(--ok); } .cj-out { color: var(--late); }
.cj-note { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--muted); min-height: 52px; flex-shrink: 0; }
.cj-empty { padding: 32px 18px; text-align: center; font-size: 15px; color: var(--muted); line-height: 1.5; }

/* flows */
.cj-flowbar { flex-shrink: 0; display: flex; align-items: center; gap: 12px 20px; padding: 14px 28px; border-bottom: 1px solid var(--line); background: var(--surface); min-width: 0; flex-wrap: wrap; }
.cj-h1 { margin: 0; font-size: 22px; font-weight: 700; white-space: nowrap; }
.cj-pick { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 999px; background: var(--surface-2); font-size: 13px; font-weight: 600; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cj-steps { display: flex; align-items: center; gap: 18px; margin-left: auto; }
.cj-step { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
.cj-step i { width: 28px; height: 28px; border-radius: 999px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; font-style: normal; }
.cj-step[data-s="on"] { color: var(--text); } .cj-step[data-s="on"] i { background: var(--brand); color: var(--on-brand); }
.cj-step[data-s="done"] { color: var(--text); } .cj-step[data-s="done"] i { background: var(--ok); color: var(--on-strong); }
.cj-step-line { width: 28px; height: 1px; background: var(--line); }
.cj-flow { flex: 1; min-height: 0; padding: 24px 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.cj-split { flex: 1; min-height: 0; padding: 24px 28px; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) var(--cj-aside, 440px); gap: 24px; overflow-y: auto; }
.cj-split.kp { --cj-aside: 520px; }
.cj-aside { display: flex; flex-direction: column; gap: 12px; min-height: 0; min-width: 0; }
.cj-motivos { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(150px, 1fr); gap: 14px; }
.cj-motivo { box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface); color: var(--text); text-align: left; }
.cj-motivo[data-otro="1"] { background: var(--surface-2); }
.cj-motivo b { font-size: 19px; font-weight: 700; }
.cj-motivo small { font-size: 14px; color: var(--muted); line-height: 1.4; }
.cj-amount { font-size: 72px; line-height: 1; overflow-wrap: anywhere; }
.cj-caret { width: 3px; height: 56px; background: var(--brand); align-self: center; animation: cj-blink 1s steps(1) infinite; }
@keyframes cj-blink { 50% { opacity: 0; } }
.cj-four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.cj-four .cj-btn { height: 64px; font-size: 18px; }
.cj-keypad { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-content: start; }
.cj-key { height: 76px; box-sizing: border-box; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); color: var(--text); font-size: 28px; font-weight: 700; display: flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
.cj-key.alt { background: var(--surface-2); border-color: transparent; }
.cj-key.wide { grid-column: 1 / -1; height: 56px; font-size: 15px; font-weight: 600; color: var(--muted); border-color: var(--line); }
.cj-field { height: 56px; box-sizing: border-box; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); font: inherit; font-size: 17px; font-weight: 600; color: var(--text); width: 100%; }
.cj-field.sm { height: 52px; font-size: 16px; }
.cj-textarea { box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); font: inherit; font-size: 17px; line-height: 1.45; color: var(--text); width: 100%; resize: vertical; min-height: 110px; }
.cj-inline { display: flex; align-items: center; gap: 10px; min-height: 56px; box-sizing: border-box; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); }
.cj-inline input { flex: 1; min-width: 0; border: none; background: transparent; font: inherit; font-size: 16px; font-weight: 700; color: var(--text); outline: none; height: 48px; }
.cj-foto { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.cj-foto-btn { height: 120px; flex-direction: column; gap: 8px; }
.cj-foto-box { border: 1px dashed var(--line); border-radius: var(--r-card); background: var(--surface); display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; font-weight: 700; padding: 12px; min-height: 120px; box-sizing: border-box; overflow: hidden; }
.cj-foto-box[data-tone="bad"] { border-color: var(--late); color: var(--late); }
.cj-foto-box[data-tone="ok"] { border-style: solid; border-color: var(--ok); padding: 0; }
.cj-foto-box img { width: 100%; height: 100%; max-height: 220px; object-fit: cover; display: block; }
.cj-warn { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border: none; border-radius: var(--r-btn); font-size: 15px; font-weight: 600; line-height: 1.35; }
.cj-warn.red { background: var(--late-soft); color: var(--late); }
.cj-warn.amber { background: var(--brand-soft); color: var(--text); }
.cj-warn.green { background: var(--ok-soft); color: var(--ok); }
.cj-warn button { border: none; background: transparent; text-decoration: underline; font-weight: 800; padding: 0; min-height: 32px; }
.cj-resumen { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 6px 10px; font-size: 13px; }
.cj-fine { font-size: 13px; color: var(--muted); text-align: center; }
.cj-pedidos { display: flex; flex-direction: column; gap: 8px; }
.cj-pedido { min-height: 60px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 8px 16px; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); text-align: left; font-size: 15px; }
.cj-pedido[aria-pressed="true"] { background: var(--strong); color: var(--on-strong); border-color: var(--strong); }
.cj-pedido small { font-size: 12px; opacity: .8; }

/* denominations */
.cj-den-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.cj-den-col { display: flex; flex-direction: column; gap: 8px; }
.cj-den { display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); min-height: 64px; box-sizing: border-box; }
.cj-den[data-on="1"] { border-color: var(--brand); background: var(--brand-soft); }
.cj-den-v { font-size: 19px; font-weight: 700; flex: 1; min-width: 0; font-variant-numeric: tabular-nums; }
.cj-den-sub { font-size: 13px; color: var(--muted); min-width: 84px; text-align: right; }
.cj-step-btn { width: 48px; height: 48px; flex-shrink: 0; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); font-size: 24px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
.cj-den-n { width: 68px; height: 48px; box-sizing: border-box; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface-2); text-align: center; font: inherit; font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.cj-den-n.ro { display: flex; align-items: center; justify-content: center; border-color: transparent; background: transparent; }
.cj-den-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cj-den-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.cj-den-card[data-on="1"] { border-color: var(--brand); background: var(--brand-soft); }
.cj-den-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cj-den-card-top b { font-size: 18px; }
.cj-den-card-row { display: flex; align-items: center; gap: 8px; }
.cj-den-card-row .cj-den-n { flex: 1; width: 0; min-width: 0; }
.cj-total { font-size: 56px; line-height: 1; }
.cj-info { display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; border-radius: var(--r-btn); background: var(--surface-2); font-size: 15px; line-height: 1.45; color: var(--muted); }

/* arqueo result */
.cj-vs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cj-vs .cj-card span:last-child { font-size: 40px; line-height: 1; }
.cj-diff { padding: 20px 22px; border: none; border-radius: var(--r-card); display: flex; flex-direction: column; gap: 6px; }
.cj-diff.bad { background: var(--late-soft); color: var(--late); }
.cj-diff.ok { background: var(--ok-soft); color: var(--ok); }
.cj-diff.over { background: var(--brand-soft); color: var(--text); }
.cj-diff b { font-size: 44px; line-height: 1.05; }
.cj-ledger { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface); overflow-y: auto; min-height: 0; }
.cj-ledger > div { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.4; }
.cj-ledger > div > span:last-child { font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cj-ledger .tot { border-bottom: none; border-top: 1px solid var(--line); font-size: 15px; font-weight: 800; }
.cj-ledger small { color: var(--muted); }
.cj-tray { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 14px; }
.cj-tray-col { display: flex; flex-direction: column; gap: 8px; }
.cj-piece { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); min-height: 56px; box-sizing: border-box; }
.cj-piece[data-on="1"] { border-color: var(--brand); background: var(--brand-soft); }
.cj-piece-v { min-width: 92px; font-size: 16px; }
.cj-piece-n { font-size: 26px; min-width: 40px; text-align: center; }
.cj-piece-stack { display: flex; gap: 3px; flex: 1; min-width: 0; overflow: hidden; }
.cj-piece-stack span { width: 30px; height: 18px; border-radius: 4px; border: 1px solid var(--ok); background: var(--ok-soft); flex-shrink: 0; }
.cj-piece-stack.coin span { width: 18px; border-radius: 9px; }
.cj-piece small { font-size: 13px; color: var(--muted); white-space: nowrap; }
.cj-kv { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; }

.cj-validar-otra { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; align-items: start; min-width: 0; }
.cj-validar-otra .cj-key { height: 72px; }

/* sheet (detalle) */
.cj-scrim { position: fixed; inset: 0; background: var(--scrim); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50; }
.cj-sheet { width: min(980px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; box-sizing: border-box; background: var(--surface); border-radius: var(--r-sheet); display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
.cj-sheet-main { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.cj-sheet-side { padding: 22px 20px; border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; background: var(--surface-2); }
.cj-sheet-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cj-x { width: 48px; height: 48px; border: 1px solid var(--line); border-radius: var(--r-btn); background: var(--surface); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cj-dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 14px; font-size: 14px; }
.cj-dl > :nth-child(2n+1) { font-size: 13px; font-weight: 600; color: var(--muted); padding-top: 2px; }
.cj-photo-view { flex: 1; min-height: 220px; border: 1px dashed var(--line); border-radius: var(--r-card); display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; color: var(--cj-mute); padding: 12px; overflow: hidden; }
.cj-photo-view img { max-width: 100%; max-height: 420px; object-fit: contain; }

/* compact: short landscape tablet */
@media (max-height: 680px) and (min-width: 900px) {
  .cj-body { padding: 14px; gap: 14px; grid-template-columns: 460px minmax(0, 1fr); }
  .cj-col { gap: 10px; }
  .cj-card { padding: 12px 14px; gap: 6px; }
  .cj-big { font-size: 40px; }
  .cj-mainbtn { height: 72px; font-size: 20px; }
  .cj-arqueo { min-height: 56px; }
  .cj-row { min-height: 56px; padding: 6px 12px; }
  .cj-flowbar { padding: 10px 20px; }
  .cj-flow, .cj-split { padding: 14px 20px 16px; }
  .cj-motivos { grid-auto-rows: minmax(110px, 1fr); }
  .cj-amount { font-size: 56px; }
  .cj-key { height: 64px; font-size: 26px; }
  .cj-btn.big { height: 60px; }
  .cj-den { min-height: 52px; }
}

/* narrow: portrait tablet or phone */
@media (max-width: 899px) {
  .cj { height: auto; min-height: 100%; overflow: visible; }
  .cj-body, .cj-split { grid-template-columns: minmax(0, 1fr); padding: 16px; align-content: start; }
  .cj-flow { padding: 16px; }
  .cj-flowbar { padding: 12px 16px; }
  .cj-band { padding: 12px 16px; }
  .cj-big { font-size: 44px; }
  .cj-list { overflow: visible; }
  .cj-motivos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-steps { margin-left: 0; width: 100%; gap: 10px; }
  .cj-step-line { width: 14px; }
  .cj-four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-den-cols, .cj-tray, .cj-vs, .cj-validar-otra { grid-template-columns: minmax(0, 1fr); }
  .cj-den-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-foto { grid-template-columns: minmax(0, 1fr); }
  .cj-sheet { grid-template-columns: minmax(0, 1fr); }
  .cj-sheet-side { border-left: none; border-top: 1px solid var(--line); }
  .cj-dl { grid-template-columns: minmax(0, 1fr); gap: 2px 0; }
  .cj-amount { font-size: 52px; }
}
`;
