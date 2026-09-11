/**
 * How the register PC launches the POS at Windows login.
 *
 * There is no web API for "run on OS login" — it is either the browser's own
 * toggle (edge://apps → "Auto-start on device login", Chrome 91+/Edge 91+) or
 * a shortcut in the user's Startup folder. The shortcut is what we generate:
 * it also carries `--start-fullscreen`, which the browser toggle cannot do
 * (an installed app launched that way opens as a normal window).
 *
 * `--app=URL` opens an app-style window (no tabs/URL bar) in the default
 * profile, so the paired-device cookie and the Web Serial grant for the
 * label printer carry over. Pure string builders, unit-tested.
 */

export type DesktopBrowser = "edge" | "chrome";

export const BROWSER_EXE: Record<DesktopBrowser, string> = {
  edge: String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
  chrome: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
};

export const BROWSER_LABEL: Record<DesktopBrowser, string> = {
  edge: "Microsoft Edge",
  chrome: "Google Chrome",
};

export function posAppUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/pos`;
}

/** The command line that opens the POS full screen in an app window. */
export function launchCommand(browser: DesktopBrowser, origin: string): string {
  return `"${BROWSER_EXE[browser]}" --app=${posAppUrl(origin)} --start-fullscreen`;
}

/**
 * Contents of a `.bat` to drop in `shell:startup`. `start ""` detaches so the
 * console window closes at once; CRLF because it's a Windows batch file.
 */
export function startupBatch(browser: DesktopBrowser, origin: string): string {
  return ["@echo off", `start "" ${launchCommand(browser, origin)}`, ""].join("\r\n");
}

/** Where Windows keeps per-user startup items (Win+R → shell:startup). */
export const STARTUP_FOLDER = String.raw`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`;
export const STARTUP_FILE = "comanda-pos.bat";
