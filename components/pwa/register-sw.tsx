"use client";

import * as React from "react";

/**
 * Registers the app service worker (`public/sw.js`, scope "/").
 *
 *  · Production only — a SW in `next dev` caches HMR chunks and confuses.
 *  · Never from the POS: /pos registers `pos-sw.js` (scope "/pos"), and the
 *    browser picks the registration with the longest matching scope, so the
 *    two coexist; registering here from /pos would only race it.
 *  · Never on the customers' domain (cafepayo.com serves only the menu).
 */
export function RegisterSw() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const { pathname, hostname } = window.location;
    if (pathname === "/pos" || pathname.startsWith("/pos/")) return;
    if (hostname.endsWith("cafepayo.com")) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[sw] register failed:", err);
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
