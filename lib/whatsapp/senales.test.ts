import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { esSoloSenal } from "./atender";

describe("esSoloSenal", () => {
  it("reactions and stickers never get a reply", () => {
    expect(esSoloSenal("[Reaccionó con ❤️ a nuestro mensaje]")).toBe(true);
    expect(esSoloSenal("[Sticker]")).toBe(true);
    expect(esSoloSenal("Gracias!")).toBe(false);
    expect(esSoloSenal("[El cliente envió una imagen. El equipo la ve en el POS…]")).toBe(false);
  });
});
