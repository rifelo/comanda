import { NextResponse } from "next/server";

/**
 * Web app manifest for the register, served at /pos/manifest.webmanifest and
 * linked only from /pos (app/pos/page.tsx). A route handler rather than the
 * `manifest.ts` file convention, which Next only honours at the app root —
 * and the root /manifest.json is the phone-first staff app.
 *
 * This one installs the POS as its own desktop app on the register PC
 * (Chrome/Edge on Windows):
 *
 *  · `id: "/pos"` keeps it a separate install from the staff app on the same
 *    origin; `scope: "/"` so login and the admin panel stay inside the window
 *    instead of popping out to a browser tab.
 *  · `display_override: ["fullscreen", …]` is a no-op on Windows today (Chrome
 *    falls back to standalone) but costs nothing; real full screen comes from
 *    the chip in the top bar or the `--start-fullscreen` launch shortcut.
 *  · `launch_handler.focus-existing`: the startup shortcut focuses the open
 *    register instead of opening a second one.
 *  · PNG icons are what Windows needs for the taskbar/shortcut; the SVGs in
 *    the root manifest alone make the app non-installable on desktop.
 */
const manifest = {
  id: "/pos",
  name: "comanda · Punto de venta",
  short_name: "comanda POS",
  description: "Caja del punto de venta.",
  start_url: "/pos",
  scope: "/",
  display: "standalone",
  display_override: ["fullscreen", "standalone"],
  orientation: "landscape",
  background_color: "#f4ecdc",
  theme_color: "#f4ecdc",
  lang: "es",
  categories: ["business"],
  launch_handler: { client_mode: "focus-existing" },
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
