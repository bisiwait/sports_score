"use client";

import { ChevronLeft, Moon, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SettingsFeedbackSwitch } from "@/components/SettingsFeedbackSwitch";
import { vibrateUi } from "@/lib/feedback/haptics";
import { resumeWebAudioFromUserGesture } from "@/lib/feedback/web-audio";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Lang } from "@/lib/i18n/dictionary";
import { LANGS } from "@/lib/i18n/dictionary";
import { buildMatchHref } from "@/lib/match-config";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  normalizeTargetInput,
  normalizeTeamInput,
  saveAppSettings,
} from "@/lib/match-settings-storage";
import { hasSupabaseEnv, supabase } from "@/lib/supabase-browser";

const LANGUAGE_UI: Record<Lang, string> = {
  ja: "日本語",
  en: "English",
  es: "Español",
  ru: "Русский",
  th: "ไทย",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto min-h-dvh w-full max-w-md px-4 py-5" />}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const { lang, setLang, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [targetInput, setTargetInput] = useState("21");
  const [serveEnabled, setServeEnabled] = useState(true);
  const [juiceEnabled, setJuiceEnabled] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [teamLeftInput, setTeamLeftInput] = useState(DEFAULT_APP_SETTINGS.teamLeftName);
  const [teamRightInput, setTeamRightInput] = useState(DEFAULT_APP_SETTINGS.teamRightName);
  const [storageReady, setStorageReady] = useState(false);
  const langTouchConsumed = useRef(false);

  const onUiPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      resumeWebAudioFromUserGesture();
      if (vibrationEnabled) vibrateUi();
    },
    [vibrationEnabled]
  );

  const onSwitchPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      resumeWebAudioFromUserGesture();
      if (vibrationEnabled) vibrateUi();
    },
    [vibrationEnabled]
  );

  const setThemeAndApply = useCallback((next: "dark" | "light") => {
    setThemeMode(next);
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const s = loadAppSettings();
      setTargetInput(String(s.targetScore));
      setServeEnabled(s.serveEnabled);
      setJuiceEnabled(s.juiceEnabled);
      setThemeMode(s.themeMode);
      setSoundEnabled(s.soundEnabled);
      setVibrationEnabled(s.vibrationEnabled);
      setTeamLeftInput(s.teamLeftName);
      setTeamRightInput(s.teamRightName);
      setStorageReady(true);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    saveAppSettings({
      targetScore: normalizeTargetInput(targetInput),
      serveEnabled,
      juiceEnabled,
      themeMode,
      soundEnabled,
      vibrationEnabled,
      teamLeftName: normalizeTeamInput(teamLeftInput, DEFAULT_APP_SETTINGS.teamLeftName),
      teamRightName: normalizeTeamInput(teamRightInput, DEFAULT_APP_SETTINGS.teamRightName),
    });
  }, [
    storageReady,
    targetInput,
    serveEnabled,
    juiceEnabled,
    themeMode,
    soundEnabled,
    vibrationEnabled,
    teamLeftInput,
    teamRightInput,
  ]);

  const trimmed = targetInput.trim();
  const parsedTarget = Number.parseInt(trimmed, 10);
  const isValidTarget = Number.isFinite(parsedTarget) && parsedTarget >= 1 && parsedTarget <= 99;

  const returnToMatchId = useMemo(() => {
    if (!returnTo?.startsWith("/match")) return null;
    const query = returnTo.split("?")[1] ?? "";
    const sp = new URLSearchParams(query);
    const id = sp.get("id");
    return id && id.length > 0 ? id : null;
  }, [returnTo]);

  /** 試合へ戻る／試合開始で共通：フォームの target・serve を反映した URL（既存の id は維持） */
  const navigateMatchHref = useMemo(() => {
    const normalizedTarget = normalizeTargetInput(targetInput);
    const cfg = { targetScore: normalizedTarget, serveEnabled, juiceEnabled };

    let id: string | null = returnToMatchId;
    let mode: string | null = null;
    if (returnTo?.startsWith("/match")) {
      const query = returnTo.split("?")[1] ?? "";
      const prev = new URLSearchParams(query);
      if (!id) {
        const fromUrl = prev.get("id");
        id = fromUrl && fromUrl.length > 0 ? fromUrl : null;
      }
      mode = prev.get("mode");
    }

    if (!id) return buildMatchHref(cfg);

    const sp = new URLSearchParams(buildMatchHref(cfg).split("?")[1] ?? "");
    sp.set("id", id);
    if (mode) sp.set("mode", mode);
    return `/match?${sp.toString()}`;
  }, [returnTo, returnToMatchId, targetInput, serveEnabled, juiceEnabled]);

  const handleBackToMatch = useCallback(async () => {
    const normalizedLeft = normalizeTeamInput(teamLeftInput, DEFAULT_APP_SETTINGS.teamLeftName);
    const normalizedRight = normalizeTeamInput(teamRightInput, DEFAULT_APP_SETTINGS.teamRightName);

    if (hasSupabaseEnv && supabase && returnToMatchId) {
      const { error } = await supabase
        .from("score_matches")
        .update({
          team_a_name: normalizedLeft,
          team_b_name: normalizedRight,
        })
        .eq("id", returnToMatchId);

      if (error) {
        console.error("back to match name update failed:", error.message);
      }
    }

    router.push(navigateMatchHref);
  }, [navigateMatchHref, returnToMatchId, router, teamLeftInput, teamRightInput]);

  const handleStartMatch = useCallback(async () => {
    const normalizedLeft = normalizeTeamInput(teamLeftInput, DEFAULT_APP_SETTINGS.teamLeftName);
    const normalizedRight = normalizeTeamInput(teamRightInput, DEFAULT_APP_SETTINGS.teamRightName);

    if (hasSupabaseEnv && supabase && returnToMatchId) {
      const resetPayload = {
        team_a_name: normalizedLeft,
        team_b_name: normalizedRight,
        score_a: 0,
        score_b: 0,
        court_display_flipped: false,
        ...(serveEnabled ? { serve_team: "A" } : {}),
      };
      const { error } = await supabase
        .from("score_matches")
        .update(resetPayload)
        .eq("id", returnToMatchId);

      if (error) {
        console.error("start match reset failed:", error.message);
      } else {
        console.log("start match reset success:", returnToMatchId);
      }
    }

    router.push(navigateMatchHref);
  }, [navigateMatchHref, returnToMatchId, router, serveEnabled, teamLeftInput, teamRightInput]);

  return (
    <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col px-4 py-5">
      <div className="mb-8">
        <button
          type="button"
          onPointerDown={(e) => {
            onUiPointerDown(e);
          }}
          onClick={() => {
            void handleBackToMatch();
          }}
          className="inline-flex w-full touch-manipulation cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-foreground/20 bg-foreground/[0.06] py-3.5 text-base font-semibold text-foreground transition-colors hover:border-foreground/35 hover:bg-foreground/[0.09] active:opacity-95"
        >
          <ChevronLeft className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
          {t("settings.backToMatch")}
        </button>
      </div>

      <header className="mb-6">
        <h1 className="text-xl font-medium tracking-tight">{t("settings.title")}</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.languageSection")}</h2>
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGS.map((code) => (
            <button
              key={code}
              type="button"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                resumeWebAudioFromUserGesture();
                if (vibrationEnabled) vibrateUi();
                langTouchConsumed.current = true;
                setLang(code);
              }}
              onClick={() => {
                if (langTouchConsumed.current) {
                  langTouchConsumed.current = false;
                  return;
                }
                setLang(code);
              }}
              className={`w-full min-w-0 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-center text-sm transition-colors ${
                lang === code
                  ? "border-[#D7FF5B] bg-[#D7FF5B]/15 text-[#D7FF5B]"
                  : "border-foreground/15 bg-transparent hover:border-foreground/30"
              }`}
            >
              {LANGUAGE_UI[code]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.targetSection")}</h2>
        <label className="block">
          <span className="mb-1 block text-xs text-foreground/50">{t("settings.targetLabel")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={targetInput}
            onPointerDown={onUiPointerDown}
            onChange={(e) => setTargetInput(e.target.value)}
            onBlur={() => {
              const n = Number.parseInt(targetInput, 10);
              const normalized = Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 21;
              setTargetInput(String(normalized));
            }}
            className="w-full touch-manipulation rounded-lg border border-foreground/15 bg-transparent px-3 py-2.5 text-base outline-none focus:border-foreground/40"
          />
        </label>
        {!isValidTarget ? <p className="text-xs text-red-600">{t("settings.targetInvalid")}</p> : null}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.serveSection")}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setServeEnabled(true)}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              serveEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            {t("settings.serveOn")}
          </button>
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setServeEnabled(false)}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              !serveEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            {t("settings.serveOff")}
          </button>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.juiceSection")}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setJuiceEnabled(true)}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              juiceEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            {t("settings.juiceOn")}
          </button>
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setJuiceEnabled(false)}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              !juiceEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            {t("settings.juiceOff")}
          </button>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.themeSection")}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setThemeAndApply("dark")}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              themeMode === "dark"
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Moon className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t("settings.themeDark")}</span>
            </span>
          </button>
          <button
            type="button"
            onPointerDown={onUiPointerDown}
            onClick={() => setThemeAndApply("light")}
            className={`flex-1 touch-manipulation cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
              themeMode === "light"
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-transparent hover:border-foreground/30"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Sun className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t("settings.themeLight")}</span>
            </span>
          </button>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.teamSection")}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-foreground/50">{t("settings.teamLeftLabel")}</span>
            <input
              type="text"
              maxLength={32}
              value={teamLeftInput}
              onPointerDown={onUiPointerDown}
              onChange={(e) => setTeamLeftInput(e.target.value)}
              className="w-full touch-manipulation rounded-lg border border-foreground/15 bg-transparent px-3 py-2.5 text-base outline-none focus:border-foreground/40"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-foreground/50">{t("settings.teamRightLabel")}</span>
            <input
              type="text"
              maxLength={32}
              value={teamRightInput}
              onPointerDown={onUiPointerDown}
              onChange={(e) => setTeamRightInput(e.target.value)}
              className="w-full touch-manipulation rounded-lg border border-foreground/15 bg-transparent px-3 py-2.5 text-base outline-none focus:border-foreground/40"
              autoComplete="off"
            />
          </label>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-foreground/80">{t("settings.feedbackSection")}</h2>
        <p className="text-xs text-foreground/50">{t("settings.feedbackHint")}</p>
        <div className="space-y-2">
          <SettingsFeedbackSwitch
            id="setting-sound"
            label={t("settings.soundLabel")}
            checked={soundEnabled}
            onCheckedChange={setSoundEnabled}
            onPointerDownUnlock={onSwitchPointerDown}
          />
          <SettingsFeedbackSwitch
            id="setting-vibration"
            label={t("settings.vibrationLabel")}
            checked={vibrationEnabled}
            onCheckedChange={setVibrationEnabled}
            onPointerDownUnlock={onSwitchPointerDown}
          />
        </div>
      </section>

      <div className="relative z-50 mt-auto flex flex-col gap-4 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="inline-flex w-full cursor-pointer touch-manipulation items-center justify-center rounded-lg bg-foreground py-3.5 text-center text-sm font-medium text-background no-underline active:opacity-90"
          onPointerDown={(e) => {
            onUiPointerDown(e);
          }}
          onClick={() => {
            void handleStartMatch();
          }}
        >
          {t("settings.startMatch")}
        </button>
        <p className="text-center text-[11px] tabular-nums text-foreground/35">version 1.00</p>
      </div>
    </div>
  );
}
