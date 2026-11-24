import { loadMenu, menuContent } from "@/lib/menu/data";
import { MenuClient } from "./menu-client";

// The catalog changes a few times a week: serve a cached page and refresh it
// every five minutes, so a price changed in the POS shows without a deploy.
export const revalidate = 300;

/**
 * The customers' menu behind the QR on the cup and the table, as a shop: the
 * customer puts an order together and sends it to the café's WhatsApp. Public,
 * no session. Names, prices and what is sold out come from the POS catalog;
 * the copy comes from lib/menu/menu.json.
 */
export default async function MenuPage() {
  const sections = await loadMenu();
  const c = menuContent;
  return <MenuClient sections={sections} header={c.header} footer={c.footer} compartir={c.compartir} />;
}
