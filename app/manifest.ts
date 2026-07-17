import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClassCue — Family class tracker",
    short_name: "ClassCue",
    description: "Track children’s classes, attendance, fees, contacts, and reminders.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#12352d",
    orientation: "portrait-primary",
    categories: ["education", "productivity", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
