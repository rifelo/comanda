import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./menu.css";

// Brand faces of Café Pa' Yo, only for the menu. Nority Slanted is the
// italic of the display family; Delight is the text face (300 and 700).
const display = localFont({
  src: [
    { path: "./fonts/nority-display.woff2", weight: "400", style: "normal" },
    { path: "./fonts/nority-slanted.woff2", weight: "400", style: "italic" },
  ],
  variable: "--pym-display",
  display: "swap",
  fallback: ["Arial Black", "sans-serif"],
});
const body = localFont({
  src: [
    { path: "./fonts/delight-light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/delight-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--pym-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Menú · Café Pa' Yo",
  description: "El café hecho para tu momento. Mira el menú, pide en tu mesa y paga al final en caja.",
  manifest: undefined,
};

// Customers may zoom: the app shell locks the scale, the menu must not.
export const viewport: Viewport = { themeColor: "#f1a900", width: "device-width", initialScale: 1 };

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className={`pym ${display.variable} ${body.variable}`}>{children}</div>;
}
