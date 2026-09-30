import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'site-activity.spec.ts',use:{browserName:'chromium',headless:true},reporter:'list',timeout:15000});
