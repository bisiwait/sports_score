"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
