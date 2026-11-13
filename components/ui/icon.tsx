import {
  Banknote,
  BookOpen,
  Coffee,
  Download,
  Ellipsis,
  House,
  ListChecks,
  LogOut,
  MessageCircle,
  Package,
  Percent,
  ReceiptText,
  Settings,
  Star,
  Store,
  TabletSmartphone,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav/items";

/** Nav icon names (plain strings in lib/nav) → lucide components. */
export const NAV_ICONS: Record<IconName, LucideIcon> = {
  whatsapp: MessageCircle,
  hoy: House,
  tareas: ListChecks,
  caja: Banknote,
  inventario: Package,
  pos: Store,
  productos: Coffee,
  equipo: Users,
  mas: Ellipsis,
  gastos: ReceiptText,
  descuentos: Percent,
  clientes: Star,
  ajustes: Settings,
  turno: TabletSmartphone,
  menu: BookOpen,
  instalar: Download,
  avanzado: Wrench,
  salir: LogOut,
};

export function NavIcon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  const I = NAV_ICONS[name];
  return <I size={size} strokeWidth={2} aria-hidden className={className} />;
}
