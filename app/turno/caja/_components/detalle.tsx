"use client";

import * as React from "react";
import { MOTIVO_CAJA, porConfirmar } from "@/lib/caja/movimientos";
import { fechaCorta, todayInTz } from "@/lib/utils";
import { IcoAlerta, IcoCamara, IcoNube, IcoX } from "./icons";
import { hora, plata, type MovVista } from "./model";
import { FOTO_VACIA, FotoCaptura, type FotoValor } from "./parts";

type R = { ok: true } | { ok: false; error: string };

/**
 * One movement, opened from «Movimientos de hoy»: the why and the details,
 * who and when, its photo (or the one still owed, which can be taken
 * here), and «Anular» — which never deletes: it stays crossed out for the
 * owner and the arqueo stops counting it.
 */
export function DetalleMovimiento({ mov, tz, online, verFoto, adjuntar, anular, descartar, onClose }: {
  mov: MovVista;
  tz: string;
  online: boolean;
  verFoto: (id: string) => Promise<{ ok: true; url: string | null } | { ok: false; error: string }>;
  adjuntar: (id: string, path: string) => Promise<R>;
  anular: (id: string, motivo: string) => Promise<R>;
  descartar: (key: string) => void;
  onClose: () => void;
}) {
  const [foto, setFoto] = React.useState<string | null | undefined>(mov.fotoData ?? undefined);
  const [nueva, setNueva] = React.useState<FotoValor>(FOTO_VACIA);
  const [anulando, setAnulando] = React.useState(false);
  const [motivoAnular, setMotivoAnular] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const falta = porConfirmar({ motivo: mov.motivo, fotoPath: mov.tieneFoto ? "x" : null, compraConFactura: mov.compraConFactura, anulado: !!mov.anuladoAt });
  const conf = MOTIVO_CAJA[mov.motivo];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The photo lives in a private bucket: ask for a short-lived link when the sheet opens.
  React.useEffect(() => {
    if (!mov.id || mov.fotoData || (!mov.tieneFoto && !mov.compraConFactura) || !online) return;
    let alive = true;
    void verFoto(mov.id).then((r) => alive && setFoto(r.ok ? r.url : null)).catch(() => alive && setFoto(null));
    return () => {
      alive = false;
    };
  }, [mov.id, mov.fotoData, mov.tieneFoto, mov.compraConFactura, online, verFoto]);

  async function guardarFoto() {
    if (!mov.id || !nueva.path) return;
    setBusy(true);
    setError(null);
    const r = await adjuntar(mov.id, nueva.path);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setFoto(nueva.preview);
    onClose();
  }
  async function doAnular() {
    if (!mov.id || motivoAnular.trim().length < 5) return;
    setBusy(true);
    setError(null);
    const r = await anular(mov.id, motivoAnular.trim());
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onClose();
  }

  const dia = todayInTz(tz, new Date(mov.at));
  const extra = [
    mov.detalle.plataforma && ["Plataforma", mov.detalle.plataforma],
    mov.detalle.orden && ["N.º orden", mov.detalle.orden],
    mov.detalle.quien && ["La lleva", mov.detalle.quien],
    mov.detalle.denominaciones?.length && ["Piezas", mov.detalle.denominaciones.map((d) => `${d.cantidad} × ${plata(d.valor)}`).join(" · ")],
    mov.compraLabel && ["Pedido", mov.compraLabel],
  ].filter(Boolean) as Array<[string, string]>;

  return (
    <div className="cj-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cj-sheet" role="dialog" aria-modal="true" aria-labelledby="cj-dt">
        <div className="cj-sheet-main">
          <div className="cj-sheet-top">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="cj-lab">{mov.tipo === "ingreso" ? "Entrada" : "Salida"} · {conf.label}</span>
              <h2 id="cj-dt" className={`cj-slab ${mov.tipo === "ingreso" ? "cj-in" : "cj-out"}`} style={{ margin: 0, fontSize: 44, lineHeight: 1, textDecoration: mov.anuladoAt ? "line-through" : undefined }}>
                {mov.tipo === "ingreso" ? "+" : "−"} {plata(mov.monto)}
              </h2>
            </div>
            <button type="button" className="cj-x" aria-label="Cerrar" onClick={onClose}><IcoX /></button>
          </div>
          {mov.espera && (mov.error ? <div className="cj-warn red"><IcoAlerta />No se pudo registrar: {mov.error}</div> : <div className="cj-warn amber"><IcoNube size={20} />Guardado en la tablet · se envía {online ? "en un momento" : "cuando vuelva el internet"}.</div>)}
          {mov.anuladoAt && <div className="cj-warn red"><IcoAlerta />Anulado{mov.anuladoBy ? ` por ${mov.anuladoBy}` : ""} a las {hora(mov.anuladoAt, tz)}{mov.anuladoMotivo ? `: “${mov.anuladoMotivo}”` : ""}. El arqueo no lo cuenta.</div>}
          {falta && !mov.espera && <div className="cj-warn amber"><IcoCamara size={20} />Este movimiento quedó por confirmar: {falta}.</div>}
          <div className="cj-dl">
            <span>¿Por qué?</span><span>“{mov.justificacion}”</span>
            {extra.map(([k, v]) => (
              <React.Fragment key={k}><span>{k}</span><span>{v}</span></React.Fragment>
            ))}
            <span>Quién</span><span>{mov.by ?? "—"}</span>
            <span>Cuándo</span><span>{fechaCorta(dia)} · {hora(mov.at, tz)}</span>
          </div>
          {error && <div role="alert" className="cj-warn red"><IcoAlerta />{error}</div>}

          {mov.id && !mov.anuladoAt && (falta || !mov.tieneFoto) && (
            <>
              <FotoCaptura label={falta ? conf.fotoLabel : "Agregar foto"} value={nueva} onChange={setNueva} online={online} />
              {nueva.data && !nueva.path && <span className="cj-fine">Sin internet no se puede adjuntar todavía.</span>}
              {nueva.path && <button type="button" className="cj-btn dark" disabled={busy} onClick={() => void guardarFoto()}>{busy ? "Guardando…" : "Guardar foto"}</button>}
            </>
          )}

          <div className="cj-grow" />
          {mov.espera ? (
            mov.error && <button type="button" className="cj-btn ghost" onClick={() => { descartar(mov.key); onClose(); }}>Descartar de la tablet</button>
          ) : !mov.anuladoAt && mov.id ? (
            anulando ? (
              <div className="cj-card soft">
                <span className="cj-lab">¿Por qué lo anulas? · obligatorio</span>
                <input className="cj-field sm" autoFocus value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value.slice(0, 200))} aria-label="Por qué se anula" placeholder="Ej.: lo registré dos veces" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="cj-btn sm red" disabled={busy || !online || motivoAnular.trim().length < 5} onClick={() => void doAnular()}>{busy ? "Anulando…" : "Anular movimiento"}</button>
                  <button type="button" className="cj-btn sm" onClick={() => setAnulando(false)}>Volver</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className="cj-btn ghost" disabled={!online} onClick={() => setAnulando(true)}>Anular</button>
                <span className="cj-fine" style={{ textAlign: "left" }}>Anular no borra nada: queda registrado como anulado y el dueño lo ve.</span>
              </>
            )
          ) : null}
        </div>
        <div className="cj-sheet-side">
          <span className="cj-lab">Foto{mov.compraConFactura && !mov.tieneFoto ? " · factura del pedido" : ""}</span>
          <div className="cj-photo-view">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL of a private photo
              <img src={foto} alt={`Foto de ${conf.label}`} />
            ) : foto === undefined && (mov.tieneFoto || mov.compraConFactura) ? (
              <span>{online ? "Cargando…" : "Sin internet: la foto se ve cuando vuelva."}</span>
            ) : (
              <span>Sin foto todavía.{falta ? <><br />{conf.foto === "obligatoria" ? "Es obligatoria para pagos a proveedor." : "Súbela para confirmar el movimiento."}</> : null}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
