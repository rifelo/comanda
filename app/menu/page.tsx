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
  // Only what is on the menu right now can be featured.
  const enMenu = new Set(sections.flatMap((s) => s.items).map((i) => i.sku));
  const favoritas = c.promo.on ? c.promo.items.filter((f) => enMenu.has(f.sku)) : [];
  return (
    <MenuClient
      sections={sections}
      moods={c.moods}
      profileLabels={c.profileLabels}
      header={c.header}
      footer={c.footer}
      arte={c.arte}
      promo={favoritas.length ? { sticker: c.promo.sticker, items: favoritas } : null}
    />
  );
}
