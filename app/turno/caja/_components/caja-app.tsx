"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { esperadoCaja } from "@/lib/caja/arqueo";
import { MOTIVO_CAJA, porConfirmar } from "@/lib/caja/movimientos";
import type { CierreInput } from "@/lib/caja/cierres";
import type { CajaEstado } from "@/lib/caja/estado";
import { fechaCorta, todayInTz } from "@/lib/utils";
import {
  adjuntarFotoMovimientoCaja,
  ajustarBaseCaja,
  anularMovimientoCaja,
  confirmarBaseCaja,
  enviarCierreCaja,
  fotoMovimientoCaja,
  notaCierreCaja,
  registrarMovimientoCaja,
  validarBaseCaja,
} from "../actions";
import { ArqueoFlow, draftKey, writeDraft, type ResultadoCierre } from "./arqueo";
import { CAJA_CSS } from "./caja-css";
import { DetalleMovimiento } from "./detalle";
import { EntradaFlow } from "./entrada";
import { IcoCheck, IcoNube } from "./icons";
import { Inicio, type LineaEstado } from "./inicio";
import { faltaPara, guardarCola, hora, leerCola, nuevoRef, plata, sumaVentana, unirMovimientos, type MovPendiente } from "./model";
import { CajaHead, subirDataUrl } from "./parts";
import { SalidaFlow, type NuevoMovimiento } from "./salida";
import { ValidarBase } from "./validar";

type View = "inicio" | "salida" | "entrada" | "arqueo";
const CIERRE_KEY = "caja:cierre-pendiente";

