import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidBearer, isValidSignature, leerWebhook, destino } from "./cloud-api";

const meta = { display_phone_number: "573001112233", phone_number_id: "PNID" };

describe("isValidSignature", () => {
  const body = '{"hola":1}';
  const sig = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
  it("accepts Meta's HMAC of the raw body", () => {
    expect(isValidSignature(body, sig, "secreto")).toBe(true);
  });
  it("rejects a wrong secret, a tampered body or a missing header", () => {
    expect(isValidSignature(body, sig, "otro")).toBe(false);
    expect(isValidSignature(body + " ", sig, "secreto")).toBe(false);
    expect(isValidSignature(body, null, "secreto")).toBe(false);
    expect(isValidSignature(body, "sha256=zz", "secreto")).toBe(false);
  });
});

describe("isValidBearer", () => {
  const secret = "s3cr3t-de-360dialog-largo";
  it("accepts the header the webhook was registered with", () => {
    expect(isValidBearer(`Bearer ${secret}`, secret)).toBe(true);
  });
  it("rejects anything else, and a secret too short to trust", () => {
    expect(isValidBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isValidBearer(secret, secret)).toBe(false);
    expect(isValidBearer(null, secret)).toBe(false);
    expect(isValidBearer("Bearer corto", "corto")).toBe(false);
  });
});

describe("leerWebhook", () => {
  it("reads delivery statuses with Meta's reason when they fail", () => {
    const out = leerWebhook({
      entry: [{ changes: [{ field: "messages", value: {
        metadata: meta,
        statuses: [
          { id: "wamid.A", status: "delivered", recipient_id: "573150000000", timestamp: "1794326000" },
          { id: "wamid.B", status: "failed", recipient_id: "573150000000", timestamp: "1794326001",
            errors: [{ code: 131031, title: "Business Account locked", error_data: { details: "Business account has been locked." } }] },
          { id: "wamid.C", status: "deleted" },
        ],
      } }] }],
    });
    expect(out.entrantes).toEqual([]);
    expect(out.estados.map((e) => [e.messageId, e.estado, e.error])).toEqual([
      ["wamid.A", "delivered", null],
      ["wamid.B", "failed", "131031 · Business Account locked · Business account has been locked."],
    ]);
  });

  it("reads customer messages with the profile name", () => {
    const out = leerWebhook({
      entry: [{ changes: [{ field: "messages", value: {
        metadata: meta,
        contacts: [{ wa_id: "573150000000", profile: { name: "Laura" } }],
        messages: [
          { from: "573150000000", id: "wamid.1", timestamp: "1761600000", type: "text", text: { body: "Hola, ¿tienen latte?" } },
          { from: "573150000000", id: "wamid.2", timestamp: "1761600005", type: "audio", audio: { id: "x" } },
        ],
      } }] }],
    });
    expect(out.ecos).toEqual([]);
    expect(out.entrantes.map((e) => [e.waId, e.nombre, e.messageId, e.texto, e.tipo])).toEqual([
      ["573150000000", "Laura", "wamid.1", "Hola, ¿tienen latte?", "text"],
      ["573150000000", "Laura", "wamid.2", null, "audio"],
    ]);
    expect(out.entrantes[0].at.toISOString()).toBe("2025-10-27T21:20:00.000Z");
  });

  it("reads what the team wrote from the phone app (coexistence echoes)", () => {
    const out = leerWebhook({
      entry: [{ changes: [{ field: "smb_message_echoes", value: {
        metadata: meta,
        message_echoes: [{ from: "573001112233", to: "573150000000", id: "wamid.9", timestamp: "1761600010", type: "text", text: { body: "Ya te lo enviamos" } }],
      } }] }],
    });
    expect(out.entrantes).toEqual([]);
    expect(out.ecos).toEqual([{ phoneNumberId: "PNID", waId: "573150000000", messageId: "wamid.9", texto: "Ya te lo enviamos", at: new Date(1761600010 * 1000) }]);
  });

  it("ignores malformed payloads", () => {
    const vacio = { entrantes: [], ecos: [], estados: [] };
    expect(leerWebhook(null)).toEqual(vacio);
    expect(leerWebhook({ entry: [{ changes: [{ field: "messages", value: {} }] }] })).toEqual(vacio);
  });
});

describe("usernames (BSUID)", () => {
  const webhook = (msg: Record<string, unknown>, contact: Record<string, unknown>) => ({
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN" }, contacts: [contact], messages: [msg] } }] }],
  });
  it("keeps phone, BSUID and @username when all come", () => {
    const { entrantes } = leerWebhook(
      webhook(
        { from: "573001112233", from_user_id: "RS.123", id: "wamid.1", type: "text", text: { body: "Hola" }, timestamp: "1" },
        { wa_id: "573001112233", user_id: "RS.123", profile: { name: "Bibiana", username: "bibizperez" } },
      ),
    );
    expect(entrantes[0]).toMatchObject({ waId: "573001112233", userId: "RS.123", username: "bibizperez", nombre: "Bibiana" });
  });
  it("accepts a customer who hides the phone behind a username", () => {
    const { entrantes } = leerWebhook(
      webhook(
        { from_user_id: "RS.999", id: "wamid.2", type: "text", text: { body: "Hola" }, timestamp: "1" },
        { user_id: "RS.999", profile: { name: "Ana", username: "@ana.cafe" } },
      ),
    );
    expect(entrantes[0]).toMatchObject({ waId: "RS.999", userId: "RS.999", username: "ana.cafe", nombre: "Ana" });
  });
  it("sends to a phone with `to` and to a BSUID with `recipient`", () => {
    expect(destino("573001112233")).toEqual({ to: "573001112233" });
    expect(destino("RS.999")).toEqual({ recipient: "RS.999" });
  });
});

describe("reacciones y medios", () => {
  const hook = (msg: Record<string, unknown>) => ({
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN" }, contacts: [{ wa_id: "573001112233", profile: { name: "Ana" } }], messages: [{ from: "573001112233", id: "wamid.x", timestamp: "1", ...msg }] } }] }],
  });
  it("reads a reaction's emoji", () => {
    const [e] = leerWebhook(hook({ type: "reaction", reaction: { message_id: "wamid.ours", emoji: "❤️" } })).entrantes;
    expect(e).toMatchObject({ tipo: "reaction", reaccion: "❤️", media: null, texto: null });
  });
  it("keeps an image's media id, mime type and caption", () => {
    const [e] = leerWebhook(hook({ type: "image", image: { id: "MID1", mime_type: "image/jpeg", caption: "mi pago" } })).entrantes;
    expect(e).toMatchObject({ tipo: "image", texto: "mi pago", media: { id: "MID1", mime: "image/jpeg", url: null }, reaccion: null });
  });
});
