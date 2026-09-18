import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Dela_Gothic_One, Caveat } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import type { ThemeName } from "@/lib/types";

const THEMES: ThemeName[] = ["papel", "sepia", "carbon", "indigo", "rojo"];

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  // Italic is real, not synthesised: the drink label's descriptor uses it.
  style: ["normal", "italic"],
});

// Display face — PA'YO branding. The café's wordmark uses Nority Display
// (ultra-heavy, wide, ink-trap chunky); Nority is a paid font, so we use
// its closest free match, Dela Gothic One. It keeps the historic
// `--font-slab` variable name so every `font-slab` / `F.slab` call site
// picks it up unchanged. Single weight: `font-synthesis: none` in
// globals.css stops browsers faking a bolder version.
const slab = Dela_Gothic_One({
  variable: "--font-slab",
  subsets: ["latin"],
  weight: "400",
});

const script = Caveat({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "co-manda",
  description:
    "Centraliza y controla los procedimientos diarios de tu restaurante.",
  applicationName: "co-manda",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "co-manda",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4ecdc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the saved theme cookie server-side so the first paint matches
  // the user's selection (no FOUC). Default is `papel`.
  const cookieStore = await cookies();
  const raw = cookieStore.get("comanda-theme")?.value;
  const theme: ThemeName = (THEMES as string[]).includes(raw ?? "")
    ? (raw as ThemeName)
    : "papel";

  return (
    <html
      lang="es"
      data-theme={theme}
      className={`${mono.variable} ${slab.variable} ${script.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
