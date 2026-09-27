import { defineConfig } from "vitest/config";
import path from "node:path";

/** Unit tests cover the pure rules — URL safety, period maths, export
 * writers. Anything touching Supabase is verified against the running app,
 * where the RLS policies are real. */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
