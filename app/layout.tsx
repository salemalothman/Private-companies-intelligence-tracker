import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Automation Investment Intelligence Platform",
  description:
    "Track private companies, valuations, funding rounds, competitors, and portfolio performance.",
  applicationName: "Automation Investment Intelligence Platform",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Automation Investment Intelligence Platform",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Extend under the notch / home indicator; pair with env(safe-area-inset-*).
  viewportFit: "cover",
  // Keep pinch-zoom available (Apple HIG / accessibility — never disable zoom).
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
