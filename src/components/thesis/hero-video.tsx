"use client";

import React, { useEffect, useRef } from "react";

type HeroVideoProps = {
  src: string;
  playbackRate?: number;
};

export function HeroVideo({ src, playbackRate = 1 }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-cover"
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      data-playback-rate={playbackRate}
      onLoadedMetadata={(event) => {
        event.currentTarget.playbackRate = playbackRate;
      }}
    />
  );
}
