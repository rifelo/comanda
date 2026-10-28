import type { MotivoCaja } from "@/lib/caja/movimientos";

type P = { size?: number; w?: number };
const svg = (size: number, w: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IcoMas = ({ size = 16, w = 2.4 }: P) => svg(size, w, <path d="M12 5v14M5 12h14" />);
export const IcoMenos = ({ size = 16, w = 2.4 }: P) => svg(size, w, <path d="M5 12h14" />);
export const IcoAtras = ({ size = 18, w = 2.6 }: P) => svg(size, w, <path d="M19 12H5M11 6l-6 6 6 6" />);
export const IcoSigue = ({ size = 20, w = 2.6 }: P) => svg(size, w, <path d="M5 12h14M13 6l6 6-6 6" />);
export const IcoCheck = ({ size = 20, w = 2.6 }: P) => svg(size, w, <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IcoReloj = ({ size = 20, w = 2.4 }: P) => svg(size, w, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IcoArriba = ({ size = 14, w = 2.6 }: P) => svg(size, w, <path d="M6 15l6-6 6 6" />);
export const IcoAbajo = ({ size = 14, w = 2.6 }: P) => svg(size, w, <path d="M6 9l6 6 6-6" />);
export const IcoAlerta = ({ size = 22, w = 2.4 }: P) => svg(size, w, <><path d="M12 9v4M12 17h.01" /><path d="M10.3 4.2L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /></>);
export const IcoCamara = ({ size = 22, w = 2.2 }: P) => svg(size, w, <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IcoCajon = ({ size = 24, w = 2.2 }: P) => svg(size, w, <><rect x="3" y="6" width="18" height="12" /><circle cx="12" cy="12" r="3" /><path d="M3 10h2M19 10h2" /></>);
export const IcoX = ({ size = 22, w = 2.4 }: P) => svg(size, w, <path d="M6 6l12 12M18 6L6 18" />);
export const IcoBorrar = ({ size = 30, w = 2.2 }: P) => svg(size, w, <><path d="M21 6H8l-5 6 5 6h13z" /><path d="M12 9l5 5M17 9l-5 5" /></>);
export const IcoNube = ({ size = 22, w = 2.2 }: P) => svg(size, w, <><path d="M3 3l18 18" /><path d="M8.5 8.6A5 5 0 0 0 6 18h11" /><path d="M10.7 6.1A6 6 0 0 1 17.7 10 4 4 0 0 1 20.8 15.6" /></>);
export const IcoInfo = ({ size = 20, w = 2.2 }: P) => svg(size, w, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);

/** One icon per reason, as drawn in the design. */
export function IcoMotivo({ motivo, size = 20, w = 2.2 }: P & { motivo: MotivoCaja }) {
  switch (motivo) {
    case "domicilio":
      return svg(size, w, <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l4-8h5l3 8" /><path d="M10 9l-2-4h3" /></>);
    case "pago_pedido":
      return svg(size, w, <><path d="M3 7h12v10H3z" /><path d="M15 10h4l2 3v4h-6" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>);
    case "consignacion":
      return svg(size, w, <><path d="M3 10l9-6 9 6" /><path d="M5 10v9h14v-9" /><path d="M9 19v-5h6v5" /></>);
    case "compra_menor":
      return svg(size, w, <><path d="M6 6h15l-2 8H8z" /><path d="M6 6L5 3H2" /><circle cx="9" cy="19" r="1.6" /><circle cx="17" cy="19" r="1.6" /></>);
    case "retiro":
      return svg(size, w, <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
    case "sencillo":
      return svg(size, w, <><circle cx="8" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></>);
    case "aporte":
      return svg(size, w, <><rect x="3" y="6" width="18" height="12" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M10.5 3.5L12 5l1.5-1.5" /></>);
    case "devolucion":
      return svg(size, w, <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>);
    default:
      return svg(size, w, <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>);
  }
}
