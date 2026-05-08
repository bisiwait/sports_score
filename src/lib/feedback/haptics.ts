/**
 * Capacitive / game-style tap（加重・打点）
 * 「スマホが短く振動」：`navigator.vibrate(50)`
 */
export function vibrateImpact(ms = 50): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

/** UI ボタン・リンク向けの軽いフィードバック */
export function vibrateUi(ms = 14): void {
  vibrateImpact(ms);
}
