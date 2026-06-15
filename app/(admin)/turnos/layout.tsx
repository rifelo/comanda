import { getActiveSede } from "@/lib/data/sede";
import { TurnosMobileTabs } from "./_components/turnos-mobile-tabs";

/**
 * Turnos module layout. Adds the mobile-only section tab bar above every
 * Turnos sub-page; on desktop the sidebar handles section nav so this renders
 * nothing extra. The desktop artboards are untouched — each page renders its
 * existing desktop UI wrapped `hidden md:block`, plus a `md:hidden` mobile view.
 */
export default async function TurnosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sede = await getActiveSede();
  return (
    <>
      <TurnosMobileTabs sedeName={sede?.name ?? "Daniel's Burger"} />
      {children}
    </>
  );
}
