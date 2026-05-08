import type { MatchConfig } from "@/lib/match-config";

export type GameSnapshot = {
  left: number;
  right: number;
  serveLeft: boolean;
};

export function computeNextSnapshot(
  last: GameSnapshot,
  side: "left" | "right",
  cfg: MatchConfig
): GameSnapshot {
  const isServingSide = last.serveLeft ? side === "left" : side === "right";

  if (!cfg.serveEnabled) {
    return {
      left: side === "left" ? last.left + 1 : last.left,
      right: side === "right" ? last.right + 1 : last.right,
      serveLeft: last.serveLeft,
    };
  }

  if (isServingSide) {
    return {
      left: side === "left" ? last.left + 1 : last.left,
      right: side === "right" ? last.right + 1 : last.right,
      serveLeft: last.serveLeft,
    };
  }

  return {
    left: last.left,
    right: last.right,
    serveLeft: side === "left",
  };
}

export function isScoreChanged(a: GameSnapshot, b: GameSnapshot): boolean {
  return a.left !== b.left || a.right !== b.right;
}

/**
 * Team A / B どちらが勝者か。ジュースなしは先取点到達で即決。
 * ジュースありは「片側が先取点以上かつ相手が先取−2以下」で片勝ち、さもなくば両者が先取−1以上のときのみ2点差で決着。
 */
export function getMatchWinnerTeam(
  scoreA: number,
  scoreB: number,
  targetScore: number,
  juiceEnabled: boolean
): "a" | "b" | null {
  if (targetScore <= 2) {
    if (scoreA >= targetScore) return "a";
    if (scoreB >= targetScore) return "b";
    return null;
  }
  if (!juiceEnabled) {
    if (scoreA >= targetScore) return "a";
    if (scoreB >= targetScore) return "b";
    return null;
  }
  const diff = Math.abs(scoreA - scoreB);
  if (scoreA >= targetScore && scoreB <= targetScore - 2) return "a";
  if (scoreB >= targetScore && scoreA <= targetScore - 2) return "b";
  if (scoreA >= targetScore - 1 && scoreB >= targetScore - 1) {
    if (scoreA >= targetScore && diff >= 2 && scoreA > scoreB) return "a";
    if (scoreB >= targetScore && diff >= 2 && scoreB > scoreA) return "b";
  }
  return null;
}

/** @deprecated 互換用: ジュース未考慮の先到達判定 */
export function hasReachedTarget(snapshot: GameSnapshot, targetScore: number): boolean {
  return snapshot.left >= targetScore || snapshot.right >= targetScore;
}
