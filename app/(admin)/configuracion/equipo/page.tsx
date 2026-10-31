import { forward, type ForwardProps } from "@/app/(admin)/equipo/_lib/forward";

/** Moved in the redesign (docs/redesign/PLAN.md §2.4): /equipo. */
export default async function Moved({ searchParams }: ForwardProps) {
  forward("/equipo", await searchParams);
}
