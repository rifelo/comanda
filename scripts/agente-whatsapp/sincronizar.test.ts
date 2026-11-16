/**
 * Creates or updates the Claude Console agent behind the café's WhatsApp
 * («PA'YO · WhatsApp», Managed Agents) from lib/ai/whatsapp-consola.ts, and its
 * environment. IDs are kept in agente.json next to this file (not secrets).
 *
 *   ANTHROPIC_API_KEY=… npx vitest run -c scripts/agente-whatsapp/vitest.config.ts
 *
 * Then set WHATSAPP_AGENT_ID / WHATSAPP_AGENT_ENV_ID in Vercel. Editing the
 * prompt in the Console works too; re-running this script overwrites it with
 * the repo's version (a new agent version, the old ones stay in the Console).
 */
import { test, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import Anthropic from "@anthropic-ai/sdk";
import { herramientasAgente, MODELO_AGENTE, NOMBRE_AGENTE, sistemaAgente } from "@/lib/ai/whatsapp-consola";

const ARCHIVO = "scripts/agente-whatsapp/agente.json";

test("sincronizar agente de WhatsApp en la consola", async () => {
  const client = new Anthropic();
  const ids = existsSync(ARCHIVO) ? (JSON.parse(readFileSync(ARCHIVO, "utf8")) as { agentId?: string; envId?: string }) : {};

  // No sandbox tools are used: the environment only exists because sessions need one.
  const envId =
    ids.envId ??
    (
      await client.beta.environments.create({
        name: "PA'YO · WhatsApp",
        description: "Entorno del agente de WhatsApp: sin red ni herramientas de sandbox.",
        config: { type: "cloud", networking: { type: "limited", allowed_hosts: [] } },
      })
    ).id;

  const definicion = {
    name: NOMBRE_AGENTE,
    description: "Atiende el WhatsApp de Café PA'YO: responde, recomienda y toma pedidos. Las herramientas corren en Comanda.",
    model: MODELO_AGENTE,
    system: sistemaAgente("Café PA'YO"),
    tools: herramientasAgente(),
  };
  let agent;
  if (ids.agentId) {
    const actual = await client.beta.agents.retrieve(ids.agentId);
    agent = await client.beta.agents.update(ids.agentId, { ...definicion, version: actual.version });
  } else {
    agent = await client.beta.agents.create(definicion);
  }
  writeFileSync(ARCHIVO, JSON.stringify({ agentId: agent.id, envId, version: agent.version }, null, 2) + "\n");
  console.log(`agente ${agent.id} v${agent.version} · entorno ${envId}`);
});
