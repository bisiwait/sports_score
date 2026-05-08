import type { MatchConfig } from "@/lib/match-config";
import type { GameSnapshot } from "@/lib/match-play";

/** 観客タブの疑似リアルタイム用・同一端末の別タブ同期用 */
export const LIVE_MATCH_KEY = "sports_score_live_match";

type LivePayload = {
  targetScore: number;
  serveEnabled: boolean;
  juiceEnabled: boolean;
  left: number;
  right: number;
  serveLeft: boolean;
  updatedAt: number;
};

function matchesConfig(data: LivePayload, cfg: MatchConfig): boolean {
  return (
    data.targetScore === cfg.targetScore &&
    data.serveEnabled === cfg.serveEnabled &&
    data.juiceEnabled === cfg.juiceEnabled
  );
}

export function saveLiveMatchState(cfg: MatchConfig, snapshot: GameSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const payload: LivePayload = {
      targetScore: cfg.targetScore,
      serveEnabled: cfg.serveEnabled,
      juiceEnabled: cfg.juiceEnabled,
      left: snapshot.left,
      right: snapshot.right,
      serveLeft: snapshot.serveLeft,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(LIVE_MATCH_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadLiveMatchState(cfg: MatchConfig): GameSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIVE_MATCH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LivePayload;
    if (!matchesConfig(data, cfg)) return null;
    return {
      left: data.left,
      right: data.right,
      serveLeft: data.serveLeft,
    };
  } catch {
    return null;
  }
}

/** 観客画面のポーリング間隔（ミリ秒） */
export const READONLY_REFRESH_MS = 30_000;
