import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

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
	plugins: [sveltekit(), clientChunkOptimization()]
});
