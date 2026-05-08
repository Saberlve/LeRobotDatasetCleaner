import type { Metadata } from "next";
import { thesisHeroVideoSrc } from "@/content/thesis-site";
import "./globals.css";

export const metadata: Metadata = {
  title: "面向长程任务的 VLM-VLA 通用记忆系统",
  description:
    "毕业设计论文宣传站，展示记忆增强 VLM-VLA 方法、实验结果与数据工具链。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="preload"
          href={thesisHeroVideoSrc}
          as="video"
          type="video/mp4"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
