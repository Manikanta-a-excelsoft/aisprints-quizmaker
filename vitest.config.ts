import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	// tsconfigPaths is what makes the `@/` alias resolve in tests.
	plugins: [react(), tsconfigPaths()],
	test: {
		// jsdom setup is the slowest part of a run, so it is opted into per file with
		// `// @vitest-environment jsdom` rather than applied to every test.
		environment: "node",
		// The default `forks` pool works again after the Wrangler upgrade (re-checked in
		// Phase 4: 146 tests pass on it), but `threads` still runs the suite a few seconds
		// faster here, so it stays.
		pool: "threads",
		globals: true,
	},
});
