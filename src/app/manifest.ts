import type { MetadataRoute } from "next";

// Lets the website be added to a phone or tablet home screen and open
// full-screen at the Register.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Momikie's POS",
    short_name: "Momikie's POS",
    description: "Point of sale and credit tracking for Momikie's General Merchandise",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#0f1d3d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
