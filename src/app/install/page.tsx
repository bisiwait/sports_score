"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AppDescriptionCarousel } from "@/components/AppDescriptionCarousel";
import { APP_TAGLINE } from "@/lib/app-description-slides";
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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [message, setMessage] = useState("");
  const [engagementMs, setEngagementMs] = useState(0);

  const refreshInstalled = useCallback(() => {
    setInstalled(isInstalledExperience());
  }, []);

  /** PWA（ホーム画面から）で開いたときはインストール画面ではなくトップへ。 */
  useLayoutEffect(() => {
    if (isStandaloneDisplay()) {
      router.replace("/");
    }
  }, [router]);

  const openAppInBrowser = installed && !isStandaloneDisplay();

  useEffect(() => {
    setIos(isIosDevice());
    refreshInstalled();

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setPersistedInstalledFlag();
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
    const mqs = modes.map((m) => window.matchMedia(`(display-mode: ${m})`));
    const onDisplayMode = () => refreshInstalled();
    mqs.forEach((mq) => mq.addEventListener("change", onDisplayMode));

    const engagementHint = chromeEngagementHintMs();
    const tick = () => setEngagementMs(getPwaEngagementMs());
    tick();
    const engagementId = window.setInterval(tick, 500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mqs.forEach((mq) => mq.removeEventListener("change", onDisplayMode));
      window.clearInterval(engagementId);
    };
  }, [refreshInstalled]);

  const installSupported = Boolean(deferredPrompt);
  const engagementHint = chromeEngagementHintMs();
  const engagementOk = engagementMs >= engagementHint;
  const remainingEngagementSec = Math.max(0, Math.ceil((engagementHint - engagementMs) / 1000));

  const handleInstall = async () => {
    if (installed) return;
    if (ios) {
      setMessage(
        "iPhone / iPad は共有メニューから「ホーム画面に追加」を選んでください（Safari・Chrome どちらでも同じ手順です）。",
      );
      return;
    }
    if (!deferredPrompt) {
      if (!engagementOk) {
        setMessage(
          `Chrome の仕様で、しばらくこのサイトを表示してからでないとインストール用のダイアログが出ないことがあります（目安: あと約 ${remainingEngagementSec} 秒。この画面のままお待ちください）。`,
        );
        return;
      }
      setMessage(
        "この画面からはインストールダイアログを出せません。Chrome / Edge のメニュー（⋮）から「アプリをインストール」または「ホーム画面に追加」を選んでください。LINE などのアプリ内ブラウザの場合は「ブラウザで開く」してからお試しください。",
      );
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome !== "accepted") {
      setMessage("インストールはキャンセルされました。");
    }
    setDeferredPrompt(null);
  };

  const showChromeWaitHint = !ios && !installSupported && !installed && !engagementOk;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <div className="flex items-center gap-3">
        <img src="/icon-192x192.png" alt="Sports Score icon" className="h-8 w-8 rounded-md" />
        <h1 className="text-xl font-semibold tracking-tight">Sports Score</h1>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/85">{APP_TAGLINE}</p>
      <div className="mt-5 min-w-0">
        <AppDescriptionCarousel />
      </div>

      {showChromeWaitHint ? (
        <p className="mt-4 rounded-xl border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground/85">
          Chrome では、このサイトを<strong>合計約30秒</strong>表示したあとにインストール用の準備が整うことがあります（他のページを見ていてもカウントされます）。あと約{" "}
          <span className="font-mono tabular-nums">{remainingEngagementSec}</span> 秒…
        </p>
      ) : null}

      {openAppInBrowser ? (
        <p className="mt-3 text-sm text-foreground/75">
          インストール済みです。ブラウザからは通常表示のままです。アプリの画面を使うには下のボタンでトップへ進むか、ホーム画面のアイコンから開いてください。
        </p>
      ) : null}

      {openAppInBrowser ? (
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 text-base font-semibold text-background"
        >
          アプリを開く
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 text-base font-semibold text-background disabled:opacity-45"
          disabled={installed}
        >
          {installed ? "インストール済み" : "インストール"}
        </button>
      )}

      <section className="mt-6 rounded-xl border border-foreground/15 p-4">
        <h2 className="text-sm font-semibold">iPhone / iPad（Safari・Chrome 共通）の手順</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
          <li>下部の共有ボタン（四角と上向き矢印）を押す</li>
          <li>「ホーム画面に追加」を選ぶ</li>
          <li>追加後、ホーム画面のアイコンから起動する</li>
        </ol>
      </section>

      {message ? <p className="mt-4 text-sm text-[#D7FF5B]">{message}</p> : null}

      {!ios && !installSupported && !installed && engagementOk ? (
        <p className="mt-3 text-xs text-foreground/55">
          準備が整っているのにボタンで出ない場合は、ページを再読み込みするか Chrome / Edge のメニューからインストールしてください。
        </p>
      ) : null}
    </main>
  );
}
