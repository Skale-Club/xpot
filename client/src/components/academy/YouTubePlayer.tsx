import { useEffect, useRef } from "react";

// Minimal wrapper over the YouTube IFrame Player API. It plays INSIDE our page through the privacy-enhanced host and
// never links out. It reports state changes and hands the caller a handle for position and duration.

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: { onReady: () => void; onStateChange: (e: { data: number }) => void; onError: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState values the tracker cares about. */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API unavailable"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface PlayerHandle {
  getCurrentTime(): number;
  getDuration(): number;
}

export function YouTubePlayer({
  videoId,
  onReady,
  onStateChange,
  onUnavailable,
}: {
  videoId: string;
  onReady: (handle: PlayerHandle) => void;
  onStateChange: (state: number) => void;
  onUnavailable?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The latest callbacks, without re-creating the player.
  const onReadyRef = useRef(onReady);
  const onStateRef = useRef(onStateChange);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onReadyRef.current = onReady;
    onStateRef.current = onStateChange;
    onUnavailableRef.current = onUnavailable;
  });

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    const mountEl = hostRef.current;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountEl) return;
        // The API replaces its target with an iframe: give it a fresh child.
        const target = document.createElement("div");
        mountEl.appendChild(target);
        player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: () => player && onReadyRef.current(player),
            onStateChange: (e) => onStateRef.current(e.data),
            onError: () => onUnavailableRef.current?.(),
          },
        });
      })
      .catch(() => onUnavailableRef.current?.());

    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        // already torn down
      }
      mountEl?.replaceChildren();
    };
  }, [videoId]);

  return <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />;
}
