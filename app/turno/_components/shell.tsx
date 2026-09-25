"use client";

import * as React from "react";
import Link from "next/link";
import { CmdProgress, Wordmark } from "@/components/comanda/primitives";
import { turnoProgress } from "@/lib/turno/state";
import type { TurnoActor, TurnoPerson, TurnoShift } from "@/lib/turno/server";
import { signOutTurno } from "../auth-actions";
import { Avatar, linkChip } from "./avatar";

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function dateLabel(yyyyMMdd: string, todayIdx: number): string {
  const [, m, d] = yyyyMMdd.split("-").map(Number);
  return `${DIAS[todayIdx]} ${d} · ${MESES[m - 1]}`;
}

export function TopBar({ sedeName, date, todayIdx, now, me, actor, novedades, onNovedades }: {
  sedeName: string;
  date: string;
  todayIdx: number;
  now: string;
  me: TurnoPerson;
  actor: TurnoActor;
  novedades: number;
  onNovedades: () => void;
}) {
  return (
    <div className="turno-topbar" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1.5px solid var(--ink)", background: "var(--paper-lt)", minWidth: 0, overflowX: "auto", overflowY: "hidden", fontFamily: "var(--font-mono)" }}>
      <Wordmark size={22} />
      <span className="hidden md:inline" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "nowrap" }}>
        {sedeName} · {dateLabel(date, todayIdx)}
      </span>
      <span className="cmd-num" style={{ marginLeft: "auto", fontSize: 18, fontWeight: 700 }}>{now}</span>
      <button type="button" onClick={onNovedades} style={{ ...linkChip, cursor: "pointer", background: "transparent", fontFamily: "var(--font-mono)", gap: 6 }} title="Novedades del turno">
        ＋ Novedad
        {novedades > 0 && <span className="cmd-num" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--ink)", color: "var(--paper-lt)", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{novedades}</span>}
      </button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }} title={me.name}>
        <Avatar initials={me.initials} size={32} />
        <span className="hidden sm:inline" style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{me.name}</span>
      </span>
      <form action={signOutTurno}>
        <button type="submit" style={{ ...linkChip, cursor: "pointer", background: "transparent", fontFamily: "var(--font-mono)" }} title="Cerrar sesión en esta tablet">Salir</button>
      </form>
      <Link href="/turno/inventario" style={linkChip}>Faltantes</Link>
      <Link href="/turno/conteo" style={linkChip}>Conteo</Link>
      <Link href="/turno/caja" style={linkChip}>Caja</Link>
      <Link href="/pos" style={linkChip}>POS →</Link>
      {actor.role === "admin" && !actor.viaDevice && <Link href="/" style={linkChip}>← Panel</Link>}
    </div>
  );
}

export interface BlockCounts {
  inmediatas: number;
  atrasadas: number;
  ahora: number;
  luego: number;
  hechas: number;
}

/** Jump list for the checklist sections; red when something is late. */
export function BlockNav({ counts, onJump, compact }: { counts: BlockCounts; onJump: (id: string) => void; compact?: boolean }) {
  const items: Array<{ id: string; label: string; n: number; tone?: string }> = [
    { id: "inmediatas", label: "Inmediatas", n: counts.inmediatas, tone: counts.inmediatas ? "var(--red)" : undefined },
    { id: "atrasadas", label: "Atrasadas", n: counts.atrasadas, tone: counts.atrasadas ? "var(--red)" : undefined },
    { id: "ahora", label: "Ahora", n: counts.ahora, tone: counts.ahora ? "var(--ink)" : undefined },
    { id: "luego", label: "Luego", n: counts.luego },
    { id: "hechas", label: "Hechas", n: counts.hechas },
  ].filter((i) => i.n > 0 || i.id === "ahora");
  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: compact ? 6 : 2, padding: compact ? "8px 12px 0" : "6px 10px 12px", overflowX: compact ? "auto" : undefined, flexShrink: 0 }}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => onJump(`turno-sec-${i.id}`)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, minHeight: 40, padding: compact ? "0 12px" : "0 8px", borderRadius: 6,
            border: compact ? "1.5px solid var(--rule)" : "none", background: "transparent", color: i.tone ?? "var(--muted)",
            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", textAlign: "left",
          }}
        >
          <span style={{ flex: compact ? undefined : 1 }}>{i.label}</span>
          <span className="cmd-num" style={{ minWidth: 24, height: 24, padding: "0 7px", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: i.tone ? i.tone : "transparent", color: i.tone ? "var(--paper-lt)" : "var(--muted)", border: i.tone ? "none" : "1px solid var(--rule)" }}>
            {i.n}
          </span>
        </button>
      ))}
    </div>
  );
}

export function RailItem({ t, active, compact, onClick }: { t: TurnoShift; active: boolean; compact?: boolean; onClick: () => void }) {
  const prog = turnoProgress(t.tasks, t.completions);
  const closed = t.instance.status === "closed";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        textAlign: "left", cursor: "pointer", fontFamily: "var(--font-mono)", color: active ? "var(--paper-lt)" : "var(--ink)",
        background: active ? "var(--ink)" : "transparent", border: compact ? "1.5px solid var(--rule)" : "none", borderBottom: compact ? undefined : "1px solid var(--rule-soft)",
        padding: compact ? "8px 12px" : "12px 16px", minWidth: compact ? 180 : undefined, borderRadius: compact ? 6 : 0, flexShrink: 0, width: compact ? undefined : "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="font-slab" style={{ fontSize: compact ? 15 : 18, lineHeight: 1.1 }}>{t.template.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 8.5, letterSpacing: ".12em", textTransform: "uppercase", border: `1px solid ${closed ? "var(--muted)" : active ? "var(--paper-lt)" : "var(--green)"}`, color: closed ? "var(--muted)" : active ? "var(--paper-lt)" : "var(--green)", padding: "2px 5px", borderRadius: 2 }}>
          {closed ? "cerrado" : "abierto"}
        </span>
      </div>
      <div className="cmd-num" style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>{t.template.inicio} – {t.template.fin} · {prog.done}/{prog.total}</div>
      {!compact && <div style={{ marginTop: 6 }}><CmdProgress done={prog.done} total={prog.total} color={active ? "var(--paper-lt)" : "var(--ink)"} /></div>}
    </button>
  );
}
