"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribes the staff shift board to ad_hoc_tasks changes for this shift and
 * refreshes the route when one arrives — so admin-assigned tasks appear in
 * real time without a manual reload. The page is `force-dynamic`, so
 * `router.refresh()` re-runs `getShiftView` and re-renders the board.
 */
export function RealtimeAdHoc({ shiftId }: { shiftId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Authorize the realtime socket with the user's token so RLS-filtered
      // postgres_changes are delivered.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`adhoc-${shiftId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ad_hoc_tasks",
            filter: `shift_instance_id=eq.${shiftId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [shiftId, router]);

  return null;
}
