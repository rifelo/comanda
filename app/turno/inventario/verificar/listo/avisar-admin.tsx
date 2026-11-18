import { mensajeSegundaRevision } from "@/lib/inventario/agente/aviso";

/**
 * «Avisar al administrador»: opens WhatsApp to the approvals phone (Ajustes ›
 * Sede) with the items that need a second check and the link to decide.
 * The admin also sees them in «Por atender» either way.
 */
export function AvisarAdmin({ wa, origin, quien, items }: { wa: string | null; origin: string; quien: string; items: { name: string; contado: string; sistema: string | null }[] }) {
  const texto = mensajeSegundaRevision({ quien, items, link: `${origin}/inventario/conteos?estado=revisar` });
  return (
    <div className="verif-aviso" role="status">
      <h2>{items.length === 1 ? "1 insumo necesita segunda revisión" : `${items.length} insumos necesitan segunda revisión`}</h2>
      <p>
        {wa
          ? "Avísale al administrador: él decide si se vuelve a contar o si lo revisa él mismo."
          : "Ya le aparece al administrador en Comanda. Él decide si se vuelve a contar o si lo revisa él mismo."}
      </p>
      {wa ? (
        <a className="verif-solid verif-link" href={`https://wa.me/${wa}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
          Avisar al administrador por WhatsApp
        </a>
      ) : null}
    </div>
  );
}
