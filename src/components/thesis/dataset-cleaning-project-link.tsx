"use client";

import React, { useState } from "react";
import Link from "next/link";

type DatasetCleaningProjectLinkProps = {
  href: string;
};

export function DatasetCleaningProjectLink({
  href,
}: DatasetCleaningProjectLinkProps) {
  const [isOpening, setIsOpening] = useState(false);

  return (
    <Link
      href={href}
      aria-busy={isOpening}
      onClick={() => setIsOpening(true)}
      className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#2a211c] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#3a3029]"
    >
      {isOpening ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border-2 border-white/35 border-t-white motion-safe:animate-spin"
          />
          正在打开数据清洗工具
        </>
      ) : (
        "打开数据清洗工具"
      )}
    </Link>
  );
}
