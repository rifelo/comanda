import type { Metadata, Viewport } from "next";
import { body, display } from "./fonts";
import "./menu.css";

export const metadata: Metadata = {
  title: "Menú · Café Pa' Yo",
  description: "El café hecho para tu momento. Mira el menú, pide en tu mesa y paga al final en caja.",
  metadataBase: new URL("https://cafepayo.com"),
  alternates: { canonical: "/menu" },
  openGraph: { title: "Café Pa' Yo", description: "El café hecho para tu momento.", url: "https://cafepayo.com" },
};

// Customers may zoom: the app shell locks the scale, the menu must not.
// resizes-content: on Android the keyboard shrinks the page, so a sheet's fields stay above it
// (iOS ignores it; menu-client's useTeclado covers both).
export const viewport: Viewport = { themeColor: "#f1a900", width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className={`pym ${display.variable} ${body.variable}`}>{children}</div>;
}
