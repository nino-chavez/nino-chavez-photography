import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/analytics',timeout:45000,workers:1,reporter:'line',use:{baseURL:process.env.ANALYTICS_TEST_BASE_URL ?? 'http://127.0.0.1:5187',headless:true},outputDir:'.temp/analytics-playwright-results'});
