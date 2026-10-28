// Layout lives in classes (never inline `display`): the two-column screens
// stack under 900 px, everything tightens on a short landscape tablet
// (≤ 680 px tall). Colours are the theme tokens, so «carbon» is the dark variant.
export const CAJA_CSS = `
.cj { --cj-mute: color-mix(in srgb, var(--muted) 65%, var(--ink)); --cj-amber-bg: color-mix(in srgb, var(--amber) 16%, var(--paper-lt)); --cj-red-bg: color-mix(in srgb, var(--red) 13%, var(--paper-lt)); --cj-green-bg: color-mix(in srgb, var(--green) 12%, var(--paper-lt));
  height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--paper); color: var(--ink); font-family: var(--font-mono), ui-monospace, monospace; }
:where(.cj) button { font-family: inherit; color: inherit; cursor: pointer; }
:where(.cj) button:disabled { cursor: not-allowed; }
.cj button:focus-visible, .cj a:focus-visible, .cj input:focus-visible, .cj textarea:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; }
.cj-slab { font-family: var(--font-slab), var(--font-mono), sans-serif; font-weight: 400; }
.cj-lab { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--cj-mute); }
.cj-mute { color: var(--cj-mute); }

/* top bar */
.cj-head { height: 64px; flex-shrink: 0; box-sizing: border-box; display: flex; align-items: center; gap: 16px; padding: 0 20px; background: var(--paper-lt); border-bottom: 1.5px solid var(--ink); min-width: 0; }
.cj-head-sede { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cj-head-sede span:last-child { font-size: 13px; font-weight: 500; white-space: nowrap; }
.cj-clock { font-size: 30px; line-height: 1; margin-left: 8px; }
.cj-grow { flex: 1; min-width: 8px; }
.cj-who { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cj-avatar { width: 36px; height: 36px; border-radius: 18px; background: var(--ink); color: var(--paper-lt); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
.cj-who-name { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.cj-salir { height: 44px; border: none; background: transparent; color: var(--cj-mute); font-size: 13px; font-weight: 700; text-decoration: underline; padding: 0 4px; }
.cj-sep { width: 1.5px; height: 32px; background: var(--rule); flex-shrink: 0; }
.cj-nav { display: flex; gap: 6px; }
.cj-tab { height: 44px; box-sizing: border-box; border: 1.5px solid var(--ink); background: var(--paper-lt); color: var(--ink); font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; padding: 0 16px; position: relative; text-decoration: none; white-space: nowrap; }
.cj-tab[aria-current="page"] { background: var(--ink); color: var(--paper-lt); }
.cj-tab-dot { position: absolute; top: -6px; right: -6px; width: 14px; height: 14px; border-radius: 7px; background: var(--amber); border: 1.5px solid var(--ink); }
.cj-crumb { font-size: 12px; color: var(--cj-mute); white-space: nowrap; }

/* offline / status band */
.cj-band { flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 10px 24px; background: var(--ink); color: var(--paper-lt); }
.cj-band b { font-size: 15px; }
.cj-band small { font-size: 12px; opacity: .85; }
.cj-band-count { margin-left: auto; font-size: 13px; font-weight: 800; padding: 6px 10px; border: 1.5px solid var(--paper-lt); white-space: nowrap; }
.cj-band.amber { background: var(--cj-amber-bg); color: var(--ink); border-bottom: 1.5px solid var(--amber); }

/* buttons */
.cj-btn { height: 56px; box-sizing: border-box; border: 1.5px solid var(--ink); background: var(--paper-lt); color: var(--ink); font-size: 16px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 20px; text-decoration: none; white-space: nowrap; }
.cj-btn.sm { height: 48px; padding: 0 14px; font-size: 14px; }
.cj-btn.xs { height: 44px; padding: 0 14px; font-size: 13px; }
.cj-btn.dark { background: var(--ink); color: var(--paper-lt); }
.cj-btn.red { background: var(--red); color: var(--paper-lt); }
.cj-btn.green { background: var(--green); color: var(--paper-lt); }
.cj-btn.ghost { border-color: var(--rule); color: var(--cj-mute); }
.cj-btn:disabled { opacity: .45; }
.cj-btn.big { height: 72px; font-size: 20px; width: 100%; }
.cj-btn.tall { height: 64px; font-size: 18px; width: 100%; }
.cj-chip { min-height: 56px; box-sizing: border-box; border: 1.5px solid var(--ink); background: var(--paper-lt); font-size: 15px; font-weight: 700; padding: 6px 18px; text-align: left; }
.cj-chip[aria-pressed="true"] { background: var(--ink); color: var(--paper-lt); }
.cj-chips { display: flex; flex-wrap: wrap; gap: 8px; }

/* inicio */
.cj-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 520px minmax(0, 1fr); gap: 20px; padding: 20px; box-sizing: border-box; }
.cj-col { display: flex; flex-direction: column; gap: 14px; min-height: 0; min-width: 0; }
.cj-card { background: var(--paper-lt); border: 1.5px solid var(--ink); box-sizing: border-box; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.cj-card.soft { border-color: var(--rule); padding: 12px 16px; gap: 8px; }
.cj-big { font-size: 52px; line-height: 1; letter-spacing: -.01em; }
.cj-toggle { height: 44px; margin: 0 -4px; padding: 0 4px; border: none; background: transparent; color: var(--cj-mute); font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; text-align: left; letter-spacing: .06em; }
.cj-desglose { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 16px; font-size: 13px; border-top: 1.5px solid var(--rule); padding-top: 10px; }
.cj-desglose > :nth-child(2n) { font-weight: 700; text-align: right; }
.cj-estado { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; }
.cj-estado small { font-weight: 400; color: var(--cj-mute); font-size: 13px; }
.cj-estado.ok { color: var(--green); } .cj-estado.pend { color: var(--amber); } .cj-estado.bad { color: var(--red); }
.cj-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cj-mainbtn { height: 96px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--paper-lt); border: 1.5px solid var(--ink); font-size: 24px; }
.cj-mainbtn.in { background: var(--green); } .cj-mainbtn.out { background: var(--red); }
.cj-arqueo { min-height: 64px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 18px; background: var(--paper-lt); color: var(--ink); border: 1.5px solid var(--ink); text-align: left; }
.cj-arqueo[data-hot="1"] { box-shadow: 4px 4px 0 var(--amber); }
.cj-arqueo-l { display: flex; align-items: center; gap: 12px; font-size: 18px; }
.cj-arqueo small { font-size: 12px; font-weight: 700; color: var(--amber); text-align: right; }
.cj-listhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cj-h2 { margin: 0; font-size: 20px; }
.cj-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; }
.cj-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1.5px solid var(--rule); background: var(--paper-lt); color: var(--ink); text-align: left; width: 100%; box-sizing: border-box; min-height: 64px; }
.cj-row[data-tone="pend"] { border-color: var(--amber); background: var(--cj-amber-bg); }
.cj-row[data-tone="espera"] { border-style: dashed; border-color: var(--ink); }
.cj-row[data-anulado="1"] { opacity: .55; }
.cj-row[data-anulado="1"] .cj-row-monto { text-decoration: line-through; }
.cj-row-hora { width: 52px; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.cj-ico { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--ink); background: var(--paper-lt); }
.cj-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cj-row-t { font-size: 14px; font-weight: 700; }
.cj-row-t span { font-weight: 400; color: var(--cj-mute); }
.cj-row-q { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cj-row-s { font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.cj-row-s.pend { color: color-mix(in srgb, var(--amber) 70%, var(--ink)); } .cj-row-s.ok { color: var(--green); } .cj-row-s.espera { color: var(--ink); } .cj-row-s.bad { color: var(--red); }
.cj-row-monto { font-size: 20px; white-space: nowrap; }
.cj-in { color: var(--green); } .cj-out { color: var(--red); }
.cj-note { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1.5px dashed var(--rule); font-size: 12px; color: var(--cj-mute); min-height: 48px; }
.cj-empty { padding: 28px 18px; border: 1.5px dashed var(--rule); text-align: center; font-size: 14px; color: var(--cj-mute); line-height: 1.5; }

/* flows */
.cj-flowbar { flex-shrink: 0; display: flex; align-items: center; gap: 20px; padding: 14px 24px; border-bottom: 1.5px solid var(--rule); min-width: 0; flex-wrap: wrap; }
.cj-h1 { margin: 0; font-size: 24px; white-space: nowrap; }
.cj-pick { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1.5px solid var(--ink); background: var(--paper-lt); font-size: 13px; font-weight: 700; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cj-steps { display: flex; align-items: center; gap: 18px; margin-left: auto; }
.cj-step { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--cj-mute); }
.cj-step i { width: 28px; height: 28px; border: 1.5px solid var(--rule); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; font-style: normal; }
.cj-step[data-s="on"] { color: var(--ink); } .cj-step[data-s="on"] i { background: var(--ink); color: var(--paper-lt); border-color: var(--ink); }
.cj-step[data-s="done"] { color: var(--green); } .cj-step[data-s="done"] i { border-color: var(--green); color: var(--green); }
.cj-step-line { width: 28px; height: 1.5px; background: var(--rule); }
.cj-flow { flex: 1; min-height: 0; padding: 20px 24px 24px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.cj-split { flex: 1; min-height: 0; padding: 20px 24px 24px; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) var(--cj-aside, 440px); gap: 24px; overflow-y: auto; }
.cj-split.kp { --cj-aside: 520px; }
.cj-aside { display: flex; flex-direction: column; gap: 12px; min-height: 0; min-width: 0; }
.cj-motivos { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(150px, 1fr); gap: 14px; }
.cj-motivo { box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; padding: 18px 20px; border: 1.5px solid var(--ink); background: var(--paper-lt); color: var(--ink); text-align: left; }
.cj-motivo[data-otro="1"] { border-style: dashed; }
.cj-motivo b { font-size: 20px; }
.cj-motivo small { font-size: 13px; color: var(--cj-mute); line-height: 1.4; }
.cj-amount { font-size: 72px; line-height: 1; overflow-wrap: anywhere; }
.cj-caret { width: 3px; height: 56px; background: var(--red); align-self: center; animation: cj-blink 1s steps(1) infinite; }
@keyframes cj-blink { 50% { opacity: 0; } }
.cj-four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.cj-four .cj-btn { height: 64px; font-size: 18px; }
.cj-keypad { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-content: start; }
.cj-key { height: 84px; box-sizing: border-box; border: 1.5px solid var(--ink); background: var(--paper-lt); color: var(--ink); font-size: 30px; display: flex; align-items: center; justify-content: center; font-family: var(--font-slab), sans-serif !important; }
.cj-key.alt { background: var(--paper); }
.cj-key.wide { grid-column: 1 / -1; height: 56px; font-size: 14px; font-family: var(--font-mono), monospace !important; font-weight: 700; color: var(--cj-mute); border-color: var(--rule); }
.cj-field { height: 64px; box-sizing: border-box; padding: 0 16px; border: 1.5px solid var(--ink); background: var(--paper-lt); font: inherit; font-size: 18px; font-weight: 700; color: var(--ink); outline: none; width: 100%; }
.cj-field.sm { height: 52px; font-size: 16px; }
.cj-textarea { box-sizing: border-box; padding: 12px 16px; border: 1.5px solid var(--ink); background: var(--paper-lt); font: inherit; font-size: 16px; line-height: 1.45; color: var(--ink); outline: none; width: 100%; resize: vertical; min-height: 96px; }
.cj-inline { display: flex; align-items: center; gap: 10px; min-height: 52px; box-sizing: border-box; padding: 0 14px; border: 1.5px solid var(--rule); background: var(--paper-lt); }
.cj-inline input { flex: 1; min-width: 0; border: none; background: transparent; font: inherit; font-size: 16px; font-weight: 700; color: var(--ink); outline: none; height: 48px; }
.cj-foto { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.cj-foto-btn { height: 120px; flex-direction: column; gap: 8px; }
.cj-foto-box { border: 1.5px dashed var(--rule); background: var(--paper-lt); display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; font-weight: 700; padding: 12px; min-height: 120px; box-sizing: border-box; overflow: hidden; }
.cj-foto-box[data-tone="bad"] { border-color: var(--red); color: var(--red); }
.cj-foto-box[data-tone="ok"] { border-style: solid; border-color: var(--green); padding: 0; }
.cj-foto-box img { width: 100%; height: 100%; max-height: 220px; object-fit: cover; display: block; }
.cj-warn { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1.5px solid; font-size: 13px; font-weight: 700; line-height: 1.35; }
.cj-warn.red { border-color: var(--red); background: var(--cj-red-bg); color: color-mix(in srgb, var(--red) 80%, var(--ink)); }
.cj-warn.amber { border-color: var(--amber); background: var(--cj-amber-bg); color: color-mix(in srgb, var(--amber) 55%, var(--ink)); }
.cj-warn.green { border-color: var(--green); background: var(--cj-green-bg); color: var(--green); }
.cj-warn button { border: none; background: transparent; text-decoration: underline; font-weight: 800; padding: 0; min-height: 32px; }
.cj-resumen { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 6px 10px; font-size: 13px; }
.cj-fine { font-size: 11px; color: var(--cj-mute); text-align: center; }
.cj-pedidos { display: flex; flex-direction: column; gap: 8px; }
.cj-pedido { min-height: 56px; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 8px 14px; border: 1.5px solid var(--ink); background: var(--paper-lt); text-align: left; font-size: 14px; }
.cj-pedido[aria-pressed="true"] { background: var(--ink); color: var(--paper-lt); }
.cj-pedido small { font-size: 12px; opacity: .8; }

/* denominations */
.cj-den-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.cj-den-col { display: flex; flex-direction: column; gap: 8px; }
.cj-den { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border: 1.5px solid var(--rule); background: var(--paper-lt); min-height: 60px; box-sizing: border-box; }
.cj-den[data-on="1"] { border-color: var(--ink); }
.cj-den-v { font-size: 18px; flex: 1; min-width: 0; }
.cj-den-sub { font-size: 12px; color: var(--cj-mute); min-width: 84px; text-align: right; }
.cj-step-btn { width: 48px; height: 48px; flex-shrink: 0; border: 1.5px solid var(--ink); background: var(--paper); font-size: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cj-den-n { width: 64px; height: 48px; box-sizing: border-box; border: 1.5px solid var(--ink); background: var(--paper-lt); text-align: center; font: inherit; font-size: 20px; font-weight: 800; color: var(--ink); outline: none; }
.cj-den-n.ro { display: flex; align-items: center; justify-content: center; border-color: transparent; background: transparent; }
.cj-den-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cj-den-card { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1.5px solid var(--rule); background: var(--paper-lt); }
.cj-den-card[data-on="1"] { border-color: var(--ink); }
.cj-den-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cj-den-card-top b { font-size: 18px; }
.cj-den-card-row { display: flex; align-items: center; gap: 8px; }
.cj-den-card-row .cj-den-n { flex: 1; width: 0; min-width: 0; }
.cj-total { font-size: 56px; line-height: 1; }
.cj-info { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1.5px dashed var(--ink); font-size: 13px; line-height: 1.45; }

/* arqueo result */
.cj-vs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cj-vs .cj-card span:last-child { font-size: 40px; line-height: 1; }
.cj-diff { padding: 18px 20px; border: 2px solid; display: flex; flex-direction: column; gap: 6px; }
.cj-diff.bad { border-color: var(--red); background: var(--cj-red-bg); color: var(--red); }
.cj-diff.ok { border-color: var(--green); background: var(--cj-green-bg); color: var(--green); }
.cj-diff.over { border-color: var(--amber); background: var(--cj-amber-bg); color: color-mix(in srgb, var(--amber) 60%, var(--ink)); }
.cj-diff b { font-size: 44px; line-height: 1.05; }
.cj-ledger { display: flex; flex-direction: column; border: 1.5px solid var(--ink); background: var(--paper-lt); overflow-y: auto; min-height: 0; }
.cj-ledger > div { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 14px; border-bottom: 1px dashed var(--rule); font-size: 13px; line-height: 1.4; }
.cj-ledger > div > span:last-child { font-weight: 800; white-space: nowrap; }
.cj-ledger .tot { border-bottom: none; border-top: 1.5px solid var(--ink); font-size: 15px; font-weight: 800; }
.cj-ledger small { color: var(--cj-mute); }
.cj-tray { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 14px; }
.cj-tray-col { display: flex; flex-direction: column; gap: 8px; }
.cj-piece { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 1.5px solid var(--rule); background: var(--paper-lt); min-height: 52px; box-sizing: border-box; }
.cj-piece[data-on="1"] { border-color: var(--ink); }
.cj-piece-v { min-width: 92px; font-size: 16px; }
.cj-piece-n { font-size: 26px; min-width: 40px; text-align: center; }
.cj-piece-stack { display: flex; gap: 3px; flex: 1; min-width: 0; overflow: hidden; }
.cj-piece-stack span { width: 30px; height: 18px; border: 1.5px solid var(--ink); background: var(--cj-green-bg); flex-shrink: 0; }
.cj-piece-stack.coin span { width: 18px; border-radius: 9px; }
.cj-piece small { font-size: 12px; color: var(--cj-mute); white-space: nowrap; }
.cj-kv { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }

.cj-validar-otra { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; align-items: start; min-width: 0; }
.cj-validar-otra .cj-key { height: 72px; }

/* sheet (detalle) */
.cj-scrim { position: fixed; inset: 0; background: color-mix(in srgb, var(--ink) 45%, transparent); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50; }
.cj-sheet { width: min(980px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; box-sizing: border-box; background: var(--paper); border: 1.5px solid var(--ink); display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
.cj-sheet-main { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.cj-sheet-side { padding: 22px 20px; border-left: 1.5px solid var(--rule); display: flex; flex-direction: column; gap: 10px; background: var(--paper-lt); }
.cj-sheet-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cj-x { width: 48px; height: 48px; border: 1.5px solid var(--ink); background: var(--paper-lt); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cj-dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 14px; font-size: 14px; }
.cj-dl > :nth-child(2n+1) { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--cj-mute); padding-top: 2px; }
.cj-photo-view { flex: 1; min-height: 220px; border: 1.5px dashed var(--rule); display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; color: var(--cj-mute); padding: 12px; overflow: hidden; }
.cj-photo-view img { max-width: 100%; max-height: 420px; object-fit: contain; }

/* compact: short landscape tablet */
@media (max-height: 680px) and (min-width: 900px) {
  .cj-head { height: 56px; }
  .cj-clock { font-size: 24px; }
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
  .cj { height: auto; min-height: 100dvh; overflow: visible; }
  .cj-head { height: auto; min-height: 60px; flex-wrap: wrap; padding: 8px 14px; gap: 10px; }
  .cj-head-sede, .cj-sep, .cj-who-name { display: none; }
  .cj-clock { font-size: 22px; margin-left: 0; }
  .cj-nav { order: 9; width: 100%; }
  .cj-nav .cj-tab { flex: 1; justify-content: center; }
  .cj-body, .cj-split { grid-template-columns: minmax(0, 1fr); padding: 14px; align-content: start; }
  .cj-list { overflow: visible; }
  .cj-motivos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-steps { margin-left: 0; width: 100%; gap: 10px; }
  .cj-step-line { width: 14px; }
  .cj-four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-den-cols, .cj-tray, .cj-vs, .cj-validar-otra { grid-template-columns: minmax(0, 1fr); }
  .cj-den-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cj-foto { grid-template-columns: minmax(0, 1fr); }
  .cj-sheet { grid-template-columns: minmax(0, 1fr); }
  .cj-sheet-side { border-left: none; border-top: 1.5px solid var(--rule); }
  .cj-dl { grid-template-columns: minmax(0, 1fr); gap: 2px 0; }
  .cj-amount { font-size: 52px; }
}
`;
