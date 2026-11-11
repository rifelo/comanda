"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { recalcularPar } from "./actions";

export function Recalcular() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg ? <span className="text-sm text-muted">{msg}</span> : null}
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await recalcularPar();
          setBusy(false);
          setMsg(r.ok ? `${r.n} insumos recalculados` : r.error);
          router.refresh();
        }}
      >
        Recalcular ahora
      </Button>
    </span>
  );
}
