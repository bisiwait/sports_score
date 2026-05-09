"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeftRight, Copy, QrCode } from "lucide-react";
import { ServeIndicator } from "@/components/ServeIndicator";
import { SettingsGearLink } from "@/components/SettingsGearLink";
import { vibrateImpact, vibrateUi } from "@/lib/feedback/haptics";
import { playTapPing, playVictoryChime, resumeWebAudioFromUserGesture } from "@/lib/feedback/web-audio";
import {
  DEFAULT_CONFIG,
  hasExplicitMatchQuery,
  isReadonlyView,
  parseMatchConfigFromSearchParams,
  type MatchConfig,
} from "@/lib/match-config";
import {
  computeNextSnapshot,
  getMatchWinnerTeam,
  type GameSnapshot,
} from "@/lib/match-play";
import { hasSupabaseEnv, supabase } from "@/lib/supabase-browser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  loadMatchSettings,
} from "@/lib/match-settings-storage";

/** 1行分: DB列 score_a / score_b / serve_team のみ履歴管理（チーム名は別 state） */
type ScoreHistoryRow = {
  score_a: number;
  score_b: number;
  serve_team: "A" | "B";
};

const FLASH_MS = 100;

function serveTopFrameClass(isServing: boolean, serveEnabled: boolean) {
  if (!serveEnabled) return "";
  return [
    "mx-2 mt-2 shrink-0 flex min-h-[4rem] flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 pb-3 pt-3 transition-[border-color,box-shadow,background-color] duration-300 ease-out",
    isServing
      ? "border-[#D7FF5B] bg-[#D7FF5B]/[0.08] shadow-[0_0_18px_rgba(215,255,91,0.45)]"
      : "border-transparent bg-transparent",
  ].join(" ");
}

function resolveConfigFromSearchParams(searchKey: string): MatchConfig {
  const sp = new URLSearchParams(searchKey);
  if (hasExplicitMatchQuery(sp)) return parseMatchConfigFromSearchParams(sp);
  return DEFAULT_CONFIG;
}

type ScoreRow = {
  id: string;
  team_a_name: string | null;
  team_b_name: string | null;
  score_a: number | null;
  score_b: number | null;
  serve_team: string | null;
  /** false: 左=A・右=B と同じ見え方／true: 審判のコートチェンジ済みを観客も反映する */
  court_display_flipped?: boolean | null;
};

function normalizeServeTeam(v: string | null): "A" | "B" {
  return String(v ?? "A").toUpperCase() === "B" ? "B" : "A";
}

function rowToScoreHistory(row: ScoreRow): ScoreHistoryRow {
  return {
    score_a: Number(row.score_a ?? 0),
    score_b: Number(row.score_b ?? 0),
    serve_team: normalizeServeTeam(row.serve_team),
  };
}

function isSameScoreHistory(a: ScoreHistoryRow, b: ScoreHistoryRow): boolean {
  return (
    a.score_a === b.score_a && a.score_b === b.score_b && a.serve_team === b.serve_team
  );
}

function initialScoreHistory(): ScoreHistoryRow {
  return { score_a: 0, score_b: 0, serve_team: "A" };
}

/** 物理左がサーブかどうかと、Team A が物理左にいるかから serve_team を復元 */
function physicalServeLeftToServeTeam(serveLeft: boolean, aOnLeft: boolean): "A" | "B" {
  if (aOnLeft) return serveLeft ? "A" : "B";
  return serveLeft ? "B" : "A";
}

/** 物理左列が Team A を表示しているか（DB と同期された displayFlipped で一意に決める） */
function teamAOnPhysicalLeft(displayFlipped: boolean): boolean {
  return !displayFlipped;
}

