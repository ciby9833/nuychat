import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const packageName = getPackageName(id);
          if (!packageName) return;
          if (packageName === "react" || packageName === "react-dom") return "react-vendor";
          if (packageName === "react-router" || packageName === "react-router-dom") return "router";
          return `pkg-${packageName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        }
      }
    }
  },
  server: {
    port: 5173
  }
});

function getPackageName(id: string): string | null {
  const marker = "/node_modules/";
  const index = id.lastIndexOf(marker);
  if (index === -1) return null;

  const remainder = id.slice(index + marker.length);
  if (!remainder) return null;

  if (remainder.startsWith(".pnpm/")) {
    const nested = remainder.indexOf("/node_modules/");
    if (nested === -1) return null;
    return getPackageName(remainder.slice(nested));
  }

  const segments = remainder.split("/");
  if (segments.length === 0) return null;
  if (segments[0]?.startsWith("@") && segments[1]) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] ?? null;
}
