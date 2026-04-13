const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost',
    headless: true,
    screenshot: 'only-on-failure',
  },
  retries: 0,
  reporter: 'list',
});