export function MatchClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const matchId = searchParams.get("id");

  const isReadonly = useMemo(
    () => isReadonlyView(new URLSearchParams(searchKey)),
    [searchKey]
  );

  const [storedMatchConfig, setStoredMatchConfig] = useState<MatchConfig | null>(null);

  const effectiveConfig = useMemo((): MatchConfig => {
    const sp = new URLSearchParams(searchKey);
    if (hasExplicitMatchQuery(sp)) {
      return parseMatchConfigFromSearchParams(sp);
    }
    if (!matchId && storedMatchConfig) {
      return storedMatchConfig;
    }
    return resolveConfigFromSearchParams(searchKey);
  }, [matchId, searchKey, storedMatchConfig]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(matchId);
  const [isMatchReady, setIsMatchReady] = useState(() => !hasSupabaseEnv);

  const [team_a_name, setTeam_a_name] = useState(DEFAULT_APP_SETTINGS.teamLeftName);
  const [team_b_name, setTeam_b_name] = useState(DEFAULT_APP_SETTINGS.teamRightName);

  const [history, setHistory] = useState<ScoreHistoryRow[]>(() => [initialScoreHistory()]);
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /** 審判のみ: 見た目の左右を入れ替え。DB には一切書かない。 */
  const [displayFlipped, setDisplayFlipped] = useState(false);

  const isPushingRef = useRef(false);

  const [flashSide, setFlashSide] = useState<"left" | "right" | null>(null);
  const [showSharedQr, setShowSharedQr] = useState(false);
  const [copyUrlDone, setCopyUrlDone] = useState(false);
  const copyUrlDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageOrigin, setPageOrigin] = useState("");
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = history[history.length - 1]!;

  const leftPointerConsumed = useRef(false);
  const rightPointerConsumed = useRef(false);

  const aOnLeft = teamAOnPhysicalLeft(displayFlipped);

  const leftScore = aOnLeft ? current.score_a : current.score_b;
  const rightScore = aOnLeft ? current.score_b : current.score_a;
  const leftTeamLabel = aOnLeft ? team_a_name : team_b_name;
  const rightTeamLabel = aOnLeft ? team_b_name : team_a_name;

  const winnerTeam = useMemo<"a" | "b" | null>(() => {
    return getMatchWinnerTeam(
      current.score_a,
      current.score_b,
      effectiveConfig.targetScore,
      effectiveConfig.juiceEnabled
    );
  }, [current.score_a, current.score_b, effectiveConfig.juiceEnabled, effectiveConfig.targetScore]);

  const winner = useMemo(() => {
    if (!winnerTeam) return null;
    if (winnerTeam === "a") return aOnLeft ? "left" : "right";
    return aOnLeft ? "right" : "left";
  }, [winnerTeam, aOnLeft]);

  /** 物理左にサーブがあるか（serve_team と表示向きから導出） */
  const serveIsPhysicalLeft = useMemo(() => {
    if (!effectiveConfig.serveEnabled) return false;
    if (current.serve_team === "A") return aOnLeft;
    return !aOnLeft;
  }, [aOnLeft, current.serve_team, effectiveConfig.serveEnabled]);

  useEffect(() => {
    const client = supabase;
    if (!hasSupabaseEnv || !client) return;

    let cancelled = false;

    const initMatch = async () => {
      if (!matchId) {
        const names = loadAppSettings();
        const { data, error } = await client
          .from("score_matches")
          .insert({
            team_a_name: names.teamLeftName,
            team_b_name: names.teamRightName,
            score_a: 0,
            score_b: 0,
            serve_team: "A",
            court_display_flipped: false,
          })
          .select("id")
          .single();

        if (cancelled) return;
        if (error || !data?.id) {
          console.error("score_matches insert failed:", error?.message ?? "unknown error");
          setIsMatchReady(true);
          return;
        }

        setActiveMatchId(String(data.id));
        setIsMatchReady(true);
        const params = new URLSearchParams(searchKey);
        params.set("id", String(data.id));
        router.replace(`/match?${params.toString()}`);
        return;
      }

      const { data, error } = await client.from("score_matches").select("*").eq("id", matchId).single();

      if (cancelled) return;
      if (!error && data) {
        const row = data as ScoreRow;
        setHistory([rowToScoreHistory(row)]);
        setTeam_a_name(row.team_a_name || DEFAULT_APP_SETTINGS.teamLeftName);
        setTeam_b_name(row.team_b_name || DEFAULT_APP_SETTINGS.teamRightName);
        setDisplayFlipped(Boolean(row.court_display_flipped));
      }
      setActiveMatchId(matchId);
      setIsMatchReady(true);
    };

    void initMatch();
    return () => {
      cancelled = true;
    };
  }, [matchId, router, searchKey]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      if (matchId) return;
      const settings = loadAppSettings();
      setTeam_a_name(settings.teamLeftName);
      setTeam_b_name(settings.teamRightName);

      const sp = new URLSearchParams(searchKey);
      if (hasExplicitMatchQuery(sp)) return;
      setStoredMatchConfig(loadMatchSettings());
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [matchId, searchKey]);

  /** TAP 後のスコア＋サーブを1回の UPDATE で同期（サーブあり時は side-out ルールで serve が変わり得る） */
  const pushPlayStateFromRow = useCallback(
    async (row: ScoreHistoryRow) => {
      const client = supabase;
      if (!hasSupabaseEnv || !client || !activeMatchId) return;

      isPushingRef.current = true;
      try {
        const payload = effectiveConfig.serveEnabled
          ? {
              score_a: row.score_a,
              score_b: row.score_b,
              serve_team: row.serve_team,
            }
          : { score_a: row.score_a, score_b: row.score_b };

        const { error } = await client
          .from("score_matches")
          .update(payload)
          .eq("id", activeMatchId);

        if (error) {
          console.error("[tap] play state update FAILED:", error.message);
        } else {
          console.log("[tap] play state update OK:", payload);
        }
      } finally {
        isPushingRef.current = false;
      }
    },
    [activeMatchId, effectiveConfig.serveEnabled]
  );

  const pushCourtDisplayFlippedOnly = useCallback(async (court_display_flipped: boolean) => {
    const client = supabase;
    if (!hasSupabaseEnv || !client || !activeMatchId) return;

    isPushingRef.current = true;
    try {
      const { error } = await client
        .from("score_matches")
        .update({ court_display_flipped })
        .eq("id", activeMatchId);

      if (error) {
        console.error("[court] court_display_flipped update FAILED:", error.message);
      } else {
        console.log("[court] court_display_flipped update OK:", { court_display_flipped });
      }
    } finally {
      isPushingRef.current = false;
    }
  }, [activeMatchId]);

  const pushServeTeamOnly = useCallback(
    async (serve_team: "A" | "B") => {
      const client = supabase;
      if (!hasSupabaseEnv || !client || !activeMatchId || !effectiveConfig.serveEnabled) return;

      isPushingRef.current = true;
      try {
        const { error } = await client
          .from("score_matches")
          .update({ serve_team })
          .eq("id", activeMatchId);

        if (error) {
          console.error("[serve] serve_team update FAILED:", error.message);
        } else {
          console.log("[serve] serve_team update OK:", { serve_team });
        }
      } finally {
        isPushingRef.current = false;
      }
    },
    [activeMatchId, effectiveConfig.serveEnabled]
  );

  const pushFullRow = useCallback(
    async (
      row: ScoreHistoryRow & { team_a_name: string; team_b_name: string },
      opts?: { courtDisplayFlipped?: boolean },
    ) => {
      const client = supabase;
      if (!hasSupabaseEnv || !client || !activeMatchId) return;

      const base = {
        team_a_name: row.team_a_name,
        team_b_name: row.team_b_name,
        score_a: row.score_a,
        score_b: row.score_b,
      };
      const payload =
        effectiveConfig.serveEnabled
          ? { ...base, serve_team: row.serve_team }
          : base;
      const withCourt =
        opts && "courtDisplayFlipped" in opts
          ? { ...payload, court_display_flipped: opts.courtDisplayFlipped }
          : payload;

      isPushingRef.current = true;
      try {
        const { error } = await client.from("score_matches").update(withCourt).eq("id", activeMatchId);
        if (error) {
          console.error("[sync] full row update FAILED:", error.message);
        } else {
          console.log("[sync] full row update OK:", withCourt);
        }
      } finally {
        isPushingRef.current = false;
      }
    },
    [activeMatchId, effectiveConfig.serveEnabled]
  );

  useEffect(() => {
    const client = supabase;
    if (!hasSupabaseEnv || !client || !activeMatchId || !isReadonly) return;

    const channel = client
      .channel(`score_matches:${activeMatchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "score_matches",
          filter: `id=eq.${activeMatchId}`,
        },
        (payload) => {
          if (isPushingRef.current) return;
          const row = payload.new as ScoreRow;
          setTeam_a_name(row.team_a_name || DEFAULT_APP_SETTINGS.teamLeftName);
          setTeam_b_name(row.team_b_name || DEFAULT_APP_SETTINGS.teamRightName);
          setDisplayFlipped(Boolean(row.court_display_flipped));
          const incoming = rowToScoreHistory(row);
          const now = historyRef.current[historyRef.current.length - 1]!;
          if (!isSameScoreHistory(incoming, now)) {
            setHistory([incoming]);
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [activeMatchId, isReadonly]);

  /**
   * TAP: サーブなし → タップした側のチームに +1 のみ。
   * サーブあり → サイドアウト（サーブ側のラリーで +1、レシーブ側のラリーは得点なしでサーブ移転）。
   */
  const addPoint = useCallback(
    (physicalSide: "left" | "right") => {
      if (isReadonly) return;
      if (winnerTeam) return;
      resumeWebAudioFromUserGesture();

      const prefs = loadAppSettings();
      const last = historyRef.current[historyRef.current.length - 1]!;

      let next: ScoreHistoryRow;

      if (!effectiveConfig.serveEnabled) {
        const incA =
          (physicalSide === "left" && aOnLeft) || (physicalSide === "right" && !aOnLeft);
        next = {
          score_a: incA ? last.score_a + 1 : last.score_a,
          score_b: incA ? last.score_b : last.score_b + 1,
          serve_team: last.serve_team,
        };
        console.log("[tap] add score only (no serve mode)", {
          physical_side: physicalSide,
          increment_team: incA ? "A (score_a)" : "B (score_b)",
          score_a_before: last.score_a,
          score_b_before: last.score_b,
          score_a_after: next.score_a,
          score_b_after: next.score_b,
        });
      } else {
        const lastSnap: GameSnapshot = {
          left: aOnLeft ? last.score_a : last.score_b,
          right: aOnLeft ? last.score_b : last.score_a,
          serveLeft: serveIsPhysicalLeft,
        };
        const snap = computeNextSnapshot(lastSnap, physicalSide, effectiveConfig);
        next = {
          score_a: aOnLeft ? snap.left : snap.right,
          score_b: aOnLeft ? snap.right : snap.left,
          serve_team: physicalServeLeftToServeTeam(snap.serveLeft, aOnLeft),
        };
        console.log("[tap] side-out step", {
          physical_side: physicalSide,
          score_a_before: last.score_a,
          score_b_before: last.score_b,
          score_a_after: next.score_a,
          score_b_after: next.score_b,
          serve_team_before: last.serve_team,
          serve_team_after: next.serve_team,
        });
      }

      const stateChanged =
        next.score_a !== last.score_a ||
        next.score_b !== last.score_b ||
        next.serve_team !== last.serve_team;
      if (!stateChanged) return;

      const winsNow =
        getMatchWinnerTeam(
          next.score_a,
          next.score_b,
          effectiveConfig.targetScore,
          effectiveConfig.juiceEnabled
        ) !== null;

      if (prefs.vibrationEnabled) vibrateImpact(50);
      if (prefs.soundEnabled) {
        if (winsNow) playVictoryChime();
        else playTapPing();
      }

      setFlashSide(physicalSide);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setFlashSide(null), FLASH_MS);

      setHistory((h) => [...h, next]);
      void pushPlayStateFromRow(next);
    },
    [
      aOnLeft,
      effectiveConfig,
      isReadonly,
      pushPlayStateFromRow,
      serveIsPhysicalLeft,
      winnerTeam,
    ]
  );

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const undo = useCallback(() => {
    if (isReadonly) return;
    const prev = historyRef.current;
    if (prev.length <= 1) return;
    const nextHist = prev.slice(0, -1);
    const latest = nextHist[nextHist.length - 1]!;
    setHistory(nextHist);
    void pushFullRow({
      ...latest,
      team_a_name,
      team_b_name,
    });
  }, [isReadonly, pushFullRow, team_a_name, team_b_name]);

  const reset = useCallback(() => {
    if (isReadonly) return;
    const names = loadAppSettings();
    const next: ScoreHistoryRow = {
      score_a: 0,
      score_b: 0,
      serve_team: "A",
    };
    setTeam_a_name(names.teamLeftName);
    setTeam_b_name(names.teamRightName);
    setDisplayFlipped(false);
    setHistory([next]);
    void pushFullRow(
      {
        ...next,
        team_a_name: names.teamLeftName,
        team_b_name: names.teamRightName,
      },
      { courtDisplayFlipped: false },
    );
  }, [isReadonly, pushFullRow]);

  /** コートチェンジ: 表示の左右だけ反転。DB・serve_team には触れない。 */
  const courtDisplayFlip = useCallback(() => {
    if (isReadonly || winnerTeam) return;
    resumeWebAudioFromUserGesture();
    if (loadAppSettings().vibrationEnabled) vibrateUi();
    setDisplayFlipped((f) => {
      const next = !f;
      void pushCourtDisplayFlippedOnly(next);
      return next;
    });
  }, [isReadonly, pushCourtDisplayFlippedOnly, winnerTeam]);

  /** サーブ権: A↔B のみ。点数・チーム名はそのまま。 */
  const toggleServeTeam = useCallback(() => {
    if (isReadonly || winnerTeam || !effectiveConfig.serveEnabled) return;
    resumeWebAudioFromUserGesture();
    if (loadAppSettings().vibrationEnabled) vibrateUi();

    const last = historyRef.current[historyRef.current.length - 1]!;
    const nextServe: "A" | "B" = last.serve_team === "A" ? "B" : "A";
    const next: ScoreHistoryRow = {
      score_a: last.score_a,
      score_b: last.score_b,
      serve_team: nextServe,
    };

    console.log("[serve] manual toggle only", {
      serve_team_before: last.serve_team,
      serve_team_after: nextServe,
      score_a_unchanged: next.score_a,
      score_b_unchanged: next.score_b,
    });

    setHistory((h) => [...h, next]);
    void pushServeTeamOnly(nextServe);
  }, [effectiveConfig.serveEnabled, isReadonly, pushServeTeamOnly, winnerTeam]);

  const undoPointerConsumed = useRef(false);
  const resetPointerConsumed = useRef(false);
  const courtPointerConsumed = useRef(false);

  const playDisabled = !!winnerTeam || isReadonly;

  const leftBg =
    flashSide === "left"
      ? "bg-[#D7FF5B]/22 transition-colors duration-100 "
      : "bg-transparent transition-colors duration-100 ";

  const rightBg =
    flashSide === "right"
      ? "bg-[#D7FF5B]/22 transition-colors duration-100 "
      : "bg-transparent transition-colors duration-100 ";

  const spectatorShareUrl = useMemo(() => {
    if (!pageOrigin || !activeMatchId) return "";
    const params = new URLSearchParams();
    params.set("id", activeMatchId);
    params.set("mode", "view");
    params.set("target", String(effectiveConfig.targetScore));
    params.set("serve", effectiveConfig.serveEnabled ? "1" : "0");
    params.set("juice", effectiveConfig.juiceEnabled ? "1" : "0");
    return `${pageOrigin}/match?${params.toString()}`;
  }, [activeMatchId, effectiveConfig.serveEnabled, effectiveConfig.juiceEnabled, effectiveConfig.targetScore, pageOrigin]);

  const lineShareSpectatorHref = useMemo(() => {
    if (!spectatorShareUrl) return "";
    return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(spectatorShareUrl)}`;
  }, [spectatorShareUrl]);

  const copySpectatorUrlToClipboard = useCallback(() => {
    if (!spectatorShareUrl) return;
    const onSuccess = () => {
      setCopyUrlDone(true);
      if (copyUrlDoneTimerRef.current) clearTimeout(copyUrlDoneTimerRef.current);
      copyUrlDoneTimerRef.current = setTimeout(() => {
        setCopyUrlDone(false);
        copyUrlDoneTimerRef.current = null;
      }, 2000);
      if (loadAppSettings().vibrationEnabled) vibrateUi();
    };

    void (async () => {
      try {
        await navigator.clipboard.writeText(spectatorShareUrl);
        onSuccess();
        return;
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = spectatorShareUrl;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          onSuccess();
        } catch {
          /* 非セキュア環境など */
        }
      }
    })();
  }, [spectatorShareUrl]);

  useEffect(() => {
    return () => {
      if (copyUrlDoneTimerRef.current) clearTimeout(copyUrlDoneTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setPageOrigin(window.location.origin);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  if (!isMatchReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-foreground/50">
        読み込み中…
      </div>
    );
  }

  if (isReadonly) {
    return (
      <div className="match-play-root flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-background">
        {!effectiveConfig.serveEnabled ? (
          <div className="flex shrink-0 items-center border-b border-foreground/10 px-3 py-2.5 pt-[max(0.4rem,env(safe-area-inset-top))]">
            <p className="w-full text-center text-[11px] leading-snug text-foreground/55">
              {t("match.spectatorBanner")} · {t("match.spectatorSubtext")}
            </p>
          </div>
        ) : (
          <div className="flex shrink-0 items-center border-b border-foreground/10 px-2 py-2 pt-[max(0.35rem,env(safe-area-inset-top))]">
            <div className="flex min-h-10 min-w-0 flex-1 basis-0 items-center pe-2">
              <p className="line-clamp-2 text-[10px] leading-snug text-foreground/55 sm:text-[11px]">
                {t("match.spectatorBanner")} · {t("match.spectatorSubtext")}
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-center px-1">
              <ServeIndicator side={serveIsPhysicalLeft ? "left" : "right"} size="toolbar" />
            </div>
            <div className="min-h-10 min-w-0 flex-1 basis-0" aria-hidden />
          </div>
        )}

        {winnerTeam ? (
          <div
            className="shrink-0 border-b border-[#D7FF5B]/35 bg-[#D7FF5B]/12 px-3 py-3 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="block font-black text-[clamp(1.75rem,min(11vw,2.5rem),2.75rem)] leading-none tracking-[0.3em] text-[#D7FF5B]">
              {t("match.winSticker")}
            </span>
            <span className="mt-1 block max-w-full truncate text-xs font-semibold text-foreground/80 sm:text-sm">
              {(winner === "left" ? leftTeamLabel : rightTeamLabel)}
            </span>
          </div>
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden px-2">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto border-r border-[#f2f6ff]/12">
            <div className="flex shrink-0 flex-col items-center pt-[max(0.25rem,min(3dvh,1rem))]">
              {effectiveConfig.serveEnabled && serveIsPhysicalLeft ? (
                <span className="pointer-events-none mb-2 rounded-full border border-[#D7FF5B]/80 bg-[#D7FF5B]/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#D7FF5B]">
                  SERVICE
                </span>
              ) : effectiveConfig.serveEnabled ? (
                <span className="mb-2 min-h-[1.75rem] shrink-0" aria-hidden />
              ) : null}
            </div>
            <PlayColumnBody
              teamName={leftTeamLabel}
              score={leftScore}
              winSticker={winner === "left"}
              spectatorWinLarge
              t={t}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="flex shrink-0 flex-col items-center pt-[max(0.25rem,min(3dvh,1rem))]">
              {effectiveConfig.serveEnabled && !serveIsPhysicalLeft ? (
                <span className="pointer-events-none mb-2 rounded-full border border-[#D7FF5B]/80 bg-[#D7FF5B]/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#D7FF5B]">
                  SERVICE
                </span>
              ) : effectiveConfig.serveEnabled ? (
                <span className="mb-2 min-h-[1.75rem] shrink-0" aria-hidden />
              ) : null}
            </div>
            <PlayColumnBody
              teamName={rightTeamLabel}
              score={rightScore}
              winSticker={winner === "right"}
              spectatorWinLarge
              t={t}
            />
          </div>
        </div>
      </div>
    );
  }

  const leftColShell =
    "relative z-10 flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden border-r border-[#f2f6ff]/12 [-webkit-tap-highlight-color:transparent] ";

  const leftTapClasses =
    "flex min-h-0 min-w-0 flex-1 flex-col cursor-pointer overflow-hidden " +
    leftBg +
    (playDisabled ? "pointer-events-none opacity-70 " : "touch-manipulation ");

  const rightColShell =
    "relative z-10 flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden [-webkit-tap-highlight-color:transparent] ";

  const rightTapClasses =
    "flex min-h-0 min-w-0 flex-1 flex-col cursor-pointer overflow-hidden " +
    rightBg +
    (playDisabled ? "pointer-events-none opacity-70 " : "touch-manipulation ");

  return (
    <div className="match-play-root flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-none bg-background">
      <header className="flex shrink-0 items-center gap-1 border-b border-foreground/10 px-2 pb-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex min-h-10 min-w-0 flex-1 basis-0 flex-col items-start justify-center ps-1">
          <span className="text-[10px] uppercase leading-none tracking-wide text-foreground/50 sm:text-[11px]">
            {t("match.metaLabel")}
          </span>
          <span className="mt-1 text-[11px] font-medium tabular-nums text-foreground/80">
            {t("match.winTo")} {effectiveConfig.targetScore}
          </span>
        </div>

        {effectiveConfig.serveEnabled ? (
          <button
            type="button"
            className="flex shrink-0 items-center justify-center rounded-lg border border-transparent px-0.5 [-webkit-tap-highlight-color:transparent] hover:border-foreground/20"
            aria-label="Toggle serve A/B"
            disabled={!!winnerTeam}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              toggleServeTeam();
            }}
          >
            <ServeIndicator side={serveIsPhysicalLeft ? "left" : "right"} size="toolbar" />
          </button>
        ) : null}

        <div
          className={`flex min-h-10 items-center justify-end pe-1 ${
            effectiveConfig.serveEnabled ? "min-w-0 flex-1 basis-0" : "shrink-0"
          }`}
        >
          <button
            type="button"
            aria-label="Share spectator QR"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resumeWebAudioFromUserGesture();
              if (loadAppSettings().vibrationEnabled) vibrateUi();
            }}
            onClick={() => setShowSharedQr((v) => !v)}
            className="inline-flex h-12 min-h-[48px] min-w-[48px] shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-[#c4c9d4] transition-opacity [-webkit-tap-highlight-color:transparent] hover:text-[#dde1e9] hover:opacity-95 active:opacity-80"
          >
            <QrCode className="h-7 w-7 shrink-0 pointer-events-none" strokeWidth={2} aria-hidden />
          </button>
          <SettingsGearLink />
        </div>
      </header>

      {showSharedQr ? (
        <section className="mx-3 mt-2 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-3">
          <p className="text-center text-xs text-foreground/60">{t("match.qrPanelCaption")}</p>
          <div className="mt-2 flex justify-center rounded-lg bg-white p-3">
            {spectatorShareUrl ? <QRCodeSVG value={spectatorShareUrl} size={150} level="M" /> : null}
          </div>
          <div className="mt-3 flex min-w-0 flex-row gap-2">
            <button
              type="button"
              disabled={!spectatorShareUrl}
              aria-label={t("match.copySpectatorUrl")}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                resumeWebAudioFromUserGesture();
                if (loadAppSettings().vibrationEnabled) vibrateUi();
              }}
              onClick={() => copySpectatorUrlToClipboard()}
              className="inline-flex min-h-[48px] min-w-0 flex-1 touch-manipulation cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-foreground/20 bg-foreground/[0.06] px-2 py-3 text-xs font-medium text-foreground [-webkit-tap-highlight-color:transparent] transition-colors hover:border-foreground/35 hover:bg-foreground/[0.09] disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Copy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 truncate">
                {copyUrlDone ? t("match.urlCopied") : t("match.copySpectatorUrl")}
              </span>
            </button>
            {spectatorShareUrl && lineShareSpectatorHref ? (
              <a
                href={lineShareSpectatorHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("match.shareOnLine")}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  resumeWebAudioFromUserGesture();
                  if (loadAppSettings().vibrationEnabled) vibrateUi();
                }}
                className="inline-flex min-h-[48px] min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-[#06C755] bg-[#06C755]/12 px-2 py-3 text-xs font-semibold text-[#06C755] no-underline [-webkit-tap-highlight-color:transparent] transition-colors hover:bg-[#06C755]/20 active:opacity-90 sm:gap-2 sm:px-3 sm:text-sm"
              >
                <span className="min-w-0 truncate">{t("match.shareOnLine")}</span>
              </a>
            ) : (
              <span className="inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-lg border border-foreground/10 px-2 py-3 text-xs font-medium text-foreground/35 sm:px-3 sm:text-sm">
                <span className="min-w-0 truncate">{t("match.shareOnLine")}</span>
              </span>
            )}
          </div>
        </section>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 select-none flex-row overflow-hidden [-webkit-user-select:none] [user-select:none]">
        <div className={leftColShell}>
          {effectiveConfig.serveEnabled ? (
            <div
              className={serveTopFrameClass(serveIsPhysicalLeft, true)}
            >
              {serveIsPhysicalLeft ? (
                <span
                  className="pointer-events-none mx-auto rounded-full border border-[#D7FF5B]/80 bg-[#D7FF5B]/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#D7FF5B]"
                  aria-hidden
                >
                  SERVICE
                </span>
              ) : (
                <span className="pointer-events-none mx-auto h-5 w-px opacity-0" aria-hidden />
              )}
            </div>
          ) : null}
          <button
            type="button"
            disabled={playDisabled}
            aria-label={t("match.ariaAddLeft")}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (playDisabled) return;
              leftPointerConsumed.current = true;
              addPoint("left");
            }}
            onClick={(e) => {
              if (playDisabled) return;
              if (leftPointerConsumed.current) {
                leftPointerConsumed.current = false;
                e.preventDefault();
                return;
              }
              addPoint("left");
            }}
            className={leftTapClasses}
          >
            <PlayColumnBody
              teamName={leftTeamLabel}
              score={leftScore}
              winSticker={winner === "left"}
              t={t}
            />
          </button>
          <div className="flex h-11 shrink-0 items-center justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
            <span className="pointer-events-none text-[10px] tracking-wide text-[#98a2b3] sm:text-xs">
              {t("match.tapHint")}
            </span>
          </div>
        </div>

        <div className={rightColShell}>
          {effectiveConfig.serveEnabled ? (
            <div
              className={serveTopFrameClass(!serveIsPhysicalLeft, true)}
            >
              {!serveIsPhysicalLeft ? (
                <span
                  className="pointer-events-none mx-auto rounded-full border border-[#D7FF5B]/80 bg-[#D7FF5B]/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#D7FF5B]"
                  aria-hidden
                >
                  SERVICE
                </span>
              ) : (
                <span className="pointer-events-none mx-auto h-5 w-px opacity-0" aria-hidden />
              )}
            </div>
          ) : null}
          <button
            type="button"
            disabled={playDisabled}
            aria-label={t("match.ariaAddRight")}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (playDisabled) return;
              rightPointerConsumed.current = true;
              addPoint("right");
            }}
            onClick={(e) => {
              if (playDisabled) return;
              if (rightPointerConsumed.current) {
                rightPointerConsumed.current = false;
                e.preventDefault();
                return;
              }
              addPoint("right");
            }}
            className={rightTapClasses}
          >
            <PlayColumnBody
              teamName={rightTeamLabel}
              score={rightScore}
              winSticker={winner === "right"}
              t={t}
            />
          </button>
          <div className="flex h-11 shrink-0 items-center justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
            <span className="pointer-events-none text-[10px] tracking-wide text-[#98a2b3] sm:text-xs">
              {t("match.tapHint")}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!!winnerTeam}
        title={t("match.courtChange")}
        aria-label={t("match.courtChange")}
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          if (winnerTeam) return;
          resumeWebAudioFromUserGesture();
          courtPointerConsumed.current = true;
          courtDisplayFlip();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (courtPointerConsumed.current) {
            courtPointerConsumed.current = false;
            e.preventDefault();
            return;
          }
          courtDisplayFlip();
        }}
        className="pointer-events-auto fixed start-3 z-30 touch-manipulation rounded-lg border border-foreground/20 bg-background/85 p-2 text-foreground/65 shadow-sm backdrop-blur-sm transition-colors [-webkit-tap-highlight-color:transparent] hover:border-foreground/35 hover:text-foreground/90 disabled:pointer-events-none disabled:opacity-30"
        style={{
          bottom: "max(6.85rem, calc(env(safe-area-inset-bottom, 0px) + 5.35rem))",
        }}
      >
        <ArrowLeftRight className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
      </button>

      <footer className="shrink-0 select-none border-t border-foreground/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-user-select:none] [user-select:none]">
        <div className="mx-auto flex max-w-md gap-2">
          <button
            type="button"
            disabled={!effectiveConfig.serveEnabled || !!winnerTeam}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resumeWebAudioFromUserGesture();
              if (loadAppSettings().vibrationEnabled) vibrateUi();
              toggleServeTeam();
            }}
            className="shrink-0 touch-manipulation rounded-lg border border-foreground/15 px-3 py-4 text-xs font-medium leading-tight [-webkit-tap-highlight-color:transparent] hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-40 min-h-[52px] sm:min-h-[54px]"
          >
            Serve A/B
          </button>
          <button
            type="button"
            disabled={history.length <= 1}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resumeWebAudioFromUserGesture();
              if (history.length <= 1) return;
              if (loadAppSettings().vibrationEnabled) vibrateUi();
              undoPointerConsumed.current = true;
              undo();
            }}
            onClick={(e) => {
              if (history.length <= 1) return;
              if (undoPointerConsumed.current) {
                undoPointerConsumed.current = false;
                e.preventDefault();
                return;
              }
              undo();
            }}
            className="flex-1 touch-manipulation cursor-pointer rounded-lg border border-foreground/15 py-4 text-base font-medium leading-tight [-webkit-tap-highlight-color:transparent] hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-40 min-h-[52px] sm:min-h-[54px]"
          >
            {t("match.undo")}
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              resumeWebAudioFromUserGesture();
              if (loadAppSettings().vibrationEnabled) vibrateUi();
              resetPointerConsumed.current = true;
              reset();
            }}
            onClick={(e) => {
              if (resetPointerConsumed.current) {
                resetPointerConsumed.current = false;
                e.preventDefault();
                return;
              }
              reset();
            }}
            className="flex-1 touch-manipulation cursor-pointer rounded-lg bg-foreground/10 py-4 text-base font-medium leading-tight [-webkit-tap-highlight-color:transparent] hover:bg-foreground/15 min-h-[52px] sm:min-h-[54px]"
          >
            {t("match.reset")}
          </button>
        </div>
      </footer>
    </div>
  );
}

