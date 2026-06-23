import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpsCentral — Rogers D&AI",
    short_name: "OpsCentral",
    description: "One hub for Data & AI Operations",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#DA291C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
