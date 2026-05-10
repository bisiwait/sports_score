"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { APP_DESCRIPTION_I18N_SLIDES } from "@/lib/app-description-i18n";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { interpolate } from "@/lib/interpolate";

const AUTO_MS = 8_000;

type AppDescriptionCarouselProps = {
  className?: string;
  /** 見出し（設定画面用。省略時はラベルなし） */
  label?: string;
};

export function AppDescriptionCarousel({ className = "", label }: AppDescriptionCarouselProps) {
  const { t, lang } = useI18n();
  const slides = useMemo(
    () =>
      APP_DESCRIPTION_I18N_SLIDES.map((s) => ({
        id: s.id,
        heading: t(s.headingKey),
        body: t(s.bodyKey),
      })),
    [t, lang],
  );
  const n = slides.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewportPx, setViewportPx] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [lang]);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + n) % n);
    },
    [n],
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportPx(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (paused || n <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, n]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (dx < -48) go(1);
    else if (dx > 48) go(-1);
  };

  const offsetPx = viewportPx > 0 ? index * viewportPx : 0;
  const carouselAria = label ?? t("install.carousel.aria");

  return (
    <section
      className={`flex flex-col ${className}`}
      aria-roledescription="carousel"
      aria-label={carouselAria}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {label ? (
        <h2 className="mb-2 text-sm font-medium text-foreground/80">{label}</h2>
      ) : null}

      <div
        ref={viewportRef}
        className="relative w-full min-w-0 overflow-hidden rounded-xl border border-foreground/15 bg-foreground/[0.04]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out will-change-transform"
          style={{
            width: viewportPx > 0 ? `${viewportPx * n}px` : "100%",
            transform: viewportPx > 0 ? `translate3d(-${offsetPx}px, 0, 0)` : undefined,
          }}
        >
          {slides.map((s) => (
            <article
              key={s.id}
              className="shrink-0 px-4 py-4 sm:px-5 sm:py-5"
              style={{ width: viewportPx > 0 ? `${viewportPx}px` : "100%" }}
            >
              <h3 className="text-sm font-semibold leading-snug text-foreground">{s.heading}</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{s.body}</p>
            </article>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-foreground/10 px-2 py-2">
          <button
            type="button"
            onClick={() => go(-1)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-foreground/80 hover:bg-foreground/10"
            aria-label={t("install.carousel.prev")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 px-1">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-[#D7FF5B]" : "w-2 bg-foreground/25 hover:bg-foreground/40"
                }`}
                aria-label={interpolate(t("install.carousel.dotLabel"), {
                  current: i + 1,
                  total: n,
                })}
                aria-current={i === index ? "true" : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-foreground/80 hover:bg-foreground/10"
            aria-label={t("install.carousel.next")}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-foreground/45" aria-live="polite">
        {interpolate(t("install.carousel.counter"), { current: index + 1, total: n })}
        {paused ? t("install.carousel.paused") : ""}
      </p>
    </section>
  );
}
