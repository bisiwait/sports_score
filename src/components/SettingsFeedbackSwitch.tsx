"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

type Props = {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  onPointerDownUnlock: (e: ReactPointerEvent<HTMLButtonElement>) => void;
};

/**
 * 設定画面用のトラック＋ノブ型スイッチ（role="switch"）
 */
export function SettingsFeedbackSwitch({
  id,
  label,
  checked,
  onCheckedChange,
  onPointerDownUnlock,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-foreground/15 bg-foreground/[0.02] px-4 py-3.5">
      <span id={id} className="text-sm font-medium leading-snug text-foreground/90">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onPointerDown={onPointerDownUnlock}
        onClick={() => onCheckedChange(!checked)}
        className={`relative h-8 w-[3.125rem] shrink-0 rounded-full transition-colors duration-200 [-webkit-tap-highlight-color:transparent] ${
          checked ? "bg-[#D7FF5B]" : "bg-foreground/20"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-1 left-1 block h-6 w-6 rounded-full bg-background shadow-md transition-transform duration-200 ease-out ${
            checked ? "translate-x-[1.125rem]" : "translate-x-0"
          }`}
          aria-hidden
        />
      </button>
    </div>
  );
}
