/**
 * Page header shared by the Turnos / Configuración / Caja… admin pages.
 * Redesign: Inter 28/700 title with the kicker as a small muted line above
 * (PageHeader look, docs/redesign/DESIGN.md). Same props as before.
 */
export function TurnosHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-7 pt-5 pb-4 border-b border-line">
      <div className="min-w-0">
        <div className="ui-label">{kicker}</div>
        <h1 className="ui-h1 m-0 mt-1">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
