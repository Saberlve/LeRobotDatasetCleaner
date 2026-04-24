import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";

type TimeContextType = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  subscribe: (cb: (t: number) => void) => () => void;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  duration: number;
  setDuration: React.Dispatch<React.SetStateAction<number>>;
  playbackRate: PlaybackRate;
  setPlaybackRate: (rate: number) => void;
};

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export const useTime = () => {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTime must be used within a TimeProvider");
  return ctx;
};

const TIME_RENDER_THROTTLE_MS = 80;
const PLAYBACK_RATE_STORAGE_KEY = "lerobot.playbackRate";

export const PLAYBACK_RATE_OPTIONS = [0.5, 1, 1.5, 2, 3] as const;
export type PlaybackRate = (typeof PLAYBACK_RATE_OPTIONS)[number];

function normalizePlaybackRate(value: unknown): PlaybackRate {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return PLAYBACK_RATE_OPTIONS.find((rate) => rate === parsed) ?? 1;
}

function readStoredPlaybackRate(): PlaybackRate {
  if (typeof window === "undefined") return 1;

  try {
    return normalizePlaybackRate(
      window.localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY),
    );
  } catch {
    return 1;
  }
}

export const TimeProvider: React.FC<{
  children: React.ReactNode;
  duration: number;
}> = ({ children, duration: initialDuration }) => {
  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(
    readStoredPlaybackRate,
  );
  const listeners = useRef<Set<(t: number) => void>>(new Set());

  // Keep the authoritative time in a ref so subscribers and sync effects
  // always see the latest value without waiting for a React render cycle.
  const timeRef = useRef(0);
  const rafId = useRef<number | null>(null);
  const lastRenderTime = useRef(0);

  const updateTime = useCallback((t: number) => {
    timeRef.current = t;
    listeners.current.forEach((fn) => fn(t));

    // Throttle React state updates — during playback, timeupdate fires ~4×/sec
    // per video. Coalescing into rAF + a minimum interval avoids cascading
    // re-renders across PlaybackBar, charts, etc.
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const now = performance.now();
        if (now - lastRenderTime.current >= TIME_RENDER_THROTTLE_MS) {
          lastRenderTime.current = now;
          setCurrentTimeState(timeRef.current);
        }
      });
    }
  }, []);

  // Flush any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // When playback stops, flush the exact final time so the UI matches
  useEffect(() => {
    if (!isPlaying) {
      setCurrentTimeState(timeRef.current);
    }
  }, [isPlaying]);

  const subscribe = useCallback((cb: (t: number) => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const nextRate = normalizePlaybackRate(rate);
    setPlaybackRateState(nextRate);

    try {
      window.localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(nextRate));
    } catch {
      // Ignore storage failures; playback speed still updates for this session.
    }
  }, []);

  return (
    <TimeContext.Provider
      value={{
        currentTime,
        setCurrentTime: updateTime,
        subscribe,
        isPlaying,
        setIsPlaying,
        duration,
        setDuration,
        playbackRate,
        setPlaybackRate,
      }}
    >
      {children}
    </TimeContext.Provider>
  );
};
