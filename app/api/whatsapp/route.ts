import { after, NextResponse, type NextRequest } from "next/server";
import { isValidSignature, leerWebhook } from "@/lib/whatsapp/cloud-api";
import { registrar, responder } from "@/lib/whatsapp/atender";

/**
 * WhatsApp Cloud API webhook (Meta). Register https://<dominio>/api/whatsapp in
 * the Meta app with WHATSAPP_VERIFY_TOKEN, subscribed to `messages` and, for a
 * number shared with the WhatsApp Business app, `smb_message_echoes`.
 *
 * Meta wants a 200 fast and retries otherwise, so the messages are stored
 * during the request and the agent answers in `after()`.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

/** Meta's one-time check when the webhook URL is saved. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!isValidSignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const { entrantes, ecos } = leerWebhook(body);
  const pendientes = await registrar(entrantes, ecos);
  after(async () => {
    await Promise.all(
      pendientes.map((p) =>
        responder(p).catch((e) => console.error("[whatsapp] responder:", e)),
      ),
    );
  });
  return NextResponse.json({ ok: true });
}
