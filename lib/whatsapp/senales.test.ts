import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { esSoloSenal, sinNotasInternas } from "./atender";

describe("esSoloSenal", () => {
  it("reactions and stickers never get a reply", () => {
    expect(esSoloSenal("[Reaccionó con ❤️ a nuestro mensaje]")).toBe(true);
    expect(esSoloSenal("[Sticker]")).toBe(true);
    expect(esSoloSenal("Gracias!")).toBe(false);
    expect(esSoloSenal("[El cliente envió una imagen. El equipo la ve en el POS…]")).toBe(false);
  });
});

describe("sinNotasInternas", () => {
  it("drops the console's narration of its own actions", () => {
    expect(sinNotasInternas("Reaccioné con ❤️ al mensaje de Jesus. No envié texto, porque el agradecimiento cierra la conversación")).toBe("");
    expect(sinNotasInternas("Con gusto 🙌\n\nNo envié texto adicional")).toBe("Con gusto 🙌");
  });
  it("keeps normal replies", () => {
    expect(sinNotasInternas("Listo, tu pedido es el A-2201\n\nTe lo llevamos a la droguería")).toBe("Listo, tu pedido es el A-2201\n\nTe lo llevamos a la droguería");
    expect(sinNotasInternas("No te preocupes, ya lo revisamos")).toBe("No te preocupes, ya lo revisamos");
  });
});
