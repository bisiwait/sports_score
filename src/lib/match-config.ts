export type MatchConfig = {
  targetScore: number;
  serveEnabled: boolean;
  /** ジュースあり: 先取点−1で両方が同点帯に入ったあとは2点差がつくまで続行 */
  juiceEnabled: boolean;
};

export const DEFAULT_CONFIG: MatchConfig = {
  targetScore: 21,
  serveEnabled: true,
  juiceEnabled: false,
};

export function parseMatchConfigFromSearchParams(
  params: URLSearchParams
): MatchConfig {
  const t = params.get("target");
  const serve = params.get("serve");
  const juice = params.get("juice");

  let targetScore = DEFAULT_CONFIG.targetScore;
  if (t !== null) {
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      targetScore = n;
    }
  }

  let serveEnabled = DEFAULT_CONFIG.serveEnabled;
  if (serve === "0" || serve === "false") serveEnabled = false;
  if (serve === "1" || serve === "true") serveEnabled = true;

  let juiceEnabled = DEFAULT_CONFIG.juiceEnabled;
  if (juice === "1" || juice === "true") juiceEnabled = true;
  if (juice === "0" || juice === "false") juiceEnabled = false;

  return { targetScore, serveEnabled, juiceEnabled };
}

export function buildMatchHref(config: MatchConfig): string {
  const q = new URLSearchParams({
    target: String(config.targetScore),
    serve: config.serveEnabled ? "1" : "0",
    juice: config.juiceEnabled ? "1" : "0",
  });
  return `/match?${q.toString()}`;
}

/** 観客用（閲覧のみ）マッチ URL */
export function buildMatchReadonlyHref(config: MatchConfig): string {
  const q = new URLSearchParams({
    target: String(config.targetScore),
    serve: config.serveEnabled ? "1" : "0",
    juice: config.juiceEnabled ? "1" : "0",
    mode: "view",
  });
  return `/match?${q.toString()}`;
}

export function isReadonlyView(params: URLSearchParams): boolean {
  const mode = params.get("mode");
  if (mode === "view") return true;
  const v = params.get("view");
  return v === "readonly" || v === "spectator";
}

/** URL に試合用パラメータが明示されているか（無い場合は localStorage を参照する） */
export function hasExplicitMatchQuery(params: URLSearchParams): boolean {
  return params.has("target") || params.has("serve") || params.has("juice");
}
