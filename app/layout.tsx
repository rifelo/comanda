import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, DM_Serif_Display, Caveat } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const slab = DM_Serif_Display({
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
  title: "Comanda",
  description:
    "Centraliza y controla los procedimientos diarios de tu restaurante.",
  applicationName: "Comanda",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Comanda",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${mono.variable} ${slab.variable} ${script.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
