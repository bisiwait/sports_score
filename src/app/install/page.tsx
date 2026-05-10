"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppDescriptionCarousel } from "@/components/AppDescriptionCarousel";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { interpolate } from "@/lib/interpolate";
import {
  chromeEngagementHintMs,
  getPwaEngagementMs,
  isInstalledExperience,
  isStandaloneDisplay,
  setPersistedInstalledFlag,
} from "@/lib/pwa-install";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** iOS / iPadOS（Chrome 含む）。いずれも `beforeinstallprompt` は使えない。 */
function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export default function InstallPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [message, setMessage] = useState("");
  const [engagementMs, setEngagementMs] = useState(0);
  const [installing, setInstalling] = useState(false);
  const installWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInstallWaitTimeout = useCallback(() => {
    if (installWaitTimeoutRef.current != null) {
      window.clearTimeout(installWaitTimeoutRef.current);
      installWaitTimeoutRef.current = null;
    }
  }, []);

  const refreshInstalled = useCallback(() => {
    const done = isInstalledExperience();
    setInstalled(done);
    if (done) {
      setInstalling(false);
      clearInstallWaitTimeout();
    }
  }, [clearInstallWaitTimeout]);

  /** アイコンから PWA 起動時は常にトップ（`/install` に来た場合も即リダイレクト）。 */
  useLayoutEffect(() => {
    if (isStandaloneDisplay()) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    setIos(isIosDevice());
    refreshInstalled();

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      clearInstallWaitTimeout();
      setPersistedInstalledFlag();
      setInstalled(true);
      setInstalling(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
    const mqs = modes.map((m) => window.matchMedia(`(display-mode: ${m})`));
    const onDisplayMode = () => refreshInstalled();
    mqs.forEach((mq) => mq.addEventListener("change", onDisplayMode));

    const tick = () => setEngagementMs(getPwaEngagementMs());
    tick();
    const engagementId = window.setInterval(tick, 500);

    return () => {
      clearInstallWaitTimeout();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mqs.forEach((mq) => mq.removeEventListener("change", onDisplayMode));
      window.clearInterval(engagementId);
    };
  }, [refreshInstalled, clearInstallWaitTimeout]);

  const installSupported = Boolean(deferredPrompt);
  const engagementHint = chromeEngagementHintMs();
  const engagementOk = engagementMs >= engagementHint;
  const remainingEngagementSec = Math.max(0, Math.ceil((engagementHint - engagementMs) / 1000));

  const handleInstall = async () => {
    if (installed || installing) return;
    if (ios) {
      setMessage(t("install.msg.iosAddToHome"));
      return;
    }
    if (!deferredPrompt) {
      if (!engagementOk) {
        setMessage(interpolate(t("install.msg.engagementWait"), { sec: remainingEngagementSec }));
        return;
      }
      setMessage(t("install.msg.noPrompt"));
      return;
    }

    const promptEvent = deferredPrompt;
    setInstalling(true);
    setMessage("");

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome !== "accepted") {
        clearInstallWaitTimeout();
        setInstalling(false);
        setMessage(t("install.msg.cancelled"));
        return;
      }

      clearInstallWaitTimeout();
      installWaitTimeoutRef.current = window.setTimeout(() => {
        installWaitTimeoutRef.current = null;
        if (isInstalledExperience()) {
          setInstalled(true);
          setInstalling(false);
          return;
        }
        setInstalling(false);
        setMessage((prev) => prev || t("install.msg.installSlow"));
      }, 25000);
    } catch {
      clearInstallWaitTimeout();
      setInstalling(false);
      setMessage(t("install.msg.promptFailed"));
    }
  };

  const showChromeWaitHint = !ios && !installSupported && !installed && !engagementOk && !installing;

  const buttonLabel = installed ? t("install.button.installed") : installing ? t("install.button.installing") : t("install.button.install");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <div className="flex items-center gap-3">
        <img src="/icon-192x192.png" alt={t("install.iconAlt")} className="h-8 w-8 rounded-md" />
        <h1 className="text-xl font-semibold tracking-tight">{t("install.appTitle")}</h1>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/85">{t("install.tagline")}</p>
      <div className="mt-5 min-w-0">
        <AppDescriptionCarousel />
      </div>

      {showChromeWaitHint ? (
        <p className="mt-4 rounded-xl border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground/85">
          {t("install.chromeWait.beforeStrong")}
          <strong>{t("install.chromeWait.strong")}</strong>
          {interpolate(t("install.chromeWait.afterStrong"), { sec: remainingEngagementSec })}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleInstall()}
        className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 text-base font-semibold text-background disabled:opacity-45"
        disabled={installed || installing}
        aria-busy={installing}
      >
        {buttonLabel}
      </button>

      <section className="mt-6 rounded-xl border border-foreground/15 p-4">
        <h2 className="text-sm font-semibold">{t("install.ios.title")}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
          <li>{t("install.ios.step1")}</li>
          <li>{t("install.ios.step2")}</li>
          <li>{t("install.ios.step3")}</li>
        </ol>
      </section>

      {message ? <p className="mt-4 text-sm text-[#D7FF5B]">{message}</p> : null}

      {!ios && !installSupported && !installed && engagementOk ? (
        <p className="mt-3 text-xs text-foreground/55">{t("install.menuFallback")}</p>
      ) : null}
    </main>
  );
}
