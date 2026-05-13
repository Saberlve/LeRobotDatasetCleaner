import React from "react";

export function MathText({ text }: { text: string }) {
  if (!text) return null;

  // Split by common math symbols and VLA/VLM keywords
  const parts = text.split(
    /(\$N\$|\$t\$|\$\\tau\s+\\le\s+t\$|\$\\tau\$|\$\\le\$|H_t|m_t|o_t|a_t|φ|ℓ|π_θ|π-GCA|ℝ\^N|VLA|VLM|φ\(H_t\))/g,
  );

  return (
    <>
      {parts.map((part, i) => {
        if (part === "$N$")
          return (
            <span key={i} className="font-serif italic">
              N
            </span>
          );
        if (part === "$t$")
          return (
            <span key={i} className="font-serif italic">
              t
            </span>
          );
        if (/^\$\\tau\s+\\le\s+t\$$/.test(part))
          return (
            <span key={i} className="font-serif">
              <span className="italic">τ</span> ≤{" "}
              <span className="italic">t</span>
            </span>
          );
        if (part === "$\\tau$")
          return (
            <span key={i} className="font-serif italic">
              τ
            </span>
          );
        if (part === "$\\le$")
          return (
            <span key={i} className="font-serif">
              ≤
            </span>
          );
        if (part === "H_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">H</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "m_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">m</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "o_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">o</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "a_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">a</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "φ")
          return (
            <span key={i} className="font-serif italic">
              φ
            </span>
          );
        if (part === "φ(H_t)")
          return (
            <span key={i} className="font-serif">
              <span className="italic">φ</span>(
              <span className="italic">H</span>
              <sub className="text-[0.7em]">t</sub>)
            </span>
          );
        if (part === "ℓ")
          return (
            <span key={i} className="font-serif italic">
              ℓ
            </span>
          );
        if (part === "π_θ")
          return (
            <span key={i} className="font-serif">
              <span className="italic">π</span>
              <sub className="text-[0.7em] italic">θ</sub>
            </span>
          );
        if (part === "π-GCA")
          return (
            <span key={i} className="font-serif">
              <span className="italic">π</span>-GCA
            </span>
          );
        if (part === "ℝ^N")
          return (
            <span key={i} className="font-serif">
              ℝ<sup className="text-[0.7em]">N</sup>
            </span>
          );
        if (part === "VLA" || part === "VLM")
          return (
            <span key={i} className="font-sans font-medium">
              {part}
            </span>
          );
        return part;
      })}
    </>
  );
}
