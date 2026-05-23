import { ProductosSubNav, ProductosSubNavMobile } from "./_components/sub-nav";

/**
 * Productos module shell. Server Component — sub-nav is a child client island.
 * Wraps every /productos/* page with the 11-section side navigation.
 */
export default function ProductosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="cmd-paper flex flex-col lg:flex-row min-h-screen text-ink">
      <ProductosSubNav />
      <ProductosSubNavMobile />
      <div className="flex-1 min-w-0 overflow-auto">{children}</div>
    </div>
  );
}
