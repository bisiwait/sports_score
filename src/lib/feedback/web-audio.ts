/**
 * Web Audio（オシレーターによる操作音・勝利音）
 * autoplay 制約回避のため、`resumeWebAudioFromUserGesture` は pointerdown 等から呼ぶ。
 */

let singleton: AudioContext | null = null;

function getNativeAudioContext(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function getWebAudioContext(): AudioContext | null {
  const Native = getNativeAudioContext();
  if (!Native) return null;
  if (!singleton) {
    try {
      singleton = new Native();
    } catch {
      return null;
    }
  }
  return singleton;
}

/**
 * ユーザー操作のスタック内で呼ぶ（設定画面・試合の pointerdown など）
 */
export function resumeWebAudioFromUserGesture(): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

function whenRunning(ctx: AudioContext, run: () => void): void {
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {
      /* noop */
    });
    return;
  }
  run();
}

/** 短い「ピッ」系のクリック音 */
export function playTapPing(): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  whenRunning(ctx, () => {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1760, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.08, t0 + 0.008);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.068);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.075);
  });
}

/** ベル〜歓声的な短い上昇アルペジオ */
export function playVictoryChime(): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  whenRunning(ctx, () => {
    const baseT = ctx.currentTime;
    const freqs = [392, 523.25, 659.25, 783.99, 1046.5];
    let step = 0;
    for (const f of freqs) {
      const t0 = baseT + step * 0.075;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.11, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 0.38);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
      step += 1;
    }
    const ringT = baseT + 0.34;
    const bell = ctx.createOscillator();
    const bg = ctx.createGain();
    bell.type = "sine";
    bell.frequency.setValueAtTime(1567.98, ringT);
    bg.gain.setValueAtTime(0.0001, ringT);
    bg.gain.linearRampToValueAtTime(0.06, ringT + 0.05);
    bg.gain.linearRampToValueAtTime(0.0001, ringT + 1.05);
    bell.connect(bg);
    bg.connect(ctx.destination);
    bell.start(ringT);
    bell.stop(ringT + 1.15);
  });
}
