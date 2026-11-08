import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  AUTO_COMPLETE_VIDEO_SHARE,
  canAutoComplete,
  HEARTBEAT_EVERY_MS,
  INTERACTION_WINDOW_MS,
  MAX_HEARTBEAT_SECONDS,
  mergeRanges,
  recordTick,
  watchedFraction,
  type AcademyTrackBody,
  type RecorderState,
  type WatchedRange,
} from "@shared/academy";
import { viewHeaders } from "@/lib/adminMode";
import { YT_STATE, type PlayerHandle } from "./YouTubePlayer";

// The lesson tracker. A heartbeat every 15 s ONLY while the tab is visible AND (the person touched the page in the
// last 60 s OR the video is playing), carrying the active seconds; the video's watched RANGES from real playback ticks
// (seeking records nothing); the deepest scroll of the lesson body; and the discrete events. The server clamps and
// re-checks all of it. Tracking is best effort: it never shows an error.

const TICK_MS = 1_000;

type Extra = Partial<Omit<AcademyTrackBody, "courseId">>;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function useLessonTracker(opts: {
  courseId: string;
  lessonId: string;
  hasVideo: boolean;
  bodyRef: RefObject<HTMLElement | null>;
  initialCompleted: boolean;
  initialRanges: WatchedRange[];
  initialDuration: number | null;
  /** Active seconds already stored for this lesson (cumulative across visits). */
  initialActiveSeconds: number;
  /** Expected reading seconds: the text-only auto-complete threshold is max(15, half of this). */
  expectedReadingSeconds: number;
  onCompletedChange?: (completed: boolean) => void;
}) {
  const { courseId, lessonId, hasVideo, bodyRef, expectedReadingSeconds } = opts;
  const [completed, setCompleted] = useState(opts.initialCompleted);

  const completedRef = useRef(opts.initialCompleted);
  const activeMsRef = useRef(0);
  const totalActiveMsRef = useRef(opts.initialActiveSeconds * 1000);
  const lastInteractionRef = useRef(Date.now());
  const playingRef = useRef(false);
  const playerRef = useRef<PlayerHandle | null>(null);
  const recorderRef = useRef<RecorderState>({ last: null, ranges: mergeRanges(opts.initialRanges) });
  const durationRef = useRef<number | null>(opts.initialDuration);
  const maxScrollRef = useRef(0);
  const dirtyRef = useRef(false);
  const openedRef = useRef(false);
  const playedRef = useRef(false);
  const onChangeRef = useRef(opts.onCompletedChange);
  useEffect(() => { onChangeRef.current = opts.onCompletedChange; });

  const send = useCallback(
    (body: AcademyTrackBody, keepalive = false) =>
      fetch(`/api/xpot/academy/lessons/${encodeURIComponent(lessonId)}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...viewHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
        keepalive,
      }).catch(() => undefined),
    [lessonId],
  );

  const emit = useCallback(
    (extra: Extra = {}, keepalive = false, force = false) => {
      const delta = Math.min(MAX_HEARTBEAT_SECONDS, Math.round(activeMsRef.current / 1000));
      if (!force && delta <= 0 && !dirtyRef.current) return Promise.resolve();
      // The remainder (sub-second, or beyond the cap) goes with the next send.
      activeMsRef.current = Math.max(0, activeMsRef.current - delta * 1000);
      dirtyRef.current = false;
      const body: AcademyTrackBody = {
        courseId,
        activeSeconds: delta,
        maxScrollPct: Math.round(maxScrollRef.current),
        ...(hasVideo
          ? { videoRanges: recorderRef.current.ranges as Array<[number, number]>, ...(durationRef.current ? { videoDurationSeconds: Math.round(durationRef.current) } : {}) }
          : {}),
        ...extra,
      };
      return send(body, keepalive);
    },
    [courseId, hasVideo, send],
  );

  const flush = useCallback((keepalive = false) => void emit({}, keepalive), [emit]);

  const complete = useCallback(
    (source: "manual" | "auto") => {
      if (completedRef.current) return;
      completedRef.current = true;
      setCompleted(true);
      onChangeRef.current?.(true);
      void emit({ event: "lesson_complete", payload: { auto: source === "auto" } }, false, true);
    },
    [emit],
  );

  const reopen = useCallback(() => {
    if (!completedRef.current) return;
    completedRef.current = false;
    setCompleted(false);
    onChangeRef.current?.(false);
    void emit({ event: "lesson_reopen" }, false, true);
  }, [emit]);

  const maybeAutoComplete = useCallback(() => {
    if (completedRef.current) return;
    const ok = hasVideo
      ? watchedFraction(recorderRef.current.ranges, durationRef.current) >= AUTO_COMPLETE_VIDEO_SHARE
      : canAutoComplete({ hasVideo: false, maxScrollPct: maxScrollRef.current, activeSeconds: totalActiveMsRef.current / 1000, expectedReadingSeconds });
    if (ok) complete("auto");
  }, [complete, hasVideo, expectedReadingSeconds]);

  // lesson_open, once per mounted lesson.
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void emit({ event: "lesson_open" }, false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any input counts as "the person is here".
  useEffect(() => {
    const mark = () => { lastInteractionRef.current = Date.now(); };
    const names = ["pointerdown", "keydown", "touchstart", "wheel", "scroll", "mousemove"] as const;
    for (const n of names) window.addEventListener(n, mark, { passive: true, capture: true });
    return () => { for (const n of names) window.removeEventListener(n, mark, { capture: true }); };
  }, []);

  // One-second tick: active time and video playback.
  useEffect(() => {
    const id = window.setInterval(() => {
      const visible = document.visibilityState === "visible";
      if (visible && (Date.now() - lastInteractionRef.current < INTERACTION_WINDOW_MS || playingRef.current)) {
        activeMsRef.current += TICK_MS;
        totalActiveMsRef.current += TICK_MS;
      }
      // Text-only: the active time is usually the last condition met, so check on every tick.
      if (!hasVideo) maybeAutoComplete();
      if (hasVideo && playingRef.current && playerRef.current) {
        try {
          const before = recorderRef.current.ranges;
          recorderRef.current = recordTick(recorderRef.current, playerRef.current.getCurrentTime());
          if (recorderRef.current.ranges !== before) dirtyRef.current = true;
          const duration = playerRef.current.getDuration();
          if (duration > 0) durationRef.current = duration;
        } catch {
          // player gone
        }
        maybeAutoComplete();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [hasVideo, maybeAutoComplete]);

  // The heartbeat.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" && !playingRef.current) return;
      flush();
    }, HEARTBEAT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [flush]);

  // Flush when the tab is hidden, the page is left or the lesson unmounts.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, [flush]);

  // Deepest scroll of the lesson body.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const scroller = scrollParent(body);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = body.getBoundingClientRect();
      if (rect.height <= 0) return;
      const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
      const seen = Math.min(rect.height, Math.max(0, bottom - rect.top));
      const pct = (seen / rect.height) * 100;
      if (pct > maxScrollRef.current) {
        maxScrollRef.current = pct;
        dirtyRef.current = true;
        if (!hasVideo) maybeAutoComplete();
      }
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(measure); };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [bodyRef, hasVideo, maybeAutoComplete]);

  const onPlayerReady = useCallback((handle: PlayerHandle) => {
    playerRef.current = handle;
    try {
      const d = handle.getDuration();
      if (d > 0) durationRef.current = d;
    } catch {
      // not ready yet
    }
  }, []);

  const onPlayerState = useCallback(
    (state: number) => {
      const playing = state === YT_STATE.PLAYING;
      playingRef.current = playing;
      const handle = playerRef.current;
      if (playing) {
        // Start fresh so a seek made while paused is not counted.
        recorderRef.current = { ...recorderRef.current, last: null };
        try {
          const d = handle?.getDuration() ?? 0;
          if (d > 0) durationRef.current = d;
        } catch {
          // ignore
        }
        if (!playedRef.current) {
          playedRef.current = true;
          void emit({ event: "video_play" }, false, true);
        }
        return;
      }
      if (handle) {
        try {
          const before = recorderRef.current.ranges;
          recorderRef.current = recordTick(recorderRef.current, handle.getCurrentTime());
          if (recorderRef.current.ranges !== before) dirtyRef.current = true;
        } catch {
          // ignore
        }
      }
      if (state === YT_STATE.ENDED) {
        void emit({ event: "video_ended" }, false, true);
        maybeAutoComplete();
      } else if (state === YT_STATE.PAUSED) {
        flush();
        maybeAutoComplete();
      }
    },
    [emit, flush, maybeAutoComplete],
  );

  return { completed, complete, reopen, onPlayerReady, onPlayerState };
}
