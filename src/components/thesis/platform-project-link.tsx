"use client";

import React, { useState } from "react";
import Link from "next/link";

type PlatformProjectLinkProps = {
  href: string;
  label: string;
};

export function PlatformProjectLink({ href, label }: PlatformProjectLinkProps) {
  const [isOpening, setIsOpening] = useState(false);

  return (
    <Link
      href={href}
      aria-busy={isOpening}
      onClick={() => setIsOpening(true)}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-2xl bg-[#2a211c] px-5 py-3 text-sm font-medium text-[#fffaf4] transition hover:bg-[#3a3029]"
    >
      {isOpening ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border-2 border-[#fffaf4]/35 border-t-[#fffaf4] motion-safe:animate-spin"
          />
          正在{label}
        </>
      ) : (
        label
      )}
    </Link>
  );
}
