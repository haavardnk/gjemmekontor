import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
					'connect-src': ['self'],
					'default-src': ['self'],
					'font-src': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'img-src': ['self', 'data:', 'blob:'],
					'object-src': ['none'],
					'script-src': ['self'],
					'style-src': ['self'],
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
