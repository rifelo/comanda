import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidSignature, leerWebhook } from "./cloud-api";

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

describe("leerWebhook", () => {
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

  it("ignores delivery statuses and malformed payloads", () => {
    expect(leerWebhook({ entry: [{ changes: [{ field: "messages", value: { metadata: meta, statuses: [{ id: "wamid.1", status: "read" }] } }] }] }))
      .toEqual({ entrantes: [], ecos: [] });
    expect(leerWebhook(null)).toEqual({ entrantes: [], ecos: [] });
    expect(leerWebhook({ entry: [{ changes: [{ field: "messages", value: {} }] }] })).toEqual({ entrantes: [], ecos: [] });
  });
});
