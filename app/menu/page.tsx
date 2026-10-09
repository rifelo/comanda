import { loadMenu, menuContent } from "@/lib/menu/data";
import { MenuClient } from "./menu-client";

// The catalog changes a few times a week: serve a cached page and refresh it
// every five minutes, so a price changed in the POS shows without a deploy.
export const revalidate = 300;

/**
 * The customers' menu behind the QR on the cup and the table. Public, no
 * session. Names, prices and what is sold out come from the POS catalog;
 * the copy comes from lib/menu/menu.json.
 */
export default async function MenuPage() {
  const sections = await loadMenu();
  const c = menuContent;
  const promoItem = c.promo.on ? sections.flatMap((s) => s.items).find((i) => i.sku === c.promo.sku) ?? null : null;
  return (
    <MenuClient
      sections={sections}
      moods={c.moods}
      profileLabels={c.profileLabels}
      header={c.header}
      footer={c.footer}
      arte={c.arte}
      promo={promoItem ? { sku: promoItem.sku, sticker: c.promo.sticker, tagline: c.promo.tagline, imagen: c.promo.imagen, alt: c.promo.alt } : null}
    />
  );
}
