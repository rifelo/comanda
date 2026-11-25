"use client";

import * as React from "react";
import { enlacePedido, ORIGENES } from "@/lib/menu/origenes";
import { gruposCafe, money, precioK, type MenuItem, type MenuSection } from "@/lib/menu/menu";
import { agregarPara, enlaceWhatsapp, faltaPara, lineasDelPedido, llevaEtiqueta, mensajePedido, nombrar, sumar, totalPedido, unidades, type Entrega, type LineaCarrito, type LineaPedido, type RefLinea } from "@/lib/menu/pedido-web";
import "./inicio/inicio.css";
import "./tienda.css";

interface Props {
  sections: MenuSection[];
  header: { titulo: string; texto: string };
  footer: { tagline: string; texto: string; instagram: string };
  compartir: { url: string; qr: string; titulo: string; texto: string; mensaje: string };
}

const LOGO = "/brand/payo-mark.svg";
const MANO = "/menu/art/mano-taza.svg";
const GUARDADO = "payo-pedido-v1";

/** «$8.5K» in the numbers' face; read out whole ($8.500). */
function Precio({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`pyh-n ${className}`} aria-label={money(n)}>
      <span aria-hidden="true">${precioK(n)}</span>
    </span>
  );
}

function Cerrar({ ref, onClick }: { ref: React.Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    <button ref={ref} type="button" aria-label="Cerrar" className="pyt-cerrar" onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

const IconoCompartir = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
);

const IconoWhatsapp = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6L3 21Z" />
    <path d="M9 8.6c0 3.200 3.200 6.400 6.400 6.400l1.100-1.600-2-1.100-.9.800c-1-.5-2.200-1.700-2.700-2.700l.8-.9-1.100-2L9 8.600Z" fill="currentColor" stroke="none" />
  </svg>
);

/** − n +, for one line of the order. */
function Cantidad({ n, nombre, onMenos, onMas, chico }: { n: number; nombre: string; onMenos: () => void; onMas: () => void; chico?: boolean }) {
  return (
    <span className={`pyt-cant${chico ? " pyt-cant--s" : ""}`}>
      <button type="button" aria-label={`Quitar uno de ${nombre}`} onClick={onMenos}>−</button>
      <span className="pyh-n" aria-live="polite" aria-label={`${n} en el pedido`}>{n}</span>
      <button type="button" aria-label={`Agregar otro ${nombre}`} onClick={onMas}>+</button>
    </span>
  );
}

/**
 * cafepayo.com/menu as a shop: photo cards by section, a cart that lives on the
 * phone, and the order leaves as a WhatsApp message to the café. Nothing is
 * charged or saved here; the café answers in the chat.
 */
