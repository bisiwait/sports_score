/** localStorage: origin visible time（タブをまたいで積む。Chrome の閲覧ヒューリスティックの目安）。 */
const ENGAGEMENT_MS_KEY = "sports_score_origin_visible_ms";

/** localStorage: set on `appinstalled` (Chrome/Edge). */
const INSTALLED_FLAG_KEY = "sports_score_pwa_installed";

const CHROME_ENGAGEMENT_HINT_MS = 30_000;

export function getPwaEngagementMs(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    return Number(localStorage.getItem(ENGAGEMENT_MS_KEY) ?? "0");
  } catch {
    return 0;
  }
}

export function addPwaEngagementMs(delta: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next = getPwaEngagementMs() + delta;
    localStorage.setItem(ENGAGEMENT_MS_KEY, String(next));
  } catch {
    /* private mode etc. */
  }
}

export function getPersistedInstalledFlag(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(INSTALLED_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPersistedInstalledFlag(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INSTALLED_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function chromeEngagementHintMs(): number {
  return CHROME_ENGAGEMENT_HINT_MS;
}

/** PWA として起動しているか（ホーム画面から開いた体験）。 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
  return modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

export function isInstalledExperience(): boolean {
  return isStandaloneDisplay() || getPersistedInstalledFlag();
}
