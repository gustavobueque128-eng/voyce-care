import { defineConfig } from "vite";

// JSX é compilado pelo esbuild embutido no Vite (React.createElement; cada arquivo importa React).
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
    headers: { "Permissions-Policy": "microphone=(self)" }
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2019" }
});
