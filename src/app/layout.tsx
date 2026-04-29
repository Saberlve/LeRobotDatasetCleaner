import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeRobotDatasetCleaner",
  description: "Tool and Visualizer for LeRobot Datasets curation and cleaning",
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
