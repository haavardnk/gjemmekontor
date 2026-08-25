import { defineConfig } from '@playwright/test';

export default defineConfig({
	workers: 1,
	webServer: {
		command:
			'export APP_PASSWORD=test-password SESSION_SECRET=0123456789abcdef0123456789abcdef DATA_DIR=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gjemmekontor-e2e GOOGLE_MY_MAPS_ID=test-map AISSTREAM_API_KEY=test-ais-key ORIGIN=http://localhost:4173 BODY_SIZE_LIMIT=6M; npm run build && npm run preview -- --host 127.0.0.1',
		port: 4173
	},
	testMatch: '**/*.e2e.{ts,js}'
});
