import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	// tsconfigPaths is what makes the `@/` alias resolve in tests.
	plugins: [react(), tsconfigPaths()],
	test: {
		// jsdom costs ~45s of environment setup on Windows here, so it is opted into
		// per file with `// @vitest-environment jsdom` rather than applied to every test.
		environment: "node",
		// The default `forks` pool never starts a worker on this machine.
		pool: "threads",
		globals: true,
	},
});
