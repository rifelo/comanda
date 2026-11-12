/**
 * Styles of «Verificar inventario» (Contar + Listo), from the Claude Design
 * canvas for the Galaxy Tab A8 in portrait (800×1280). Layout lives in
 * classes, never in inline `display`.
 */
export const VERIF_CSS = `
.verif { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); font-family: inherit; }
.verif button, .verif a { font-family: inherit; }
.verif button:focus-visible, .verif a:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.verif-head { flex-shrink: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 14px 20px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
.verif-headrow { min-height: 48px; display: flex; align-items: center; gap: 14px; }
.verif-back { width: 48px; height: 48px; flex-shrink: 0; box-sizing: border-box; border: 1px solid var(--line); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text); background: var(--surface); }
.verif-h1 { margin: 0; font-size: 22px; font-weight: 700; line-height: 1.2; }
.verif-sub { margin: 0; font-size: 14px; color: var(--muted); }
.verif-bar { display: flex; gap: 6px; }
.verif-bar > span { flex: 1; height: 6px; border-radius: 999px; background: var(--line); }
.verif-bar > span[data-s="hecho"] { background: var(--text); }
.verif-bar > span[data-s="actual"] { background: var(--brand); }
.verif-main { flex: 1; box-sizing: border-box; width: 100%; max-width: 760px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.verif-card { box-sizing: border-box; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.verif-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.verif-chip { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--surface-2); color: var(--text); white-space: nowrap; }
.verif-name { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; overflow-wrap: anywhere; }
.verif-help { margin: 0; font-size: 15px; line-height: 22px; color: var(--muted); }
.verif-nota { margin: 4px 0 0; padding: 10px 14px; border-radius: 12px; background: var(--brand-soft); color: var(--text); font-size: 15px; line-height: 22px; font-weight: 600; }
.verif-fields { display: flex; gap: 12px; }
.verif-fld { flex: 1 1 0; min-width: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 14px 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--text); cursor: pointer; }
.verif-fld[aria-pressed="true"] { border: 2px solid var(--text); padding: 13px 17px; background: var(--brand-soft); }
.verif-fld-label { font-size: 13px; font-weight: 600; color: var(--muted); }
.verif-fld-num { font-size: 48px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.verif-fld-num[data-vacio="1"] { color: var(--muted); }
.verif-total { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--surface-2); border-radius: 12px; }
.verif-total > span:first-child { flex: 1; font-size: 15px; color: var(--muted); }
.verif-total > span:last-child { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.verif-hint { display: flex; align-items: flex-start; gap: 10px; color: var(--muted); }
.verif-hint p { margin: 0; font-size: 14px; line-height: 20px; }
.verif-keys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.verif-key { height: 80px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; cursor: pointer; touch-action: manipulation; user-select: none; display: flex; align-items: center; justify-content: center; }
.verif-key.alt { background: var(--surface-2); }
.verif-key:active { transform: translateY(1px); }
.verif-key:disabled { opacity: .5; cursor: default; }
.verif-actions { display: flex; gap: 10px; margin-top: auto; }
.verif-ghost { height: 60px; flex-shrink: 0; padding: 0 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--text); font-size: 17px; font-weight: 700; cursor: pointer; }
.verif-solid { flex: 1; min-width: 0; height: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 10px; border: none; border-radius: 12px; background: var(--brand); color: var(--on-brand); font-size: 18px; font-weight: 700; text-decoration: none; cursor: pointer; }
.verif-solid:disabled, .verif-ghost:disabled { opacity: .45; cursor: default; }
.verif-link { display: flex; align-items: center; justify-content: center; text-decoration: none; box-sizing: border-box; }
.verif-fija { flex: none; }
.verif-fin { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.verif-error { border-radius: 12px; padding: 12px 16px; font-size: 15px; font-weight: 600; color: var(--late); background: var(--late-soft); }
.verif-ok { display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-radius: 16px; background: var(--ok-soft); }
.verif-ok-icon { width: 48px; height: 48px; flex-shrink: 0; border-radius: 999px; background: var(--ok); color: #ffffff; display: flex; align-items: center; justify-content: center; }
.verif-ok h2 { margin: 0; font-size: 22px; font-weight: 700; color: var(--ok); }
.verif-ok p { margin: 2px 0 0; font-size: 15px; }
.verif-res { box-sizing: border-box; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px 18px 8px; display: flex; flex-direction: column; }
.verif-res h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.verif-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-top: 1px solid var(--line); }
.verif-row-name { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.verif-row-meta { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.verif-row-meta b { color: var(--text); }
.verif-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.verif-pill[data-e="aplicado"] { background: var(--ok-soft); color: var(--ok); }
.verif-pill[data-e="revisar"] { background: var(--late-soft); color: var(--late); }
.verif-pill[data-e="no_encontrado"] { background: var(--surface-2); color: var(--muted); }
.verif-note { margin: 4px 0 10px; font-size: 13px; line-height: 18px; color: var(--muted); }
.verif-empty { padding: 14px 0; border-top: 1px solid var(--line); font-size: 15px; color: var(--muted); }
@media (max-height: 820px) {
  .verif-key { height: 60px; font-size: 24px; }
  .verif-fld-num { font-size: 38px; }
  .verif-name { font-size: 26px; }
  .verif-main { gap: 12px; padding: 14px 20px; }
}
@media (max-width: 480px) {
  .verif-main { padding: 14px 16px; }
  .verif-head { padding: 12px 16px 14px; }
  .verif-name { font-size: 24px; }
  .verif-fld { padding: 12px 14px; }
  .verif-fld[aria-pressed="true"] { padding: 11px 13px; }
  .verif-fld-num { font-size: 36px; }
  .verif-ghost { padding: 0 14px; font-size: 15px; }
  .verif-solid { font-size: 16px; }
  .verif-row { flex-wrap: wrap; }
}
`;
