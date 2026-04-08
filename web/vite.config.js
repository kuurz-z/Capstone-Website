import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.JPG"],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libs into separately cacheable chunks
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-firebase": ["firebase/app", "firebase/auth"],
          "vendor-motion": ["framer-motion"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
