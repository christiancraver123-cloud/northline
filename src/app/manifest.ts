import type { MetadataRoute } from "next";

/** Lets phones and desktop browsers install Northline like an app (Add to Home Screen / Install / Add to Dock). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Northline Command Center", short_name: "Northline", description: "Your six creators: approve, post, track.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait", background_color: "#070b1a", theme_color: "#070b1a",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    shortcuts: [{ name: "Approvals", url: "/approvals?view=grid" }, { name: "Inbox", url: "/inbox" }, { name: "Talent", url: "/talent" }],
  };
}
