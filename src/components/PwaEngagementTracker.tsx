"use client";

import { useEffect } from "react";
import { addPwaEngagementMs } from "@/lib/pwa-install";

/** Chrome の `beforeinstallprompt` 用ヒューリスティックに近い「閲覧時間」をざっくり積む。 */
export function PwaEngagementTracker() {
  useEffect(() => {
    const step = 1000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      addPwaEngagementMs(step);
    }, step);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
