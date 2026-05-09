"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");

  const ios = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setMessage("インストールが完了しました。ホーム画面から起動できます。");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const installSupported = Boolean(deferredPrompt);

  const handleInstall = async () => {
    if (installed) {
      setMessage("すでにインストール済みです。");
      return;
    }
    if (ios) {
      setMessage("iPhone/iPad は Safari の共有メニューから「ホーム画面に追加」を選択してください。");
      return;
    }
    if (!deferredPrompt) {
      setMessage("この環境ではインストールプロンプトを表示できません。対応ブラウザで開いてください。");
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setMessage("インストールを開始しました。");
    } else {
      setMessage("インストールはキャンセルされました。");
    }
    setDeferredPrompt(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-8">
      <div className="flex items-center gap-3">
        <img src="/icon-192x192.png" alt="Sports Score icon" className="h-8 w-8 rounded-md" />
        <h1 className="text-xl font-semibold tracking-tight">Sports Score</h1>
      </div>
      <p className="mt-3 text-sm text-foreground/75">android版</p>

      <button
        type="button"
        onClick={() => void handleInstall()}
        className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 text-base font-semibold text-background disabled:opacity-45"
        disabled={installed}
      >
        {installed ? "インストール済み" : "アプリをインストール"}
      </button>

      <section className="mt-6 rounded-xl border border-foreground/15 p-4">
        <h2 className="text-sm font-semibold">iOS (Safari) の手順</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
          <li>下部の共有ボタン（四角と上向き矢印）を押す</li>
          <li>「ホーム画面に追加」を選ぶ</li>
          <li>追加後、ホーム画面のアイコンから起動する</li>
        </ol>
      </section>

      {message ? <p className="mt-4 text-sm text-[#D7FF5B]">{message}</p> : null}

      {!ios && !installSupported && !installed ? (
        <p className="mt-3 text-xs text-foreground/55">インストールボタンが無効な場合は、Chrome/Edge の最新版で開いてください。</p>
      ) : null}
    </main>
  );
}
