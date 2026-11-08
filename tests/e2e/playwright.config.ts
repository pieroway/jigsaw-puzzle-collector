import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: '*.spec.ts', use: { baseURL: process.env.BASE_URL || 'http://localhost:5173', browserName: 'chromium' }, retries: 1, failOnFlakyTests: true, timeout: 60000 });
