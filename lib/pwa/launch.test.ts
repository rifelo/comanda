import { describe, it, expect } from "vitest";
import { launchCommand, posAppUrl, startupBatch, BROWSER_EXE } from "@/lib/pwa/launch";

describe("posAppUrl", () => {
  it("appends /pos to the origin", () => {
    expect(posAppUrl("https://co-manda.com")).toBe("https://co-manda.com/pos");
  });
  it("tolerates a trailing slash", () => {
    expect(posAppUrl("https://co-manda.com/")).toBe("https://co-manda.com/pos");
  });
});

describe("launchCommand", () => {
  it("opens an app window full screen with the quoted Edge path", () => {
    const cmd = launchCommand("edge", "https://co-manda.com");
    expect(cmd).toBe(`"${BROWSER_EXE.edge}" --app=https://co-manda.com/pos --start-fullscreen`);
  });
  it("supports Chrome", () => {
    expect(launchCommand("chrome", "https://co-manda.com")).toContain("chrome.exe");
  });
});

describe("startupBatch", () => {
  it("is a detached, CRLF batch file", () => {
    const bat = startupBatch("edge", "https://co-manda.com");
    expect(bat.split("\r\n")).toEqual([
      "@echo off",
      `start "" "${BROWSER_EXE.edge}" --app=https://co-manda.com/pos --start-fullscreen`,
      "",
    ]);
    expect(bat).not.toMatch(/[^\r]\n/); // no bare LF
  });
});
