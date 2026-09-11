import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.JPG"],
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "build",
    sourcemap: "hidden",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      maxParallelFileOps: 20,
      output: {
        manualChunks: {
          // Split heavy vendor libs into separately cacheable chunks without circular dependencies
          "vendor-core": [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "react-router-dom",
            "@tanstack/react-query",
          ],
          "vendor-firebase": ["firebase/app", "firebase/auth"],
          "vendor-icons": ["lucide-react", "@tabler/icons-react"],
          "vendor-charts": ["recharts"],
          "vendor-pdf": ["jspdf", "jspdf-autotable", "html2canvas", "html2pdf.js"],
          "vendor-motion": ["framer-motion"],
          "vendor-phone": ["libphonenumber-js"],
          "vendor-socket": ["socket.io-client"],
        },
      },
    },
  },
  esbuild: {
    loader: "jsx",
    include: /(?:src|pdf)\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    include: ["jspdf", "html2canvas", "html2pdf.js"],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
