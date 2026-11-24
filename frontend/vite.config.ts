import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "CINEMA_");
  const proxy = { "/api": env.CINEMA_BACKEND_URL || "http://localhost:5254" };
  return {
    server: { host: "localhost", port: 5173, strictPort: true, proxy },
    preview: { host: "localhost", port: 5173, strictPort: true, proxy },
  };
});