function leerCierrePend(): CierreInput | null {
  try {
    const raw = window.localStorage.getItem(CIERRE_KEY);
    return raw ? (JSON.parse(raw) as CierreInput) : null;
  } catch {
    return null;
  }
}
function guardarCierrePend(c: CierreInput | null) {
  try {
    if (c) window.localStorage.setItem(CIERRE_KEY, JSON.stringify(c));
    else window.localStorage.removeItem(CIERRE_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * The Caja module on the shop tablet (/turno/caja): one client screen so it
 * keeps working when the internet drops — movements wait in a localStorage
 * queue (photos too) and go out on their own; the arqueo count waits the
 * same way. Server data comes from lib/caja/estado.ts and refreshes after
 * every write.
 */
export function CajaApp({ estado, sedeName, tz, actor }: { estado: CajaEstado; sedeName: string; tz: string; actor: { name: string; isAdmin: boolean } }) {
  const router = useRouter();
  const [view, setView] = React.useState<View>("inicio");
  const [detalle, setDetalle] = React.useState<string | null>(null);
  const [validarLuego, setValidarLuego] = React.useState(false);
  const [validada, setValidada] = React.useState(false);
  const [cola, setCola] = React.useState<MovPendiente[]>([]);
  const [enviados, setEnviados] = React.useState<MovPendiente[]>([]);
  const [online, setOnline] = React.useState(true);
  const [now, setNow] = React.useState<number | null>(null);
  const [flash, setFlash] = React.useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [resultado, setResultado] = React.useState<{ r: ResultadoCierre; contadas: CierreInput["denominaciones"] } | null>(null);
  const [cierrePend, setCierrePend] = React.useState<CierreInput | null>(null);
  const cargada = React.useRef(false);
  const enviando = React.useRef(false);

  // The queue and a pending count survive a reload or a lost tab.
  React.useEffect(() => {
    const c = leerCola();
    const p = leerCierrePend();
    cargada.current = true;
    queueMicrotask(() => {
      if (c.length) setCola(c);
      if (p) setCierrePend(p);
      setNow(Date.now());
      setOnline(navigator.onLine);
    });
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(t);
    };
  }, []);
  React.useEffect(() => {
    if (cargada.current) guardarCola(cola);
  }, [cola]);
  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(t);
  }, [flash]);

  // What came back from the server no longer needs its local copy.
  React.useEffect(() => {
    const llegaron = new Set(estado.movimientos.map((m) => m.clientRef));
    queueMicrotask(() => setEnviados((e) => (e.some((p) => llegaron.has(p.clientRef)) ? e.filter((p) => !llegaron.has(p.clientRef)) : e)));
  }, [estado.movimientos]);

  const enviar = React.useCallback(
    async (lote: MovPendiente[]) => {
      if (enviando.current || !navigator.onLine) return;
      enviando.current = true;
      let llegaron = 0;
      try {
        for (const p of lote) {
          if (p.error) continue;
          let fotoPath = p.fotoPath;
          if (!fotoPath && p.fotoData) {
            const up = await subirDataUrl(p.fotoData);
            if (!up.ok) break;
            fotoPath = up.path;
            setCola((c) => c.map((x) => (x.clientRef === p.clientRef ? { ...x, fotoPath, fotoData: null } : x)));
          }
          const r = await registrarMovimientoCaja({ clientRef: p.clientRef, tipo: p.tipo, monto: p.monto, motivo: p.motivo, justificacion: p.justificacion, detalle: p.detalle, fotoPath, compraId: p.compraId, at: p.at });
          if (r.ok) {
            llegaron += 1;
            setCola((c) => c.filter((x) => x.clientRef !== p.clientRef));
            setEnviados((e) => [...e, { ...p, fotoPath, fotoData: null }]);
          } else if (r.retry) {
            break;
          } else {
            setCola((c) => c.map((x) => (x.clientRef === p.clientRef ? { ...x, error: r.error } : x)));
            setFlash({ text: `No se pudo registrar: ${r.error}`, tone: "bad" });
          }
        }
      } catch {
        // No answer: what is left stays queued and goes out with the next retry.
      } finally {
        enviando.current = false;
        if (llegaron) router.refresh();
      }
    },
    [router],
  );

  // Send what is queued as soon as it can: now, when the internet is back, and every 15 s while something waits.
  React.useEffect(() => {
    const listos = cola.filter((p) => !p.error);
    if (!listos.length || !online) return;
    queueMicrotask(() => void enviar(listos));
    const t = window.setInterval(() => void enviar(listos), 15_000);
    return () => window.clearInterval(t);
  }, [cola, online, enviar]);

  // The POS keeps selling: refresh the cash every 90 s on the home screen.
  React.useEffect(() => {
    if (view !== "inicio" || !online) return;
    const t = window.setInterval(() => router.refresh(), 90_000);
    return () => window.clearInterval(t);
  }, [view, online, router]);

  const enviarCierre = React.useCallback(
    async (input: CierreInput): Promise<{ ok: true } | { ok: false; error: string }> => {
      const enEspera = () => {
        setCierrePend(input);
        guardarCierrePend(input);
        return { ok: true as const };
      };
      if (!navigator.onLine) return enEspera();
      try {
        const r = await enviarCierreCaja(input);
        if (!r.ok) return r;
        writeDraft(draftKey(estado.today, input.shiftInstanceId), null);
        setResultado({ r, contadas: input.denominaciones });
        router.refresh();
        return { ok: true };
      } catch {
        return enEspera();
      }
    },
    [estado.today, router],
  );

  // A count saved without internet goes out when it's back.
  React.useEffect(() => {
    if (!cierrePend || !online) return;
    let alive = true;
    void (async () => {
      try {
        const r = await enviarCierreCaja(cierrePend);
        if (!alive) return;
        setCierrePend(null);
        guardarCierrePend(null);
        if (r.ok) {
          writeDraft(draftKey(estado.today, cierrePend.shiftInstanceId), null);
          setResultado({ r, contadas: cierrePend.denominaciones });
          setFlash({ text: "Volvió el internet: el arqueo se envió.", tone: "ok" });
          router.refresh();
        } else {
          setFlash({ text: `El arqueo guardado no se pudo enviar: ${r.error}`, tone: "bad" });
        }
      } catch {
        /* still no answer: try again on the next «online» */
      }
    })();
    return () => {
      alive = false;
    };
  }, [cierrePend, online, estado.today, router]);

  const rows = React.useMemo(() => unirMovimientos(estado.movimientos, [...enviados, ...cola]), [estado.movimientos, enviados, cola]);
  const suma = sumaVentana(rows, estado.ventana?.desde ?? null);
  const esperado = esperadoCaja(estado.baseInicial, estado.pagos.efectivo, suma.ingresos, suma.salidas);
  const enEspera = rows.filter((r) => r.espera).length;

  const inst = estado.instances.find((i) => i.id === estado.instanceId) ?? null;
  const vivo = inst && estado.existing[inst.id]?.status !== "rechazado" ? estado.existing[inst.id] ?? null : null;
  const prev = estado.base.cierre;
  const porValidar = estado.porValidar && !validada ? estado.porValidar : null;
  const falta = estado.finAt && now ? faltaPara(estado.finAt, now) : null;
  const cerca = !!estado.finAt && !!now && Date.parse(estado.finAt) - now < 60 * 60_000;
  const porConfirmarN = rows.filter((r) => !r.espera && porConfirmar({ motivo: r.motivo, fotoPath: r.tieneFoto ? "x" : null, compraConFactura: r.compraConFactura, anulado: !!r.anuladoAt })).length;

  const baseHint = prev
    ? `La dejó ${prev.counted_by_name ?? "el cierre"}${prev.shift_name ? ` (${prev.shift_name})` : ""} el ${fechaCorta(prev.shift_date ?? prev.submitted_at.slice(0, 10))}${prev.base_validada_ok === false && prev.base_encontrada_cop != null ? ` · al abrir encontraron ${plata(prev.base_encontrada_cop)}` : ""}.`
    : "No hay un cierre anterior registrado: corrígela si abriste con otra base.";

  const lineas: LineaEstado[] = [];
  if (porValidar) lineas.push({ tone: "pend", text: "Valida la base que dejaron", sub: plata(porValidar.base_dejada_cop), onClick: () => setValidarLuego(false) });
  else if (prev?.base_validada_at && prev.shift_instance_id !== estado.instanceId)
    lineas.push(prev.base_validada_ok ? { tone: "ok", text: "Base validada ✓", sub: `${prev.base_validada_by_name?.split(" ")[0] ?? "—"} · ${hora(prev.base_validada_at, tz)}` } : { tone: "bad", text: `Base con diferencia: encontraron ${plata(prev.base_encontrada_cop ?? 0)}`, sub: prev.base_validada_by_name?.split(" ")[0] ?? undefined });
  else if (validada) lineas.push({ tone: "ok", text: "Base validada ✓", sub: actor.name.split(" ")[0] });
  else if (!prev) lineas.push({ tone: "mute", text: "Sin base anterior registrada" });
  if (!inst) lineas.push({ tone: "mute", text: "Hoy no hay turno en esta sede" });
  else if (cierrePend) lineas.push({ tone: "pend", text: "Arqueo guardado en la tablet", sub: "se envía al volver el internet" });
  else if (vivo) {
    lineas.push({ tone: "ok", text: vivo.status === "aprobado" ? "Arqueo aprobado ✓" : "Arqueo enviado · pendiente de aprobar", sub: hora(vivo.submitted_at, tz) });
    if (!vivo.base_confirmada_at) lineas.push({ tone: "pend", text: "Falta confirmar la base de mañana", onClick: () => setView("arqueo") });
  } else lineas.push({ tone: "pend", text: "Arqueo pendiente", sub: `${inst.template_name} · cierre a las ${inst.fin.slice(0, 5)}` });
  if (porConfirmarN) lineas.push({ tone: "pend", text: `${porConfirmarN} movimiento${porConfirmarN === 1 ? "" : "s"} por confirmar`, sub: "falta la foto" });

  const arqueoBtn = vivo
    ? { label: "Ver arqueo enviado", sub: vivo.base_confirmada_at ? "Base confirmada ✓" : "Falta confirmar la base", hot: !vivo.base_confirmada_at, onClick: () => setView("arqueo") }
    : { label: "Hacer arqueo", sub: !inst ? "Sin turno hoy" : falta ? `Falta ${falta} para cerrar` : now ? "Ya es hora de cerrar" : "", hot: !!inst && cerca, onClick: () => setView("arqueo") };

  const notaBase = prev?.base_validada_at && todayInTz(tz, new Date(prev.base_validada_at)) === estado.today && prev.shift_instance_id !== estado.instanceId
    ? { at: prev.base_validada_at, text: `${prev.base_validada_by_name?.split(" ")[0] ?? "Alguien"} ${prev.base_validada_ok ? `validó la base: ${plata(prev.base_dejada_cop)} ✓` : `encontró ${plata(prev.base_encontrada_cop ?? 0)} en la base (dejaron ${plata(prev.base_dejada_cop)})`}` }
    : null;

  function registrar(m: NuevoMovimiento) {
    const p: MovPendiente = { ...m, clientRef: nuevoRef(), at: new Date().toISOString(), by: actor.name };
    setCola((c) => [...c, p]);
    setView("inicio");
    setFlash({ text: `${m.tipo === "ingreso" ? "Entrada" : "Salida"} de ${plata(m.monto)} · ${MOTIVO_CAJA[m.motivo].label}${navigator.onLine ? " registrada." : " guardada en la tablet."}`, tone: "ok" });
  }

  const verFoto = React.useCallback((id: string) => fotoMovimientoCaja({ id }), []);
  const mov = detalle ? rows.find((r) => r.key === detalle) ?? null : null;
  const crumb = view === "salida" ? "Nueva salida" : view === "entrada" ? "Nueva entrada" : view === "arqueo" ? "Arqueo" : undefined;
  const dot = !!porValidar || porConfirmarN > 0 || (!!inst && !vivo && cerca) || (!!vivo && !vivo.base_confirmada_at);

  return (
    <div className="cj">
      <style>{CAJA_CSS}</style>
      <CajaHead sedeName={sedeName} today={estado.today} tz={tz} actorName={actor.name} crumb={crumb} cajaDot={dot} />
      {!online && (
        <div className="cj-band" role="status">
          <IcoNube size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <b>Sin internet: lo guardamos en la tablet.</b>
            <small>Puedes seguir registrando. Todo se enviará solo cuando vuelva el internet; las fotos también.</small>
          </span>
          {enEspera > 0 && <span className="cj-band-count">{enEspera} en espera</span>}
        </div>
      )}
      {flash && (
        <div className="cj-band" role="status" style={{ background: flash.tone === "ok" ? "var(--green)" : "var(--red)", color: "var(--paper-lt)" }}>
          <IcoCheck />
          <b>{flash.text}</b>
        </div>
      )}

      {view === "inicio" && porValidar && !validarLuego ? (
        <ValidarBase
          cierre={porValidar}
          tz={tz}
          online={online}
          validate={async (input) => {
            try {
              return await validarBaseCaja(input);
            } catch {
              return { ok: false, error: "Sin conexión. Intenta otra vez." };
            }
          }}
          onDone={() => {
            setValidada(true);
            setFlash({ text: "Base validada. Ya puedes abrir la caja.", tone: "ok" });
            router.refresh();
          }}
          onLater={() => setValidarLuego(true)}
        />
      ) : view === "inicio" ? (
        <Inicio
          esperado={esperado}
          desglose={{ baseInicial: estado.baseInicial, efectivo: estado.pagos.efectivo, pagos: estado.pagos.count, ...suma, enEspera, desde: estado.ventana?.desde ?? null }}
          estado={lineas}
          arqueo={arqueoBtn}
          rows={rows}
          tz={tz}
          online={online}
          notaBase={notaBase}
          onEntrada={() => setView("entrada")}
          onSalida={() => setView("salida")}
          onOpen={setDetalle}
        />
      ) : view === "salida" ? (
        <SalidaFlow disponible={esperado} porPagar={estado.porPagar} actorName={actor.name} online={online} onCancel={() => setView("inicio")} onRegistrar={registrar} />
      ) : view === "entrada" ? (
        <EntradaFlow actorName={actor.name} online={online} onCancel={() => setView("inicio")} onRegistrar={registrar} />
      ) : (
        <ArqueoFlow
          today={estado.today}
          tz={tz}
          actorName={actor.name}
          online={online}
          instanceId={inst?.id ?? null}
          instanceName={inst ? `${inst.template_name} · ${inst.inicio.slice(0, 5)}–${inst.fin.slice(0, 5)}` : null}
          cierre={vivo}
          baseInicial={estado.baseInicial}
          baseInicialHint={baseHint}
          baseDejadaSugerida={estado.base.monto}
          movimientos={rows}
          resultado={resultado}
          pendiente={!!cierrePend}
          enviar={enviarCierre}
          guardarNota={(cierreId, nota) => notaCierreCaja({ cierreId, nota }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }))}
          confirmar={(cierreId) =>
            confirmarBaseCaja({ cierreId })
              .then((r) => {
                if (r.ok) router.refresh();
                return r;
              })
              .catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }))
          }
          ajustar={(cierreId, baseDejada) => ajustarBaseCaja({ cierreId, baseDejada }).catch(() => ({ ok: false as const, error: "Sin conexión. Intenta otra vez." }))}
          onSalir={() => {
            setResultado(null);
            setView("inicio");
            router.refresh();
          }}
        />
      )}

      {mov && (
        <DetalleMovimiento
          key={mov.key}
          mov={mov}
          tz={tz}
          online={online}
          verFoto={verFoto}
          adjuntar={async (id, path) => {
            const r = await adjuntarFotoMovimientoCaja({ id, path }).catch(() => ({ ok: false as const, error: "Sin conexión." }));
            if (r.ok) {
              setFlash({ text: "Foto guardada: el movimiento quedó confirmado.", tone: "ok" });
              router.refresh();
            }
            return r;
          }}
          anular={async (id, motivo) => {
            const r = await anularMovimientoCaja({ id, motivo }).catch(() => ({ ok: false as const, error: "Sin conexión." }));
            if (r.ok) {
              setFlash({ text: "Movimiento anulado.", tone: "ok" });
              router.refresh();
            }
            return r;
          }}
          descartar={(key) => setCola((c) => c.filter((p) => p.clientRef !== key))}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
