import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spatial Synapse by Jaehong Park",
  description: "AI로 정리하는 내 머릿속 공간 아이디어 아카이브 — Jaehong Park's archive of AI-generated spatial concepts.",
};

// Critical for mobile: without this, iOS renders the page at virtual 980px width
// and scales down, which can make tap coordinates miss every element.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="bg-bg text-fg min-h-full">{children}</body>
    </html>
  );
}
