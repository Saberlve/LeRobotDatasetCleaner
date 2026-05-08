import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";

import { thesisNavItems, thesisTitle } from "@/content/thesis-site";

type SiteShellProps = {
  children: ReactNode;
};

export function ThesisSiteShell({ children }: SiteShellProps) {
  return (
    <div className="min-h-screen bg-[#f8f3ea] text-[#2a211c]">
      <header className="sticky top-0 z-50 border-b border-[#ded6c8] bg-[#f8f3ea]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-[#2a211c] md:px-6">
          <div className="flex items-center justify-between gap-6">
            <Link
              href="/"
              className="max-w-xs text-sm font-semibold tracking-normal text-[#2a211c]"
            >
              {thesisTitle}
            </Link>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <Link
              href="/"
              className="shrink-0 rounded-full border border-[#d9cec0] bg-[#fffaf5] px-3.5 py-1.5 text-sm text-[#2a211c] transition hover:border-[#c15f3c] hover:text-[#9b4328]"
            >
              首页
            </Link>
            <Link
              href="/evaluation"
              className="shrink-0 rounded-full border border-[#c15f3c]/35 bg-[#fffaf5] px-3.5 py-1.5 text-sm text-[#9b4328] transition hover:border-[#c15f3c] hover:text-[#2a211c]"
            >
              评测平台
            </Link>
            {thesisNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full border border-transparent px-3.5 py-1.5 text-sm text-[#6c6258] transition hover:border-[#d9cec0] hover:bg-[#fffaf5] hover:text-[#2a211c]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
