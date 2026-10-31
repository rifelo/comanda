import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Compra } from "@/lib/compras/compras-db";
import { diferencias, PAGO_RECEPCION } from "@/lib/compras/recepcion";
import { cantidadLegible } from "@/lib/inventario/niveles";
import { posMoney } from "@/lib/pos/types";
import { fechaCorta, formatTime, todayInTz } from "@/lib/utils";

const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" };

/**
 * The orders the team received on the tablet, newest first: who and when,
 * the invoice total and how it was paid, what came different from what was
 * ordered, and both photos (signed for an hour; the bucket is private).
 */
export async function Recibidos({ compras, tz }: { compras: Compra[]; tz: string }) {
  const storage = createSupabaseAdminClient().storage.from("compras-fotos");
  const paths = compras.flatMap((c) => [c.recibido_foto_path, c.factura_foto_path]).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await storage.createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const legible = (qty: number, it: Compra["items"][number]) => (it.unit ? cantidadLegible(qty, { unit: it.unit, pack_qty: it.pack_qty, pieza_qty: it.pieza_qty, pack_label: it.pack_label }) : String(qty));

  return (
    <section aria-label="Pedidos recibidos">
      <div style={label}>Recibidos · {compras.length}</div>
      {compras.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Todavía no se ha recibido ningún pedido desde la tablet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {compras.map((c) => {
          const dif = diferencias(c.items.map((it) => ({ it, pedida: it.qty_pedida, recibida: it.qty_recibida ?? 0 })));
          const foto = (p: string | null, alt: string) => {
            const u = p ? url.get(p) : undefined;
            return u ? (
              <a href={u} target="_blank" rel="noreferrer" title={alt} style={{ display: "block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={u} alt={alt} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4, border: "1px solid var(--rule)" }} />
              </a>
            ) : <span style={{ width: 120, height: 90, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)", border: "1px dashed var(--rule)", borderRadius: 4 }}>sin foto</span>;
          };
          return (
            <div key={c.id} style={{ border: "1.5px solid var(--rule)", borderRadius: 8, background: "var(--paper-lt)", padding: "12px 14px", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>n.º {c.folio} · {c.proveedor_name ?? "Sin proveedor"}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  recibido {c.recibido_at ? `${fechaCorta(todayInTz(tz, new Date(c.recibido_at)))} ${formatTime(c.recibido_at, tz)}` : "—"}{c.recibido_by_name ? ` · ${c.recibido_by_name}` : ""}
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Factura <b className="cmd-num">{c.factura_total_cop !== null ? posMoney(c.factura_total_cop) : "—"}</b>
                  {c.pago_metodo && <span style={{ color: c.pago_metodo === "pendiente" ? "var(--amber)" : "var(--ink-2)", fontWeight: c.pago_metodo === "pendiente" ? 700 : 400 }}> · {PAGO_RECEPCION[c.pago_metodo].label}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.6 }}>{c.items.map((it) => `${legible(it.qty_recibida ?? 0, it)} ${it.nombre}`).join(" · ")}</div>
                {dif.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4, fontWeight: 600 }}>
                    Distinto a lo pedido: {dif.map((x) => `${x.it.nombre} ${x.diff > 0 ? "+" : ""}${legible(x.diff, x.it)}`).join(" · ")}
                  </div>
                )}
                {c.recibido_nota && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>«{c.recibido_nota}»</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {foto(c.recibido_foto_path, `Lo que llegó · pedido ${c.folio}`)}
                {foto(c.factura_foto_path, `Factura · pedido ${c.folio}`)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
