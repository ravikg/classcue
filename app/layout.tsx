import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "ClassCue — Every class, calmly accounted for";
const description =
  "A phone-first class, attendance, punctuality, fee, and reminder tracker for parents.";

export const viewport: Viewport = {
  themeColor: "#12352d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "classcue.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const image = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "ClassCue",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "ClassCue", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    icons: { icon: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }], shortcut: "/icon-192.png", apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1536, height: 1024, alt: "ClassCue phone-first class dashboard" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
