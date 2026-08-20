import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command:
			'export APP_PASSWORD=test-password SESSION_SECRET=0123456789abcdef0123456789abcdef DATA_DIR=$TMPDIR/gjemmekontor-e2e ORIGIN=http://localhost:4173; npm run build && npm run preview -- --host 127.0.0.1',
		port: 4173
	},
	testMatch: '**/*.e2e.{ts,js}'
});
