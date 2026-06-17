import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
import { existsSync, realpathSync } from 'node:fs';

// When the dev server runs from a git worktree (parallel-session workflow), that
// worktree's node_modules may resolve to a path outside the worktree root, which
// Vite's default fs.allow denies (403 → dead hydration). Allow the resolved path.
const nodeModulesRealPath = existsSync('node_modules') ? realpathSync('node_modules') : null;

function clientChunkOptimization(): Plugin {
	let isSsr = false;
	return {
		name: 'client-chunk-optimization',
		configResolved(config) {
			isSsr = !!config.build.ssr;
		},
		outputOptions(options) {
			if (!isSsr) {
				options.experimentalMinChunkSize = 5_000;
				const existingManualChunks = options.manualChunks;
				options.manualChunks = function (id, meta) {
					if (id.includes('lucide-svelte')) {
						return 'icons';
					}
					if (typeof existingManualChunks === 'function') {
						return existingManualChunks(id, meta);
					}
				};
			}
			return options;
		}
	};
}

export default defineConfig({
	server: {
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				...(nodeModulesRealPath ? [nodeModulesRealPath] : [])
			]
		}
	},
	plugins: [sveltekit(), clientChunkOptimization()],
	ssr: {
		// @cf-wasm packages ship WASM that requires Cloudflare's workerd runtime.
		// Mark external so Vite doesn't bundle them into the SSR (Node) output during
		// build (avoids the wbg module-not-found crash). They resolve correctly at
		// runtime on Cloudflare Pages Workers. Mirrors the rally-hq OG setup.
		external: ['@cf-wasm/og', '@cf-wasm/resvg', '@cf-wasm/satori']
	}
});
