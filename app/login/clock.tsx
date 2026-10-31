"use client";

import * as React from "react";
import { nowInTz } from "@/lib/utils";

/** Live HH:MM in the sede's zone. SSR renders `serverNow`, so hydration matches. */
export function LoginClock({ tz, serverNow }: { tz: string; serverNow: string }) {
  const [now, setNow] = React.useState(serverNow);
  React.useEffect(() => {
    const tick = () => setNow(nowInTz(tz));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [tz]);
  return (
    <span className="lg-clock" aria-label={`Hora ${now}`}>
      {now.replace(/^0(\d)/, "$1")}
    </span>
  );
}
