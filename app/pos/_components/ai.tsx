"use client";

import * as React from "react";
import { POS_KIND_LABEL, type PosSuggestKind } from "@/lib/pos/types";
import { usePos, posStore, applyAct, dismissSuggestion, appendTranscript, resetConversation, type SuggestionCardState } from "../pos-store";
import { C, DRAWER_W, F } from "./theme";

// ════════════════════════════════════════════════════════════════
// AI drawer (mic · suggestions · transcript)
// ════════════════════════════════════════════════════════════════
export function AiDrawer() {
  const s = usePos();
  const open = s.suggestions;
  const idle = s.transcript.length === 0;
  return (
    <div className="pos-drawer" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: DRAWER_W, maxWidth: "100%", zIndex: 30, display: "flex", flexDirection: "column", background: C.ink, boxShadow: "-18px 0 40px -24px rgba(0,0,0,.6)" }}>
      <AiHeader />
      <div className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: "rgba(244,236,220,.5)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sugerencias</span>
          {s.thinking && <span style={{ color: C.amber }}>· pensando…</span>}
          <span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.2)" }} />
        </div>
        {s.micNote && <div style={{ fontSize: 13, color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 10, padding: "9px 11px", lineHeight: 1.5 }}>{s.micNote}</div>}
        {open.length === 0 && (
          <div style={{ color: "rgba(244,236,220,.55)", fontSize: 14, lineHeight: 1.7, padding: "14px 4px" }}>
            {idle
              ? "Activa el micrófono (o escribe abajo) y el asistente escuchará la conversación para darte ideas: agregar productos, combos, personalizar y atender alergias."
              : "Todo en orden. Sigo escuchando y te aviso si surge una oportunidad."}
          </div>
        )}
        {open.map((g) => <SuggestionCard key={g.uid} g={g} />)}
      </div>
      <TranscriptDock />
      <AiControls />
    </div>
  );
}

export function AiHeader() {
  const s = usePos();
  const live = s.listening;
  return (
    <div style={{ padding: "12px 14px 12px", borderBottom: "1px solid rgba(244,236,220,.16)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 30, border: `1.5px solid ${C.red}`, color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>IA</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.paperLt }}>Asistente</div>
            <div style={{ fontSize: 11, color: "rgba(244,236,220,.55)" }}>Escucha la conversación y sugiere</div>
          </div>
        </div>
        <button onClick={() => posStore.set((st) => ({ ...st, listening: !st.listening }))} title="Activar/pausar micrófono" style={{
          display: "flex", alignItems: "center", gap: 7, background: "transparent", border: `1px solid ${live ? C.red : "rgba(244,236,220,.3)"}`,
          color: live ? C.red : "rgba(244,236,220,.7)", fontFamily: F.mono, fontSize: 12, height: 36, padding: "0 10px", cursor: "pointer", borderRadius: 10, flexShrink: 0,
        }}>
          <span className={"pos-eq" + (live ? "" : " paused")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14 }}><i /><i /><i /><i /><i /></span>
          {live ? "ESCUCHANDO" : "MICRÓFONO"}
        </button>
        <button onClick={() => posStore.set({ aiOpen: false })} aria-label="Cerrar asistente" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(244,236,220,.3)", background: "transparent", color: C.paperLt, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
      </div>
      <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "rgba(244,236,220,.62)", lineHeight: 1.4 }}>
        <span className={live ? "pos-rec" : ""} style={{ width: 7, height: 7, borderRadius: 7, background: live ? C.red : "rgba(244,236,220,.4)", flexShrink: 0 }} />
        <span>Cliente informado · el audio se transcribe en la nube; no se almacena.</span>
      </div>
    </div>
  );
}

export const KIND_COLOR: Record<PosSuggestKind, { line: string; tag: string }> = {
  pedido: { line: C.paperLt, tag: C.ink2 },
  combo: { line: C.green, tag: C.green },
  upsell: { line: C.amber, tag: C.amber },
  modificador: { line: C.amber, tag: C.amber },
  agotado: { line: C.red, tag: C.red },
  alergia: { line: C.red, tag: C.red },
  atencion: { line: C.amber, tag: C.amber },
  fidelidad: { line: C.green, tag: C.green },
};

