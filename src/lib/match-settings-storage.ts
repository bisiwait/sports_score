import { DEFAULT_CONFIG, type MatchConfig } from "@/lib/match-config";

/** localStorage キー（観客画面の `storage` 同期などで参照） */
export const MATCH_SETTINGS_STORAGE_KEY = "sports_score_match_settings";

const STORAGE_KEY = MATCH_SETTINGS_STORAGE_KEY;

const TEAM_MAX = 32;

type StoredPayload = {
  targetScore?: unknown;
  serveEnabled?: unknown;
  juiceEnabled?: unknown;
  themeMode?: unknown;
  soundEnabled?: unknown;
  vibrationEnabled?: unknown;
  teamLeftName?: unknown;
  teamRightName?: unknown;
};

/** 試合設定 + フィードバック（保存用の全体） */
export type AppSettings = MatchConfig & {
  themeMode: "dark" | "light";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  teamLeftName: string;
  teamRightName: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  targetScore: DEFAULT_CONFIG.targetScore,
  serveEnabled: DEFAULT_CONFIG.serveEnabled,
  juiceEnabled: DEFAULT_CONFIG.juiceEnabled,
  themeMode: "dark",
  soundEnabled: true,
  vibrationEnabled: true,
  teamLeftName: "Player 1",
  teamRightName: "Player 2",
};

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CONFIG.targetScore;
  return Math.min(99, Math.max(1, Math.round(n)));
}

function normalizeTeamName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim().slice(0, TEAM_MAX);
  return t.length > 0 ? t : fallback;
}

function parsePayload(data: StoredPayload): AppSettings {
  const targetScore =
    typeof data.targetScore === "number" ? clampTarget(data.targetScore) : DEFAULT_APP_SETTINGS.targetScore;
  const serveEnabled =
    typeof data.serveEnabled === "boolean" ? data.serveEnabled : DEFAULT_APP_SETTINGS.serveEnabled;
  const juiceEnabled =
    typeof data.juiceEnabled === "boolean" ? data.juiceEnabled : DEFAULT_APP_SETTINGS.juiceEnabled;
  const themeMode =
    data.themeMode === "light" || data.themeMode === "dark"
      ? data.themeMode
      : DEFAULT_APP_SETTINGS.themeMode;
  const soundEnabled =
    typeof data.soundEnabled === "boolean" ? data.soundEnabled : DEFAULT_APP_SETTINGS.soundEnabled;
  const vibrationEnabled =
    typeof data.vibrationEnabled === "boolean"
      ? data.vibrationEnabled
      : DEFAULT_APP_SETTINGS.vibrationEnabled;
  const teamLeftName = normalizeTeamName(data.teamLeftName, DEFAULT_APP_SETTINGS.teamLeftName);
  const teamRightName = normalizeTeamName(data.teamRightName, DEFAULT_APP_SETTINGS.teamRightName);
  return {
    targetScore,
    serveEnabled,
    juiceEnabled,
    themeMode,
    soundEnabled,
    vibrationEnabled,
    teamLeftName,
    teamRightName,
  };
}

/** 現在の保存内容（無ければデフォルト） */
export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const data = JSON.parse(raw) as StoredPayload;
    return parsePayload(data);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        targetScore: settings.targetScore,
        serveEnabled: settings.serveEnabled,
        juiceEnabled: settings.juiceEnabled,
        themeMode: settings.themeMode,
        soundEnabled: settings.soundEnabled,
        vibrationEnabled: settings.vibrationEnabled,
        teamLeftName: settings.teamLeftName,
        teamRightName: settings.teamRightName,
      })
    );
  } catch {
    /* 容量やプライベートモードでは無視 */
  }
}

export function normalizeTeamInput(raw: string, fallback: string): string {
  const t = String(raw).trim().slice(0, TEAM_MAX);
  return t.length > 0 ? t : fallback;
}

/**
 * 画面起動時に「試合オプションだけ」読みたい場合用。
 * 保存が一度も無いときは null（従来どおり）。
 */
export function loadMatchSettings(): MatchConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredPayload;
    const parsed = parsePayload(data);
    return {
      targetScore: parsed.targetScore,
      serveEnabled: parsed.serveEnabled,
      juiceEnabled: parsed.juiceEnabled,
    };
  } catch {
    return null;
  }
}

export function saveMatchSettings(config: MatchConfig): void {
  const cur = loadAppSettings();
  saveAppSettings({
    ...cur,
    targetScore: config.targetScore,
    serveEnabled: config.serveEnabled,
    juiceEnabled: config.juiceEnabled,
  });
}

export function normalizeTargetInput(raw: string): number {
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? clampTarget(n) : DEFAULT_CONFIG.targetScore;
}
