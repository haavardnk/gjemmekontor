import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const e2eDataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-v0.2.0-e2e-'));

export default defineConfig({
	workers: 1,
	webServer: {
		command: `export ADMIN_PASSWORD=test-administrator-password SESSION_SECRET=0123456789abcdef0123456789abcdef DATA_DIR=${JSON.stringify(e2eDataDir)} AISSTREAM_API_KEY=test-ais-key ORIGIN=http://localhost:4173 BODY_SIZE_LIMIT=6M; npm run build && npm run preview -- --host 127.0.0.1`,
		port: 4173,
		timeout: 120_000
	},
	testMatch: '**/*.e2e.{ts,js}'
});
