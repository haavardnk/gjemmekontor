import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
						'https://server.arcgisonline.com',
						'https://tiles.openfreemap.org',
						'https://tiles.openseamap.org',
						'https://tiles.maps.eox.at'
					],
					'default-src': ['self'],
					'font-src': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://server.arcgisonline.com',
						'https://tiles.openfreemap.org',
						'https://tiles.openseamap.org',
						'https://tiles.maps.eox.at'
					],
					'object-src': ['none'],
					'script-src': ['self'],
					'style-src': ['self'],
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
