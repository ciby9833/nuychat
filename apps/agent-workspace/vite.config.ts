import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          icons: ["@ant-design/icons"],
          i18n: ["i18next", "react-i18next"]
        }
      }
    }
  },
  server: {
    port: 5175
  }
});