export function MenuClient({ sections, header, footer, compartir }: Props) {
  const [abierto, setAbierto] = React.useState<string | null>(null);
  const [viendoPedido, setViendoPedido] = React.useState(false);
  const [compartiendo, setCompartiendo] = React.useState(false);
  const [carrito, setCarrito] = React.useState<LineaCarrito[]>([]);
  const [nombre, setNombre] = React.useState("");
  const [cargado, setCargado] = React.useState(false);
  const opener = React.useRef<HTMLElement | null>(null);

  // Came from the QR of a printed piece (?desde=…): that place is a delivery point.
  // Read on the client, so the page itself stays cached for everyone.
  const [desde, setDesde] = React.useState<string | null>(null);
  React.useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("desde");
    let guardado: { carrito?: LineaCarrito[]; nombre?: string } = {};
    try {
      guardado = JSON.parse(window.localStorage.getItem(GUARDADO) ?? "{}") ?? {};
    } catch {
      /* private window or a broken entry: start empty */
    }
    queueMicrotask(() => {
      setDesde(o && ORIGENES[o] ? o : null);
      if (Array.isArray(guardado.carrito)) setCarrito(guardado.carrito.filter((l) => l && typeof l.sku === "string" && Number.isInteger(l.cantidad)));
      if (typeof guardado.nombre === "string") setNombre(guardado.nombre);
      setCargado(true);
    });
  }, []);
  React.useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(GUARDADO, JSON.stringify({ carrito, nombre }));
    } catch {
      /* the order still works for this visit */
    }
  }, [carrito, nombre, cargado]);

  const todos = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const porSku = React.useMemo(() => new Map(todos.map((i) => [i.sku, i])), [todos]);
  const lineas = React.useMemo(() => lineasDelPedido(carrito, porSku), [carrito, porSku]);
  const enPedido = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) m.set(l.sku, (m.get(l.sku) ?? 0) + l.cantidad);
    return m;
  }, [lineas]);
  const total = totalPedido(lineas);
  const cuantos = unidades(lineas);
  const sel = abierto ? porSku.get(abierto) ?? null : null;

  const cambiar = React.useCallback((ref: RefLinea, delta: number) => setCarrito((c) => sumar(c, ref, delta)), []);
  const nombrarVaso = React.useCallback((ref: RefLinea, i: number, n: string) => setCarrito((c) => nombrar(c, ref, i, n)), []);
  const cerrar = React.useCallback(() => {
    setAbierto(null);
    setViendoPedido(false);
    setCompartiendo(false);
    opener.current?.focus();
  }, []);
  function ver(sku: string, from: HTMLElement) {
    opener.current = from;
    setAbierto(sku);
  }

  return (
    <div className={`pyh pyt${cuantos > 0 ? " pyt--con-pedido" : ""}`}>
      <header className="pyh-head">
        <div className="pyh-wrap pyh-head__in">
          <a href="https://cafepayo.com" className="pyh-marca" aria-label="Inicio de Café Pa' Yo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="" />
            <span>Café Pa&apos; Yo</span>
          </a>
          <nav aria-label="Principal" className="pyh-nav">
            <a href="/menu/puntos">Mis puntos</a>
            <button type="button" className="pyt-icono" aria-label="Compartir el menú" onClick={(e) => { opener.current = e.currentTarget; setCompartiendo(true); }}><IconoCompartir /></button>
          </nav>
        </div>
      </header>

      <section className="pyt-intro">
        <div className="pyh-wrap pyt-intro__in">
          <span className="pyh-k">{header.titulo}</span>
          <h1>Arma tu pedido</h1>
          <p>Elige lo que quieres y envíalo por WhatsApp. Lo recoges en el café o te lo llevamos.</p>
          {desde && (
            <p className="pyt-desde">
              <strong>Te lo llevamos a {ORIGENES[desde].entrega}</strong> de {ORIGENES[desde].nombre}, sin costo de envío.
            </p>
          )}
        </div>
      </section>

      <nav aria-label="Categorías" className="pyt-cats">
        <div className="pyh-wrap pyt-cats__fila">
          {sections.map((s) => (
            <a key={s.id} href={`#cat-${s.id}`} className="pyt-cat">{s.label}</a>
          ))}
        </div>
      </nav>

      <main>
        {sections.map((sec) => (
          <section key={sec.id} id={`cat-${sec.id}`} className="pyt-seccion" aria-labelledby={`cat-t-${sec.id}`}>
            <div className="pyh-wrap pyh-bloque">
              <div className="pyh-titulo">
                <h2 id={`cat-t-${sec.id}`}>{sec.label}</h2>
                <span className="pyh-meta pyh-meta--m">{sec.sub}</span>
              </div>
              {gruposCafe(sec.items).map((g) => (
                <div key={g.id} className="pyt-grupo" role={g.label ? "group" : undefined} aria-label={g.label ? `${sec.label} · ${g.label}` : undefined}>
                  {g.label && <h3 className="pyh-k">{g.label} · {g.items.length}</h3>}
                  <ul className="pyt-grid">
                    {g.items.map((it) => (
                      <Tarjeta
                        key={it.sku}
                        item={it}
                        n={enPedido.get(it.sku) ?? 0}
                        onVer={(el) => ver(it.sku, el)}
                        onMas={() => cambiar({ sku: it.sku, opcion: null }, 1)}
                        onMenos={() => cambiar({ sku: it.sku, opcion: null }, -1)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="pyh-pie">
        <div className="pyh-wrap pyh-pie__in">
          <div className="pyh-pie__firma">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="Café Pa' Yo" />
            <span>{footer.tagline}</span>
          </div>
          <nav aria-label="Enlaces" className="pyh-pie__links">
            <a href="https://cafepayo.com">Inicio</a>
            <a href="/menu/puntos">Mis puntos</a>
            <a href={`https://instagram.com/${footer.instagram.replace(/^@/, "")}`} rel="noopener">Instagram</a>
          </nav>
        </div>
      </footer>

      {cuantos > 0 && !viendoPedido && !sel && (
        <div className="pyt-barra">
          <button type="button" className="pyt-barra__btn" onClick={(e) => { opener.current = e.currentTarget; setViendoPedido(true); }}>
            <span className="pyt-barra__n pyh-n">{cuantos}</span>
            <span className="pyt-barra__txt">Ver mi pedido</span>
            <Precio n={total} />
          </button>
        </div>
      )}

      {compartiendo && <Compartir c={compartir} onClose={cerrar} />}
      {sel && (
        <Ficha
          key={sel.sku}
          item={sel}
          seccion={sections.find((s) => s.id === sel.cat)?.label ?? ""}
          nombre={nombre}
          onAgregar={(op, tamano, n, para) => {
            const ref = { sku: sel.sku, opcion: op, tamano };
            if (para === null) cambiar(ref, n);
            else {
              setCarrito((c) => agregarPara(c, ref, n, para));
              // The first name typed is also who orders, until they say otherwise.
              if (!nombre.trim() && para.trim()) setNombre(para.trim());
            }
            cerrar();
          }}
          onClose={cerrar}
        />
      )}
      {viendoPedido && (
        <Pedido
          lineas={lineas}
          total={total}
          nombre={nombre}
          onNombre={setNombre}
          punto={desde ? `${ORIGENES[desde].entrega} de ${ORIGENES[desde].nombre}` : null}
          onCambiar={cambiar}
          onNombrar={nombrarVaso}
          onVaciar={() => setCarrito([])}
          onClose={cerrar}
        />
      )}
      {/* the plain chat for whoever would rather write than tap */}
      {desde && cuantos === 0 && enlacePedido(desde) && (
        <a className="pyt-chat" href={enlacePedido(desde)!} target="_blank" rel="noopener noreferrer" aria-label="Escribir al WhatsApp del café"><IconoWhatsapp size={24} /></a>
      )}
    </div>
  );
}

/** A product in the grid: the photo and name open its sheet; the round button adds one (or opens the sheet when there is something to choose). */
function Tarjeta({ item, n, onVer, onMas, onMenos }: { item: MenuItem; n: number; onVer: (el: HTMLElement) => void; onMas: () => void; onMenos: () => void }) {
  // A drink always opens its sheet: it needs the name for its label.
  const conOpciones = item.options.length > 0 || item.sizes.length > 0 || llevaEtiqueta(item.cat);
  return (
    <li className={`pyt-card${item.agotado ? " pyt-card--off" : ""}`}>
      <button type="button" className="pyt-card__ver" onClick={(e) => onVer(e.currentTarget)}>
        <span className={`pyt-card__foto${item.image ? "" : " pyt-card__foto--arte"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- product photo from storage, already sized */}
          <img src={item.image ?? MANO} alt="" loading="lazy" decoding="async" />
          {item.nuevo && !item.agotado && <span className="pyt-tag">Nuevo</span>}
          {item.agotado && <span className="pyt-tag pyt-tag--off">Agotado hoy</span>}
        </span>
        <span className="pyt-card__nombre">{item.name}</span>
        {item.short && <span className="pyt-card__short">{item.short}</span>}
      </button>
      <div className="pyt-card__pie">
        <Precio n={item.price} className="pyt-card__precio" />
        {item.agotado ? null : n > 0 && !conOpciones ? (
          <Cantidad chico n={n} nombre={item.name} onMenos={onMenos} onMas={onMas} />
        ) : (
          <button type="button" className="pyt-mas" aria-label={`Agregar ${item.name} al pedido`} onClick={(e) => (conOpciones ? onVer(e.currentTarget) : onMas())}>
            {n > 0 ? <span className="pyh-n">{n}</span> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
          </button>
        )}
      </div>
    </li>
  );
}

/** While a sheet is open: focus its close button, lock the page behind, close on Escape. */
function useSheet(onClose: () => void, closeRef: React.RefObject<HTMLButtonElement | null>) {
  React.useEffect(() => {
    closeRef.current?.focus();
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, closeRef]);
}

/**
 * Swipe a sheet down to close it, as an alternative to the X. The drag only
 * starts when the sheet is scrolled to the top (a long sheet keeps its own
 * scroll); the sheet follows the finger and the overlay fades with it. Let go
 * past ~110 px, or with a quick flick, and it slides away; otherwise it
 * springs back.
 */
function useSwipeDown(sheetRef: React.RefObject<HTMLDivElement | null>, overlayRef: React.RefObject<HTMLButtonElement | null>, onClose: () => void) {
  React.useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    let startY = 0, startT = 0, dy = 0, tracking = false, dragging = false;
    const paint = (y: number, animate: boolean) => {
      sheet.style.transition = animate ? "transform .2s ease-out" : "none";
      sheet.style.transform = y ? `translateY(${y}px)` : "";
      const o = overlayRef.current;
      if (o) {
        o.style.transition = animate ? "opacity .2s ease-out" : "none";
        o.style.opacity = y ? String(Math.max(0, 1 - y / (sheet.offsetHeight || 1))) : "";
      }
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      dragging = false;
      startY = e.touches[0].clientY;
      startT = performance.now();
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        // Only a downward pull from the very top becomes a drag.
        if (dy > 6 && sheet.scrollTop <= 0) dragging = true;
        else if (dy < -6 || sheet.scrollTop > 0) { tracking = false; return; }
        else return;
      }
      e.preventDefault();
      paint(Math.max(0, dy), false);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const v = dy / Math.max(1, performance.now() - startT);
      if (dy > 110 || (dy > 40 && v > 0.5)) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
        paint(sheet.offsetHeight, true);
        window.setTimeout(onClose, 180);
      } else paint(0, true);
    };
    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetRef, overlayRef, onClose]);
}

/**
 * Share the menu: the QR for whoever is next to you, and the link for
 * whoever is not — through the phone's own share sheet where it exists,
 * copied to the clipboard otherwise.
 */
function Compartir({ c, onClose }: { c: Props["compartir"]; onClose: () => void }) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLButtonElement>(null);
  useSheet(onClose, closeRef);
  useSwipeDown(sheetRef, overlayRef, onClose);
  const [copiado, setCopiado] = React.useState(false);
  const [puedeCompartir, setPuedeCompartir] = React.useState(false);
  React.useEffect(() => {
    // Only known on the client; deferred so the first render matches the server's.
    queueMicrotask(() => setPuedeCompartir(typeof navigator !== "undefined" && typeof navigator.share === "function"));
  }, []);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }
  async function enviar() {
    try {
      await navigator.share({ title: "Café Pa' Yo", text: c.mensaje, url: c.url });
    } catch {
      /* the person closed the share sheet */
    }
  }
  return (
    <>
      <button ref={overlayRef} type="button" aria-label="Cerrar" className="pyt-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={c.titulo} className="pyt-sheet">
        <div className="pyt-sheet__top">
          <h2>{c.titulo}</h2>
          <Cerrar ref={closeRef} onClick={onClose} />
        </div>
        <div className="pyt-sheet__body pyt-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.qr} alt={`Código QR de ${c.url.replace(/^https?:\/\//, "")}`} className="pyt-qr__img" width={260} height={260} />
          <p className="pyt-qr__url pyh-n">{c.url.replace(/^https?:\/\//, "")}</p>
          <p className="pyh-meta pyh-meta--m">{c.texto}</p>
          <div className="pyt-qr__actions">
            {puedeCompartir && <button type="button" className="pyh-btn" onClick={() => void enviar()}>Enviar enlace</button>}
            <button type="button" className="pyh-btn pyh-btn--linea" onClick={() => void copiar()}>{copiado ? "Enlace copiado" : "Copiar enlace"}</button>
          </div>
          <span role="status" className="pyt-sr">{copiado ? "Enlace copiado" : ""}</span>
        </div>
      </div>
    </>
  );
}

/** The product sheet: photo, what it is, what it has, the choice it needs and how many. */
function Ficha({ item, seccion, nombre, onAgregar, onClose }: {
  item: MenuItem;
  seccion: string;
  /** Who is ordering, if already known: the name the label starts with. */
  nombre: string;
  /** `para` is the name for the cups' labels; null for what has no label. */
  onAgregar: (opcion: string | null, tamano: string | null, n: number, para: string | null) => void;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLButtonElement>(null);
  useSheet(onClose, closeRef);
  useSwipeDown(sheetRef, overlayRef, onClose);
  const [opcion, setOpcion] = React.useState(0);
  const [n, setN] = React.useState(1);
  const conEtiqueta = llevaEtiqueta(item.cat);
  const [para, setPara] = React.useState(nombre);
  const [tamano, setTamano] = React.useState(0);
  const opt = item.options[opcion] ?? null;
  const tam = item.sizes[tamano] ?? null;
  const precio = item.price + (opt?.delta ?? 0) + (tam?.delta ?? 0);
  return (
    <>
      <button ref={overlayRef} type="button" aria-label="Cerrar detalle" className="pyt-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={item.name} className="pyt-sheet">
        <div className="pyt-sheet__top">
          <span className="pyh-k">{seccion}</span>
          <Cerrar ref={closeRef} onClick={onClose} />
        </div>
        <div className="pyt-sheet__body">
          {/* eslint-disable-next-line @next/next/no-img-element -- product photo from storage, already sized */}
          {item.image && <img src={item.image} alt="" className="pyt-ficha__foto" />}
          <div className="pyt-ficha__fila">
            <h2>{item.name}</h2>
            <Precio n={precio} className="pyt-ficha__precio" />
          </div>
          {item.desc && <p className="pyt-ficha__desc">{item.desc}</p>}
          {item.lleva.length > 0 && <p className="pyh-meta pyh-meta--m">Lleva: {item.lleva.join(" · ")}</p>}
          {item.options.length > 0 && (
            <div className="pyt-campo" role="group" aria-label="¿Cómo lo quieres?">
              <span className="pyh-k">¿Cómo lo quieres?</span>
              <div className="pyt-opciones">
                {item.options.map((o, i) => (
                  <button key={o.name} type="button" className="pyt-opcion" aria-pressed={opcion === i} onClick={() => setOpcion(i)}>
                    {o.name}{o.delta > 0 ? ` +${money(o.delta)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          {item.sizes.length > 0 && (
            <div className="pyt-campo" role="group" aria-label="Tamaño">
              <span className="pyh-k">Tamaño</span>
              <div className="pyt-opciones">
                {item.sizes.map((t, i) => (
                  <button key={t.name} type="button" className="pyt-opcion pyt-opcion--dos" aria-pressed={tamano === i} onClick={() => setTamano(i)}>
                    <strong>{t.name}</strong>
                    <span>{money(item.price + (opt?.delta ?? 0) + t.delta)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {conEtiqueta && !item.agotado && (
            <div className="pyt-etiqueta">
              <VasoConEtiqueta nombre={para} bebida={item.name} grande={tamano > 0} />
              <label className="pyt-campo pyt-etiqueta__campo">
                <span className="pyh-k">¿Para quién es?</span>
                <input value={para} onChange={(e) => setPara(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="Nombre" />
                <span className="pyh-meta">Así sale la etiqueta de tu vaso.</span>
              </label>
            </div>
          )}
          {item.agotado ? (
            <p className="pyt-aviso">Hoy se nos acabó. Escríbenos y te contamos cuándo vuelve.</p>
          ) : (
            <div className="pyt-ficha__accion">
              <Cantidad n={n} nombre={item.name} onMenos={() => setN((x) => Math.max(1, x - 1))} onMas={() => setN((x) => Math.min(20, x + 1))} />
              <button type="button" className="pyh-btn pyt-ficha__agregar" onClick={() => onAgregar(opt?.name ?? null, tam?.name ?? null, n, conEtiqueta ? para : null)}>
                Agregar · {money(precio * n)}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Up to two lines of about `max` characters, for the drink's name on its label. */
function dosLineas(texto: string, max: number): string[] {
  const out: string[] = [""];
  for (const w of texto.split(/\s+/)) {
    const ult = out[out.length - 1];
    if (!ult || (ult + " " + w).length <= max || out.length === 2) out[out.length - 1] = ult ? `${ult} ${w}` : w;
    else out.push(w);
  }
  return out;
}

/** A drawing of the cup with its two labels: «Pa' <nombre>» changes as the name is typed. */
function VasoConEtiqueta({ nombre, bebida, grande }: { nombre: string; bebida: string; grande?: boolean }) {
  const n = nombre.replace(/\s+/g, " ").trim();
  const texto = n || "Tu nombre";
  // Dela Gothic One is wide: about 0.78 em per letter, in a label 72 units wide.
  const cuerpo = Math.max(6, Math.min(17, Math.floor((72 / (Math.max(3, texto.length) * 0.78)) * 10) / 10));
  const lineas = dosLineas(bebida, 10);
  return (
    <svg className={`pyt-vasito${grande ? " pyt-vasito--grande" : ""}`} viewBox="0 0 200 224" role="img" aria-label={`Vaso con la etiqueta «Pa' ${texto}»`}>
      <ellipse cx="100" cy="212" rx="52" ry="7" fill="#502b1c" opacity=".1" />
      <path d="M44 36 L156 36 L139 204 Q100 214 61 204 Z" fill="#fffdf6" stroke="#502b1c" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="34" y="20" width="132" height="18" rx="7" fill="#fffdf6" stroke="#502b1c" strokeWidth="2.5" />
      <g transform="rotate(-3 100 88)">
        <rect x="56" y="58" width="88" height="56" rx="7" fill="#ffffff" stroke="#502b1c" strokeWidth="1.5" />
        <text x="65" y="75" className="pyt-vasito__pa">Pa&apos;</text>
        <text x="65" y={78 + cuerpo} className="pyt-vasito__nombre" style={{ fontSize: cuerpo, opacity: n ? 1 : 0.35 }}>{texto}</text>
      </g>
      <g transform="rotate(-3 100 150)">
        <rect x="62" y="124" width="76" height="46" rx="7" fill="#ffffff" stroke="#502b1c" strokeWidth="1.5" />
        {lineas.map((l, i) => (
          <text key={i} x="70" y={(lineas.length === 1 ? 151 : 144) + i * 12} className="pyt-vasito__bebida">{l}</text>
        ))}
      </g>
    </svg>
  );
}

/** The order: its lines, who it is for, where it goes, and the button that opens WhatsApp with everything written. */
function Pedido({ lineas, total, nombre, onNombre, punto, onCambiar, onNombrar, onVaciar, onClose }: {
  lineas: LineaPedido[];
  total: number;
  nombre: string;
  onNombre: (s: string) => void;
  /** «la portería de ESE Salud Yopal» when the visit came from that place's QR. */
  punto: string | null;
  onCambiar: (ref: RefLinea, delta: number) => void;
  onNombrar: (ref: RefLinea, i: number, nombre: string) => void;
  onVaciar: () => void;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLButtonElement>(null);
  useSheet(onClose, closeRef);
  useSwipeDown(sheetRef, overlayRef, onClose);
  const [tipo, setTipo] = React.useState<Entrega["tipo"]>(punto ? "punto" : "recoger");
  const [direccion, setDireccion] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [intento, setIntento] = React.useState(false);
  const entrega: Entrega = tipo === "domicilio" ? { tipo, direccion } : tipo === "punto" && punto ? { tipo, lugar: punto } : { tipo: "recoger" };
  const falta = faltaPara(lineas, nombre, entrega);
  const enlace = falta ? null : enlaceWhatsapp(mensajePedido(lineas, { nombre, entrega, nota }));
  const formas: { id: Entrega["tipo"]; label: string; hint: string }[] = [
    ...(punto ? [{ id: "punto" as const, label: `En ${punto.split(" de ")[0]}`, hint: "Sin costo de envío" }] : []),
    { id: "recoger", label: "Lo recojo", hint: "En el café" },
    { id: "domicilio", label: "Domicilio", hint: "En Yopal" },
  ];
  return (
    <>
      <button ref={overlayRef} type="button" aria-label="Cerrar el pedido" className="pyt-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Mi pedido" className="pyt-sheet">
        <div className="pyt-sheet__top">
          <h2>Mi pedido</h2>
          <Cerrar ref={closeRef} onClick={onClose} />
        </div>
        <div className="pyt-sheet__body">
          {lineas.length === 0 ? (
            <p className="pyt-aviso">Tu pedido está vacío. Agrega algo del menú.</p>
          ) : (
            <>
              <ul className="pyt-lineas">
                {lineas.map((l) => (
                  <li key={l.clave}>
                    <span className="pyt-lineas__txt">
                      <strong>{l.nombre}</strong>
                      {(l.tamano || l.opcion) && <span className="pyh-meta">{[l.tamano, l.opcion].filter(Boolean).join(" · ")}</span>}
                    </span>
                    <Cantidad chico n={l.cantidad} nombre={l.nombre} onMenos={() => onCambiar(l, -1)} onMas={() => onCambiar(l, 1)} />
                    <Precio n={l.total} className="pyt-lineas__precio" />
                    {l.conNombre && (
                      <div className="pyt-vasos" role="group" aria-label={`Nombres para ${l.nombre}`}>
                        {l.para.map((n, i) => (
                          <label key={i} className="pyt-vaso">
                            <span>{l.cantidad > 1 ? `Vaso ${i + 1}` : "Para"}</span>
                            <input value={n} onChange={(e) => onNombrar(l, i, e.target.value)} maxLength={40} autoComplete="off" placeholder={nombre.trim() || "Nombre en la etiqueta"} aria-label={`Nombre en la etiqueta del vaso ${i + 1} de ${l.nombre}`} />
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="pyt-total">
                <span>Total productos</span>
                <span className="pyh-n">{money(total)}</span>
              </div>

              <div className="pyt-campo" role="radiogroup" aria-label="¿Cómo lo recibes?">
                <span className="pyh-k">¿Cómo lo recibes?</span>
                <div className="pyt-opciones">
                  {formas.map((f) => (
                    <button key={f.id} type="button" role="radio" aria-checked={tipo === f.id} className="pyt-opcion pyt-opcion--dos" onClick={() => setTipo(f.id)}>
                      <strong>{f.label}</strong>
                      <span>{f.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              {tipo === "domicilio" && (
                <>
                  <label className="pyt-campo">
                    <span className="pyh-k">Dirección de entrega</span>
                    <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={160} autoComplete="street-address" placeholder="Barrio, calle y número" />
                  </label>
                  <p className="pyh-meta">Al domicilio se le suman el empaque ($2.000 por bolsa de hasta 4 bebidas) y el envío. Te confirmamos el total por WhatsApp.</p>
                </>
              )}
              <p className="pyh-meta">Cada bebida lleva una etiqueta con nombre. Escribe para quién es cada vaso; el que dejes en blanco sale con tu nombre.</p>
              <label className="pyt-campo">
                <span className="pyh-k">Tu nombre</span>
                <input value={nombre} onChange={(e) => onNombre(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Quién hace el pedido" />
              </label>
              <label className="pyt-campo">
                <span className="pyh-k">Nota (opcional)</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={240} placeholder="Sin azúcar, vaso grande, leche deslactosada…" />
              </label>

              {intento && falta && <p role="alert" className="pyt-aviso pyt-aviso--error">{falta}</p>}
              {enlace ? (
                <a className="pyh-btn pyt-enviar" href={enlace} target="_blank" rel="noopener noreferrer">
                  <IconoWhatsapp /> Enviar pedido por WhatsApp
                </a>
              ) : (
                <button type="button" className="pyh-btn pyt-enviar" onClick={() => setIntento(true)}>
                  <IconoWhatsapp /> Enviar pedido por WhatsApp
                </button>
              )}
              <p className="pyh-meta pyt-centro">Se abre WhatsApp con tu pedido escrito. Envíalo y te confirmamos por ahí; pagas al recibir.</p>
              <button type="button" className="pyt-vaciar" onClick={onVaciar}>Vaciar pedido</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
