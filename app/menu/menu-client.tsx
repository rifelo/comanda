"use client";

import * as React from "react";
import { fraseDePedido, money, perfilCon, porPrecio, precioK, type MenuItem, type MenuSection } from "@/lib/menu/menu";

interface Props {
  sections: MenuSection[];
  moods: { id: string; label: string; hint: string }[];
  profileLabels: string[];
  /** What an option adds to the profile, by option name. */
  profileByOption: Record<string, number[]>;
  header: { titulo: string; texto: string };
  footer: { tagline: string; texto: string; instagram: string };
  /** Brand art by file name → public path; null while the file is missing. */
  arte: Record<string, string | null>;
  compartir: { url: string; qr: string; titulo: string; texto: string; mensaje: string };
  /** The featured drinks; every sku is on the menu. */
  promo: { sticker: string; items: { sku: string; tagline: string }[] } | null;
}

const Chevron = ({ color = "currentColor", size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

/**
 * A brand illustration, cropped by the bottom edge of its container. While
 * the SVG has not been delivered (arte[name] is null) it draws a labelled
 * outline in its place, so the missing file is obvious and never invented.
 */
function Arte({ arte, name, className }: { arte: Props["arte"]; name: string | null; className: string }) {
  if (!name) return null;
  const src = arte[name];
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={`pym-art ${className}`} />;
  // TODO(marca): falta el archivo `name` del Manual de Marca 2026.
  return <span aria-hidden="true" className={`pym-art pym-art--todo ${className}`}>{name}</span>;
}

/** The wordmark. A text stand-in until the logo SVG is delivered. */
function Logo({ arte, name, className }: { arte: Props["arte"]; name: "logo" | "logoSticker"; className: string }) {
  const src = arte[name];
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="Café Pa' Yo" className={className} />;
  // TODO(marca): falta cafe-payo-logo-principal.svg / el logo sticker crema.
  return <span className={`pym-wordmark ${className}`}>Café Pa&apos; Yo</span>;
}

export function MenuClient({ sections, moods, profileLabels, profileByOption, header, footer, arte, compartir, promo }: Props) {
  const [mood, setMood] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [option, setOption] = React.useState(0);
  const [sharing, setSharing] = React.useState(false);
  const opener = React.useRef<HTMLElement | null>(null);

  const all = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const bySku = React.useMemo(() => new Map(all.map((i) => [i.sku, i])), [all]);
  const sel = open ? bySku.get(open) ?? null : null;
  /** Open a product's sheet; `from` is the row tapped, to give the focus back on close. */
  function show(sku: string, from?: HTMLElement) {
    if (from) opener.current = from;
    setOption(0);
    setOpen(sku);
  }
  const close = React.useCallback(() => {
    setOpen(null);
    setSharing(false);
    opener.current?.focus();
  }, []);
  function share(from: HTMLElement) {
    opener.current = from;
    setSharing(true);
  }

  const moodObj = moods.find((m) => m.id === mood) ?? null;
  const shown: { id: string; label: string; sub: string; art: string | null; items: MenuItem[] }[] = moodObj
    ? (() => {
        const hits = all.filter((i) => i.tags.includes(moodObj.id)).sort(porPrecio);
        return [{ id: moodObj.id, label: moodObj.label, sub: `${hits.length} ${hits.length === 1 ? "opción" : "opciones"} en todo el menú. ${moodObj.hint}.`, art: "mano-taza.svg", items: hits }];
      })()
    : sections;

  return (
    <div className="pym-page">
      <header className="pym-header">
        <Logo arte={arte} name="logo" className="pym-header__logo" />
        <button type="button" className="pym-share" aria-label="Compartir el menú" onClick={(e) => share(e.currentTarget)}><IconoCompartir /></button>
        <h1 className="pym-header__title">{header.titulo}</h1>
        <p className="pym-header__text">{header.texto}</p>
        <Arte arte={arte} name="mano-taza.svg" className="pym-header__art" />
      </header>

      {promo && (
        <section aria-label={promo.sticker} className="pym-block">
          <div className="pym-promo">
            <span className="pym-sticker">{promo.sticker}</span>
            {promo.items.map((f) => {
              const it = bySku.get(f.sku);
              if (!it) return null;
              return (
                <button key={f.sku} type="button" className="pym-promo__row" onClick={(e) => show(f.sku, e.currentTarget)}>
                  <span className="pym-promo__text">
                    <span className="pym-promo__name">{it.name}</span>
                    <span className="pym-promo__tagline">{f.tagline}</span>
                  </span>
                  <span className="pym-promo__side">
                    <Precio n={it.price} className="pym-promo__price" />
                    <Chevron size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="pym-moods">
        <div className="pym-moods__head">
          <h2 className="pym-h2">¿Qué se te antoja?</h2>
          {mood && <button type="button" className="pym-pill" onClick={() => setMood(null)}>Ver todo</button>}
        </div>
        <div className="pym-moods__grid">
          {moods.map((m) => (
            <button key={m.id} type="button" className="pym-mood" aria-pressed={mood === m.id} onClick={() => setMood(mood === m.id ? null : m.id)}>
              <span className="pym-mood__label">{m.label}</span>
              <span className="pym-mood__hint">{m.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {!mood && (
        <nav aria-label="Categorías" className="pym-nav">
          <div className="pym-nav__row">
            {sections.map((s) => <a key={s.id} href={`#cat-${s.id}`} className="pym-pill">{s.label}</a>)}
          </div>
        </nav>
      )}

      <main className="pym-main">
        {shown.map((sec) => (
          <section key={sec.id} id={`cat-${sec.id}`} className="pym-section">
            <div className="pym-band">
              <h2 className="pym-band__title">{sec.label}</h2>
              <p className="pym-band__sub">{sec.sub}</p>
              <Arte arte={arte} name={sec.art} className="pym-band__art" />
            </div>
            <div>
              {sec.items.map((it) => (
                <button key={it.sku} type="button" className="pym-row" onClick={(e) => show(it.sku, e.currentTarget)}>
                  <span className="pym-row__main">
                    <span className="pym-row__head">
                      <span className="pym-row__name">{it.name}</span>
                      {it.nuevo && <span className="pym-tag">Nuevo</span>}
                      {it.agotado && <span className="pym-tag pym-tag--off">Agotado hoy</span>}
                    </span>
                    {it.short && <span className="pym-row__short">{it.short}</span>}
                  </span>
                  <span className="pym-row__side">
                    <Precio n={it.price} className="pym-row__price" />
                    <Chevron />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="pym-footer">
        <Logo arte={arte} name="logoSticker" className="pym-footer__logo" />
        <p className="pym-footer__tagline">{footer.tagline}</p>
        <p className="pym-footer__text">{footer.texto} <strong>{footer.instagram}</strong></p>
        <button type="button" className="pym-pill pym-footer__share" onClick={(e) => share(e.currentTarget)}><IconoCompartir size={16} /> Compartir el menú</button>
        <Arte arte={arte} name="mano-taza-amarilla.svg" className="pym-footer__art" />
      </footer>

      {sharing && <Compartir c={compartir} onClose={close} />}

      {sel && (
        <Ficha
          key={sel.sku}
          item={sel}
          section={sections.find((s) => s.id === sel.cat) ?? null}
          pair={(() => { const s = sections.find((x) => x.id === sel.cat); return s?.pair && s.pair !== sel.sku ? bySku.get(s.pair) ?? null : null; })()}
          option={option}
          onOption={setOption}
          profileLabels={profileLabels}
          profileByOption={profileByOption}
          arte={arte}
          onOpen={(sku) => show(sku)}
          onClose={close}
        />
      )}
    </div>
  );
}

/** «$8.5K» with a small «$», in the drinks' name face; read out whole ($8.500). */
function Precio({ n, className }: { n: number; className: string }) {
  return (
    <span className={`${className} pym-precio`} aria-label={money(n)}>
      <span aria-hidden="true" className="pym-precio__signo">$</span>
      <span aria-hidden="true">{precioK(n)}</span>
    </span>
  );
}

const IconoCompartir = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
);

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
      <button ref={overlayRef} type="button" aria-label="Cerrar" className="pym-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={c.titulo} className="pym-sheet">
        <div className="pym-sheet__head pym-sheet__head--short">
          <span aria-hidden="true" className="pym-grab" />
          <div className="pym-sheet__top">
            <h2 className="pym-h2">{c.titulo}</h2>
            <button ref={closeRef} type="button" aria-label="Cerrar" className="pym-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="pym-sheet__body pym-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.qr} alt={`Código QR de ${c.url.replace(/^https?:\/\//, "")}`} className="pym-qr__img" width={260} height={260} />
          <p className="pym-qr__url">{c.url.replace(/^https?:\/\//, "")}</p>
          <p className="pym-qr__text">{c.texto}</p>
          <div className="pym-qr__actions">
            {puedeCompartir && <button type="button" className="pym-pill pym-pill--wide pym-pill--solid" onClick={() => void enviar()}>Enviar enlace</button>}
            <button type="button" className="pym-pill pym-pill--wide" onClick={() => void copiar()}>{copiado ? "Enlace copiado" : "Copiar enlace"}</button>
          </div>
          <span role="status" className="pym-sr">{copiado ? "Enlace copiado" : ""}</span>
        </div>
      </div>
    </>
  );
}

/** The product sheet: slides up from the bottom, closes on the overlay, the X, Escape or a swipe down. */
function Ficha({ item, section, pair, option, onOption, profileLabels, profileByOption, arte, onOpen, onClose }: {
  item: MenuItem;
  section: MenuSection | null;
  pair: MenuItem | null;
  option: number;
  onOption: (i: number) => void;
  profileLabels: string[];
  profileByOption: Record<string, number[]>;
  arte: Props["arte"];
  onOpen: (sku: string) => void;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLButtonElement>(null);
  useSheet(onClose, closeRef);
  useSwipeDown(dialogRef, overlayRef, onClose);
  React.useEffect(() => { dialogRef.current?.scrollTo({ top: 0 }); }, []);

  const opt = item.options[option] ?? null;
  const price = item.price + (opt?.delta ?? 0);
  const perfil = item.p ? perfilCon(item.p, opt ? profileByOption[opt.name] : undefined) : null;
  return (
    <>
      <button ref={overlayRef} type="button" aria-label="Cerrar detalle" className="pym-overlay" onClick={onClose} tabIndex={-1} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={item.name} className="pym-sheet">
        <div className="pym-sheet__head">
          <span aria-hidden="true" className="pym-grab" />
          <div className="pym-sheet__top">
            <span className="pym-badge">{section?.label ?? ""}</span>
            <button ref={closeRef} type="button" aria-label="Cerrar" className="pym-close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <h2 className="pym-sheet__name">{item.name}</h2>
          <Precio n={price} className="pym-sheet__price" />
          <Arte arte={arte} name={section?.art ?? "mano-taza.svg"} className="pym-sheet__art" />
        </div>

        <div className="pym-sheet__body">
          {item.agotado && <p className="pym-off">Hoy se nos acabó. Pregunta en caja cuándo vuelve.</p>}
          {item.desc && <p className="pym-desc">{item.desc}</p>}

          {item.options.length > 0 && (
            <div className="pym-group">
              <h3 className="pym-h3">¿Cómo lo quieres?</h3>
              <div className="pym-options" style={{ gridTemplateColumns: `repeat(${Math.min(item.options.length, 2)}, minmax(0, 1fr))` }}>
                {item.options.map((o, i) => (
                  <button key={o.name} type="button" className="pym-pill pym-pill--wide" aria-pressed={option === i} onClick={() => onOption(i)}>
                    {o.name}{o.delta > 0 ? ` +${money(o.delta)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {perfil && (
            <div className="pym-group">
              <h3 className="pym-h3">Perfil de sabor</h3>
              {perfil.slice(0, profileLabels.length).map((v, idx) => (
                <div key={profileLabels[idx]} className="pym-profile" role="img" aria-label={`${profileLabels[idx]}: ${v} de 5`}>
                  <span className="pym-profile__label">{profileLabels[idx]}</span>
                  <span className="pym-profile__segs">
                    {[0, 1, 2, 3, 4].map((j) => <span key={j} className={j < v ? "pym-seg pym-seg--on" : "pym-seg"} />)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {item.lleva.length > 0 && (
            <div className="pym-group">
              <h3 className="pym-h3">Lleva</h3>
              <div className="pym-chips">{item.lleva.map((l) => <span key={l} className="pym-chip">{l}</span>)}</div>
            </div>
          )}

          {pair && (
            <div className="pym-group">
              <h3 className="pym-h3">Va bien con</h3>
              <button type="button" className="pym-pair" onClick={() => onOpen(pair.sku)}>
                <span className="pym-pair__name">{pair.name}</span>
                <Precio n={pair.price} className="pym-pair__price" />
                <Chevron />
              </button>
            </div>
          )}

          <div className="pym-order">
            <span className="pym-order__kicker">Pídelo en tu mesa</span>
            <span className="pym-order__text">Dile a quien te atiende: <strong>{fraseDePedido(item.name, opt?.name ?? null)}</strong></span>
            <Arte arte={arte} name="mano-taza-amarilla.svg" className="pym-order__art" />
          </div>
        </div>
      </div>
    </>
  );
}
