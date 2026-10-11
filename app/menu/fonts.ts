import localFont from "next/font/local";

// Brand faces of Café Pa' Yo for the customers' pages (the menu, the rating).
// Nority Slanted is the italic of the display family; Delight is the text
// face (300 and 700).
export const display = localFont({
  src: [
    { path: "./fonts/nority-display.woff2", weight: "400", style: "normal" },
    { path: "./fonts/nority-slanted.woff2", weight: "400", style: "italic" },
  ],
  variable: "--pym-display",
  display: "swap",
  fallback: ["Arial Black", "sans-serif"],
});
export const body = localFont({
  src: [
    { path: "./fonts/delight-light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/delight-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--pym-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});
