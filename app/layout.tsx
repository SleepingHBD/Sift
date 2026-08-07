import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sleepinghbd.github.io/Sift";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Sift — Creative Strategy Intelligence", template: "%s · Sift" },
  description: "Discover signals, understand culture and turn evidence into creative strategy.",
  applicationName: "Sift",
  keywords: ["creative strategy", "cultural intelligence", "social listening", "research"],
  openGraph: {
    type: "website",
    title: "Sift — From signal to strategy",
    description: "Creative strategy intelligence for turning evidence into direction.",
    url: siteUrl,
    siteName: "Sift",
    images: [{ url: `${siteUrl}/og.png`, width: 1734, height: 909, alt: "Sift — From signal to strategy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sift — From signal to strategy",
    description: "Creative strategy intelligence for turning evidence into direction.",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><AuthProvider><AppProvider>{children}</AppProvider></AuthProvider></body></html>;
}
