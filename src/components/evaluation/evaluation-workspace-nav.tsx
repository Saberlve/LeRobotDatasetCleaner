"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const workspaceItems: Array<{ href: string; label: string }> = [
  { href: "/evaluation/data", label: "数据查看" },
  { href: "/evaluation/training", label: "训练配置" },
  { href: "/evaluation/replay", label: "评测回放" },
  { href: "/evaluation/launch", label: "评测启动" },
];

export function EvaluationWorkspaceNav() {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-[#ded6c8] bg-[#f8f3ea]/95 backdrop-blur supports-[backdrop-filter]:bg-[#f8f3ea]/85">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 text-[#2a211c] md:px-6">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="text-[#6c6258] transition hover:text-[#2a211c]"
            >
              ← 主站
            </Link>
            <span aria-hidden className="text-[#c8bdac]">
              /
            </span>
            <span className="font-semibold tracking-normal text-[#2a211c]">
              评测平台
            </span>
          </div>
        </div>
        <nav
          aria-label="评测工作区导航"
          role="tablist"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {workspaceItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="tab"
                aria-current={isActive ? "page" : undefined}
                aria-selected={isActive}
                className={`relative shrink-0 px-3.5 py-2 text-sm transition ${
                  isActive
                    ? "font-semibold text-[#2a211c]"
                    : "text-[#6c6258] hover:text-[#2a211c]"
                }`}
              >
                {item.label}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-colors ${
                    isActive ? "bg-[#c15f3c]" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
