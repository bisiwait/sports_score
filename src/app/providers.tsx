"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { PwaEngagementTracker } from "@/components/PwaEngagementTracker";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { DEFAULT_APP_SETTINGS, loadAppSettings } from "@/lib/match-settings-storage";

function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function ThemeBootstrap() {
  useLayoutEffect(() => {
    const initial = loadAppSettings().themeMode ?? DEFAULT_APP_SETTINGS.themeMode;
    applyTheme(initial);
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ServiceWorkerRegister />
      <PwaEngagementTracker />
      <ThemeBootstrap />
      {children}
    </I18nProvider>
  );
}
