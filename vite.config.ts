import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	build: {
		// MapLibre is an intentionally lazy map-route chunk; keep warnings for anything above its known size.
		chunkSizeWarningLimit: 1000
	},
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			csp: {
				mode: 'nonce',
				directives: {
					'base-uri': ['self'],
					'connect-src': [
						'self',
						'https://*.googleapis.com',
						'https://*.google.com',
						'https://*.gstatic.com',
						'https://server.arcgisonline.com',
						'https://tiles.openfreemap.org',
						'https://tiles.openseamap.org',
						'https://tiles.maps.eox.at'
					],
					'default-src': ['self'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'frame-src': ['https://*.google.com'],
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://*.googleapis.com',
						'https://*.google.com',
						'https://*.googleusercontent.com',
						'https://*.gstatic.com',
						'https://*.tacdn.com',
						'https://*.tripadvisor.com',
						'https://server.arcgisonline.com',
						'https://tiles.openfreemap.org',
						'https://tiles.openseamap.org',
						'https://tiles.maps.eox.at'
					],
					'object-src': ['none'],
					'script-src': ['self', 'https://*.googleapis.com', 'https://*.gstatic.com'],
					'style-src': ['self', 'https://fonts.googleapis.com'],
					'style-src-attr': ['unsafe-inline'],
					'worker-src': ['self', 'blob:']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
