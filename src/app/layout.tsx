import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeRobotDatasetCleaner",
  description: "LeRobot 数据集清洗与可视化工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
