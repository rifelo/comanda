import { forward, type ForwardProps } from "@/app/(admin)/equipo/_lib/forward";

/** Números merged into the owner's Hoy (docs/redesign/PLAN.md §2.4): /numeros[/fecha] → /hoy[/fecha]. */
export default async function Moved({ params, searchParams }: ForwardProps & { params: Promise<{ fecha?: string[] }> }) {
  const { fecha } = await params;
  forward(fecha?.[0] ? `/hoy/${encodeURIComponent(fecha[0])}` : "/hoy", await searchParams);
}
