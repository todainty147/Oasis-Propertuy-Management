import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tenaqo",
    short_name: "Tenaqo",
    description: "Rental operations software for landlords and property managers.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f9ff",
    theme_color: "#0b4f6c",
    icons: [
      {
        src: "/brand/tenaqo/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/brand/tenaqo/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/tenaqo/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
