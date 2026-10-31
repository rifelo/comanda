import * as React from "react";
import { Card, Clock, FlowHeader, Pill, Steps } from "@/components/ui";
import type { Paso } from "@/lib/turno/hoy";

/**
 * Full-screen guided flow (Abrir / Cerrar el turno, reference boards 5 & 9):
 * flow header with progress dots, the steps list on the left (≥ 1024 px),
 * the current step on the right. No tab bar.
 */
export function FlowFrame({
  title,
  sub,
  pasos,
  actual,
  backHref,
  hrefFor,
  falta,
  tz,
  serverNow,
  ancho,
  children,
}: {
  /** Wide step (embedded caja / conteo): the steps list hides, the dots in the header remain. */
  ancho?: boolean;
  title: string;
  sub?: string;
  pasos: Paso[];
  actual: string;
  backHref: string;
  hrefFor: (key: string) => string;
  /** «Faltan 19 min» pill next to the clock. */
  falta?: string;
  tz: string;
  serverNow: number;
  children: React.ReactNode;
}) {
  const idx = Math.max(0, pasos.findIndex((p) => p.key === actual));
  return (
    <div className="h-dvh flex flex-col bg-bg text-text">
      <FlowHeader
        title={title}
        sub={sub}
        step={idx + 1}
        total={pasos.length}
        backHref={backHref}
        right={
          <div className="flex items-center gap-3 shrink-0">
            {falta ? (
              <Pill tone="brand" className="hidden md:inline-flex !h-9 !text-[15px] !px-3.5">
                {falta}
              </Pill>
            ) : null}
            <Clock tz={tz} serverNow={serverNow} className="hidden sm:inline" />
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="min-h-full p-4 sm:p-7 flex gap-5 items-stretch">
          <Card aria-label="Pasos" className={ancho ? "hidden" : "hidden lg:flex w-[330px] shrink-0 !p-3 self-start"}>
            <Steps
              label={title}
              items={pasos.map((p) => ({
                n: p.n,
                title: p.title,
                sub: p.sub,
                state: p.key === actual ? "now" : p.state === "now" ? "todo" : p.state,
                href: p.key === actual ? undefined : hrefFor(p.key),
              }))}
            />
          </Card>
          <div className="flex-1 min-w-0 flex flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
}
