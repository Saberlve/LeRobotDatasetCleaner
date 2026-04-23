import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeRobot Dataset Tool and Visualizer",
  description: "Tool and Visualizer for LeRobot Datasets",
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
