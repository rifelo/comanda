import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { THEME_COLOR, THEME_COOKIE, toAppTheme, type AppTheme } from "@/lib/theme";
import { RegisterSw } from "@/components/pwa/register-sw";
import { InstallBanner } from "@/components/pwa/install-banner";
import { Toaster } from "@/components/ui/feedback";

// Fonts are self-hosted (app/fonts, latin subset of the Google Fonts files):
// fetching them from Google at build time failed builds on Vercel.

// App face (docs/redesign/PLAN.md §5.1): Inter 400/600/700 for everything.
// Exposed as `--font-inter`; Tailwind's `font-sans` points at it (globals.css).
const inter = localFont({
  src: "./fonts/inter-normal.woff2",
  variable: "--font-inter",
  weight: "400 700",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

// Tabular numbers on receipts, labels and the kardex (`font-mono`, `cmd-num`).
const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-normal.woff2", weight: "400 700", style: "normal" },
    // Italic is real, not synthesised: the drink label's descriptor uses it.
    { path: "./fonts/jetbrains-mono-italic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-mono",
  fallback: ["ui-monospace", "monospace"],
});

// Display face — PA'YO branding and the public menu only. The café's
// wordmark uses Nority Display (paid); Dela Gothic One is the free stand-in.
// Keeps the historic `--font-slab` name so `font-slab` call sites still work.
const slab = localFont({
  src: "./fonts/dela-gothic-one-normal.woff2",
  variable: "--font-slab",
  weight: "400",
});

const script = localFont({
  src: "./fonts/caveat-normal.woff2",
  variable: "--font-script",
  weight: "500 600",
});

// Phrase face for the cup label (printed on the thermal printer).
const frase = localFont({
  src: "./fonts/delight-bold.otf",
  variable: "--font-frase",
  weight: "700",
  style: "normal",
});

/** The café's customer domain: no «Comanda» app to install there (no manifest, no banner). */
const MENU_HOSTS = new Set(["cafepayo.com", "www.cafepayo.com"]);
async function enDominioCafe(): Promise<boolean> {
  return MENU_HOSTS.has(((await headers()).get("host") ?? "").split(":")[0].toLowerCase());
}

export async function generateMetadata(): Promise<Metadata> {
  if (await enDominioCafe()) return { title: "Café Pa' Yo", icons: { icon: "/icons/icon.svg" }, formatDetection: { telephone: false } };
  return metadata;
}

const metadata: Metadata = {
  title: "Comanda",
  description: "Turnos, caja, inventario y ventas de Café PA'YO.",
  applicationName: "Comanda",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Comanda",
    // Light app background: dark status-bar text.
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

async function readTheme(): Promise<AppTheme> {
  const cookieStore = await cookies();
  return toAppTheme(cookieStore.get(THEME_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await readTheme();
  return {
    // Browser chrome follows the page background: fixed when the person
    // chose a theme, per OS preference when `auto`.
    themeColor:
      theme === "auto"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLOR.claro },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.oscuro },
          ]
        : THEME_COLOR[theme],
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Theme from the cookie, server-side, so the first paint matches (no
  // flash). Old paper-theme cookies map to claro/oscuro (lib/theme.ts).
  const theme = await readTheme();
  const cafe = await enDominioCafe();

  return (
    <html
      lang="es"
      data-theme={theme}
      className={`${inter.variable} ${mono.variable} ${slab.variable} ${script.variable} ${frase.variable} h-full antialiased`}
    >
      <body className="bg-bg text-text min-h-full flex flex-col">
        {children}
        <Toaster />
        {!cafe && <InstallBanner />}
        {!cafe && <RegisterSw />}
      </body>
    </html>
  );
}