function PlayColumnBody({
  teamName,
  score,
  winSticker,
  spectatorWinLarge = false,
  t,
}: {
  teamName: string;
  score: number;
  winSticker: boolean;
  /** 観客端末で WIN を太く確実に見せる（審判画面では未使用） */
  spectatorWinLarge?: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-2 py-2">
      <span className="pointer-events-none mb-2 block max-w-full truncate px-1 text-center text-[clamp(1.15rem,4.6vw,1.7rem)] font-bold leading-tight tracking-tight text-[#dbe4f2] sm:text-[clamp(1.2rem,4vw,1.85rem)]">
        {teamName}
      </span>
      <span className="score-font pointer-events-none block max-w-full text-center text-[clamp(2.5rem,min(26vw,min(40dvh,18rem)),5rem)] font-bold tabular-nums leading-none tracking-tight text-[#f2f6ff] sm:text-[clamp(2.85rem,min(23vw,min(42dvh,18rem)),5.5rem)]">
        {score}
      </span>
      <div
        className={`flex shrink-0 flex-col items-center justify-center ${spectatorWinLarge ? "mt-2 min-h-[2.75rem] sm:min-h-[3.25rem]" : "min-h-[2rem] sm:min-h-[2.5rem]"}`}
      >
        {winSticker ? (
          <span
            className={`pointer-events-none font-black leading-none tracking-[0.25em] text-[#D7FF5B] ${
              spectatorWinLarge ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
            }`}
            aria-hidden
          >
            {t("match.winSticker")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
