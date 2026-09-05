import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PIEMR Project Platform",
    template: "%s · PIEMR Project Platform",
  },
  description:
    "Project lifecycle, evidence, attendance, presentation and analytics platform for Prestige Institute of Engineering Management & Research, Indore.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f4fb4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
