import { ahoraMs, actorOf, requireEquipo } from "@/app/turno/_components/gate";
import { EquipoShell } from "@/app/turno/_components/equipo";
import { formatTime, todayInTz } from "@/lib/utils";
import { inicioDia } from "@/lib/inventario/mermas-db";
import { listPreparaciones, listTandas } from "@/lib/inventario/preparaciones-db";
import { fmtTandas } from "@/lib/inventario/preparaciones";
import { PrepararScreen } from "./preparar-screen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparaciones · Comanda" };

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * «Preparaciones» on the shared tablet: the house preparations (crema
 * chantilly…) with what one batch takes; «Registrar tanda» takes the
 * ingredients out of the inventory and puts the yield in. Today's batches
 * below, without costs.
 */
export default async function PrepararPage() {
  const ctx = await requireEquipo("/turno/inventario/preparar");
  const { admin, organizationId: orgId, sede } = ctx;
  const today = todayInTz(sede.tz);
  const [preps, hoy] = await Promise.all([listPreparaciones(admin, orgId), listTandas(admin, orgId, inicioDia(today))]);
  return (
    <EquipoShell title="Preparaciones" sub="Lo que hacemos en la barra" actor={actorOf(ctx)} tz={sede.tz} serverNow={ahoraMs()}>
      <PrepararScreen
        preparaciones={preps.map((p) => ({
          id: p.id,
          name: p.name,
          rinde: `${num(p.rinde)} ${p.unit}`,
          lineas: p.lineas.map((l) => `${num(l.qty)} ${l.unit} · ${l.name}`),
        }))}
        hoy={hoy.map((t) => ({
          id: t.id,
          texto: `${fmtTandas(t.tandas)} ${t.tandas === 1 ? "tanda" : "tandas"} · ${t.nombre} (${num(t.cantidad)} ${t.unit})`,
          quien: t.quien,
          hora: formatTime(new Date(t.at), sede.tz),
        }))}
      />
    </EquipoShell>
  );
}
