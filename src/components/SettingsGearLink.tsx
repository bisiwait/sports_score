"use client";

import { Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { vibrateUi } from "@/lib/feedback/haptics";
import { resumeWebAudioFromUserGesture } from "@/lib/feedback/web-audio";
import { loadAppSettings } from "@/lib/match-settings-storage";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Props = {
  className?: string;
};

/**
 * 設定へ。48px 以上のタップ領域 + pointerdown で即応（モバイルのリンク遅延を避ける）
 */
export function SettingsGearLink({ className = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const pointerConsumed = useRef(false);
  const returnTo = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const settingsHref = `/settings?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <button
      type="button"
      aria-label={t("a11y.settings")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        resumeWebAudioFromUserGesture();
        if (loadAppSettings().vibrationEnabled) vibrateUi();
        pointerConsumed.current = true;
        router.push(settingsHref);
      }}
      onClick={(e) => {
        if (pointerConsumed.current) {
          pointerConsumed.current = false;
          e.preventDefault();
          return;
        }
        router.push(settingsHref);
      }}
      className={`inline-flex h-12 min-h-[48px] min-w-[48px] shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-[#c4c9d4] transition-opacity [-webkit-tap-highlight-color:transparent] hover:text-[#dde1e9] hover:opacity-95 active:opacity-80 ${className}`}
    >
      <Settings className="h-8 w-8 shrink-0 pointer-events-none" strokeWidth={2} aria-hidden />
    </button>
  );
}
