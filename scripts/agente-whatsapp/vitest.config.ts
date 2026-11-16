import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Runs only the agent sync script (not part of the normal test suite). */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  test: { environment: "node", include: ["scripts/agente-whatsapp/sincronizar.test.ts"], testTimeout: 120_000 },
});
