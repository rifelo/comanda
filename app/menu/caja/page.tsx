import { loadMenu, menuContent } from "@/lib/menu/data";
import { gruposCafe, money, precioK, type MenuSection } from "@/lib/menu/menu";
import "./caja.css";

// Same catalog as the QR menu: print again whenever a price changes.
export const revalidate = 300;

export const metadata = { title: "Menú de pared · Café Pa' Yo", robots: { index: false } };

/** Sections per column of the wall menu, left to right. */
const COLUMNAS = [["caliente"], ["frio"], ["jugos", "kombucha", "salados"], ["postres", "envasadas"]];
/** Sections whose rows also show the one-line description (coffee needs explaining; a Coca-Cola does not). */
const CON_DESCRIPCION = new Set(["caliente", "frio"]);

/** Inside its own section a juice is «Mora», a kombucha «Maracuyá». */
function nombreCorto(name: string, section: string): string {
  if (section !== "jugos" && section !== "kombucha") return name;
  const corto = name.replace(/^(jugo|kombucha)\s+(de\s+)?/i, "");
  return corto.charAt(0).toUpperCase() + corto.slice(1);
}

function Precio({ n }: { n: number }) {
  return (
    <span className="cj-precio" aria-label={money(n)}>
      <span className="cj-precio__signo">$</span>
      {precioK(n)}
    </span>
  );
}

function Seccion({ s }: { s: MenuSection }) {
  const art = s.art ? menuContent.arte[s.art] : null;
  const desc = CON_DESCRIPCION.has(s.id);
  return (
    <section className="cj-sec">
      <div className="cj-band">
        <h2 className="cj-band__title">{s.label}</h2>
        <p className="cj-band__sub">{s.sub}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {art && <img src={art} alt="" className="cj-band__art" />}
      </div>
      {gruposCafe(s.items).map((g) => (
        <div key={g.id}>
          {g.label && <h3 className="cj-grupo">{g.label}</h3>}
          {g.items.map((it) => (
            <div key={it.sku} className="cj-row">
              <div className="cj-row__line">
                <span className="cj-row__name">{nombreCorto(it.name, s.id)}</span>
                <span className="cj-row__dots" aria-hidden="true" />
                <Precio n={it.price} />
              </div>
              {desc && it.short && <p className="cj-row__short">{it.short}</p>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/**
 * The menu for the backlit wall box: 120 × 80 cm, landscape, printed to PDF
 * by .e2e/menu-caja.mjs. `?sangrado=2` adds 2 cm of background on every side
 * for the print shop; text always stays 4 cm inside the visible area.
 */
export default async function MenuCajaPage({ searchParams }: { searchParams: Promise<{ sangrado?: string }> }) {
  const { sangrado } = await searchParams;
  const s = Math.max(0, Math.min(5, Number(sangrado) || 0));
  const sections = await loadMenu();
  const byId = new Map(sections.map((x) => [x.id, x]));
  const c = menuContent;
  return (
    <div className="cj" style={{ ["--sangrado" as string]: `${s}cm` }}>
      <style>{`@page { size: ${120 + 2 * s}cm ${80 + 2 * s}cm; margin: 0; }`}</style>
      <div className="cj-area">
        <header className="cj-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.arte.logo ?? ""} alt="Café Pa' Yo" className="cj-head__logo" />
          <h1 className="cj-head__title">{c.header.titulo}</h1>
          <div className="cj-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.compartir.qr} alt="" className="cj-qr__img" />
            <p className="cj-qr__text">Fotos y detalles<br />en cafepayo.com</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.arte["mano-taza.svg"] && <img src={c.arte["mano-taza.svg"]!} alt="" className="cj-head__art" />}
        </header>
        <main className="cj-cols">
          {COLUMNAS.map((ids, i) => (
            <div key={i} className="cj-col" data-col={i}>
              {ids.map((id) => byId.get(id)).filter((x): x is MenuSection => !!x).map((x) => <Seccion key={x.id} s={x} />)}
            </div>
          ))}
        </main>
        <footer className="cj-foot">
          <span>Pide en tu mesa y paga al final en caja · $8.5K = $8.500</span>
          <span className="cj-foot__tag">{c.footer.tagline}</span>
          <span>{c.footer.instagram}</span>
        </footer>
      </div>
    </div>
  );
}
