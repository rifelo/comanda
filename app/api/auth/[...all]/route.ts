import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/neon/auth";

/** Better Auth's endpoints (sign-in, Google callback, sign-out) — only when BACKEND=neon. */
function handler(req: Request) {
  if (process.env.BACKEND !== "neon") return new Response("Not found", { status: 404 });
  const h = toNextJsHandler(getAuth());
  return req.method === "POST" ? h.POST(req) : h.GET(req);
}

export { handler as GET, handler as POST };