export function SuggestionCard({ g }: { g: SuggestionCardState }) {
  const col = KIND_COLOR[g.kind] || KIND_COLOR.pedido;
  return (
    <div className="pos-card" style={{ background: C.paperLt, borderRadius: 10, borderLeft: `4px solid ${col.line}`, boxShadow: "0 6px 18px -10px rgba(0,0,0,.5)", overflow: "hidden" }}>
      <div style={{ padding: "11px 13px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: col.tag, border: `1px solid ${col.tag}`, padding: "2px 6px", borderRadius: 10 }}>
            {POS_KIND_LABEL[g.kind] || "Idea"}
          </span>
          <button onClick={() => dismissSuggestion(g.uid, false)} title="Descartar" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 2 }}>×</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{g.title}</div>
        {g.detail && <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5, marginTop: 5 }}>{g.detail}</div>}
        {g.say && (
          <div style={{ marginTop: 10, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: "9px 11px" }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Para decir en voz alta</div>
            <div style={{ fontFamily: F.script, fontSize: 18, color: C.ink, lineHeight: 1.25 }}>“{g.say}”</div>
          </div>
        )}
        {g.actionLabel && g.act && (
          <button onClick={() => { applyAct(g.act); dismissSuggestion(g.uid, true); }} style={{
            marginTop: 11, width: "100%", fontFamily: F.mono, fontSize: 14, fontWeight: 600, minHeight: 42,
            background: col.line === C.paperLt ? C.ink : col.line, color: C.paperLt, border: "none", borderRadius: 10, padding: "10px", cursor: "pointer",
          }}>{g.actionLabel}</button>
        )}
      </div>
    </div>
  );
}

export function TranscriptDock() {
  const s = usePos();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [s.transcript.length, s.interim]);
  return (
    <div style={{ height: 168, borderTop: "1px solid rgba(244,236,220,.16)", background: "rgba(0,0,0,.18)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "9px 14px 4px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(244,236,220,.5)" }}>
        <span>Conversación</span><span style={{ flex: 1, borderTop: "1px dashed rgba(244,236,220,.18)" }} />
        <span className="cmd-num">{s.transcript.length}</span>
      </div>
      <div ref={ref} className="pos-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {s.transcript.length === 0 && !s.interim && (
          <div style={{ fontSize: 13, color: "rgba(244,236,220,.4)", paddingTop: 8 }}>
            {s.listening ? "Escuchando… habla y aparecerá aquí." : "Esperando la conversación…"}
          </div>
        )}
        {s.transcript.map((t, i) =>
          t.who === "sistema" ? (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: "rgba(244,236,220,.4)", fontStyle: "italic" }}>· {t.text} ·</div>
          ) : (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.who === "cliente" ? C.amber : C.green, minWidth: 50 }}>{t.who}</span>
              <span style={{ fontSize: 13, color: C.paperLt, lineHeight: 1.4, flex: 1 }}>{t.text}</span>
              <span className="cmd-num" style={{ fontSize: 11, color: "rgba(244,236,220,.35)" }}>{t.time}</span>
            </div>
          ),
        )}
        {s.interim && (
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", opacity: 0.7 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, minWidth: 50 }}>···</span>
            <span style={{ fontSize: 13, color: C.paperLt, lineHeight: 1.4, flex: 1, fontStyle: "italic" }}>{s.interim}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const ctrlBtn: React.CSSProperties = { flex: "0 0 auto", fontFamily: F.mono, fontSize: 14, background: "transparent", border: "1px solid rgba(244,236,220,.32)", color: C.paperLt, height: 40, minWidth: 40, padding: "0 12px", cursor: "pointer", borderRadius: 10 };

export function AiControls() {
  const [text, setText] = React.useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    appendTranscript("cliente", t);
    setText("");
  };
  return (
    <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid rgba(244,236,220,.16)" }}>
      <form onSubmit={submit} style={{ flex: 1, display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe lo que dijo el cliente…"
          style={{ flex: 1, fontFamily: F.mono, fontSize: 14, background: "rgba(244,236,220,.06)", border: "1px solid rgba(244,236,220,.28)", color: C.paperLt, height: 40, padding: "0 11px", borderRadius: 10, outline: "none", minWidth: 0 }}
        />
        <button type="submit" style={ctrlBtn} title="Enviar al asistente">▶</button>
      </form>
      <button onClick={resetConversation} style={ctrlBtn} title="Reiniciar pedido y conversación">↺</button>
    </div>
  );
}
