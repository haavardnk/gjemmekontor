import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const e2eDataDir = mkdtempSync(join(tmpdir(), 'gjemmekontor-v0.2.0-e2e-'));
process.env.GJEMMEKONTOR_E2E_DATA_DIR = e2eDataDir;
process.env.AISSTREAM_API_KEY = 'test-ais-key';
process.env.BRING_EMAIL = 'e2e@example.com';
process.env.BRING_PASSWORD = 'e2e-provider-password';

export default defineConfig({
	workers: 1,
	tsconfig: './playwright.tsconfig.json',
	globalSetup: './tests/e2e/global-setup.ts',
	use: { baseURL: 'http://127.0.0.1:4173' },
	webServer: {
		command: `export ADMIN_PASSWORD=test-administrator-password SESSION_SECRET=0123456789abcdef0123456789abcdef DATA_DIR=${JSON.stringify(e2eDataDir)} AISSTREAM_API_KEY=test-ais-key BRING_EMAIL=e2e@example.com BRING_PASSWORD=e2e-provider-password GOOGLE_PLACES_UI_KIT_API_KEY=browser-test-key FLIGHTAWARE_AEROAPI_KEY= ORIGIN=http://127.0.0.1:4173 BODY_SIZE_LIMIT=6M; npm run build && npm run preview -- --host 127.0.0.1`,
		url: 'http://127.0.0.1:4173',
		timeout: 120_000
	},
	testMatch: '**/*.e2e.{ts,js}'
});
