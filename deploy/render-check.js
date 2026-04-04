#!/usr/bin/env node
/**
 * AHVP 浏览器渲染验证脚本
 * 用 Puppeteer 检查页面实际渲染情况，防止白屏事故
 * 
 * 用法:
 *   node render-check.js              # 完整检查（含登录验证）
 *   node render-check.js --quick      # 快速检查（只检查登录页渲染）
 * 
 * 退出码: 0=通过, 1=失败
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.RENDER_CHECK_URL || 'http://localhost';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@ahvp.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123';
const QUICK_MODE = process.argv.includes('--quick');
const TIMEOUT = parseInt(process.env.RENDER_CHECK_TIMEOUT || '30000', 10);

let browser;
let exitCode = 0;
const results = [];

function pass(name) {
  console.log(`✅ RENDER PASS: ${name}`);
  results.push({ name, status: 'pass' });
}

function fail(name, detail) {
  console.error(`❌ RENDER FAIL: ${name}`);
  if (detail) console.error(`   Detail: ${detail}`);
  results.push({ name, status: 'fail', detail });
  exitCode = 1;
}

async function run() {
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: TIMEOUT,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Step 1: Open homepage and wait for load
    console.log('\n[Step 1] Opening homepage...');
    try {
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle0', timeout: TIMEOUT });
      pass('Homepage loaded');
    } catch (e) {
      fail('Homepage loaded', e.message);
      return;
    }

    // Step 2: Check #root has children (not blank screen)
    console.log('[Step 2] Checking #root has children...');
    const rootChildren = await page.evaluate(() => {
      const root = document.querySelector('#root');
      return root ? root.children.length : -1;
    });
    if (rootChildren > 0) {
      pass(`#root has ${rootChildren} child element(s)`);
    } else if (rootChildren === 0) {
      fail('#root has children', '#root exists but has 0 children (white screen!)');
      await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
      return;
    } else {
      fail('#root has children', '#root element not found in DOM');
      return;
    }

    // Step 3: Check page contains expected text
    console.log('[Step 3] Checking page text content...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('登') && bodyText.includes('录') || bodyText.includes('工作台') || bodyText.includes('Dashboard') || bodyText.includes('芯片') || bodyText.includes('评测')) {
      pass('Page contains expected text ("登|工作台|Dashboard|芯片|评测")');
    } else {
      fail('Page contains expected text', `Body text (first 200 chars): ${bodyText.substring(0, 200)}`);
      await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
      return;
    }

    // Quick mode stops here
    if (QUICK_MODE) {
      console.log('\n[Quick mode] Skipping login verification.');
      return;
    }

    // Step 4: Login with test account
    console.log('[Step 4] Logging in with test account...');
    try {
      // Find email and password inputs
      const emailSelectors = [
        'input[type="text"]',
        'input[name="email"]',
        'input[id*="email"]',
      ];
      let emailInput = null;
      for (const sel of emailSelectors) {
        emailInput = await page.$(sel);
        if (emailInput) break;
      }
      const passwordInput = await page.$('input[type="password"]');
      
      if (!emailInput || !passwordInput) {
        fail('Login form found', 'Could not find email or password input fields');
        await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
        return;
      }

      // Clear and type email
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(TEST_EMAIL, { delay: 30 });
      
      // Clear and type password
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(TEST_PASSWORD, { delay: 30 });
      
      // Click login button
      const loginBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('登') || b.textContent.includes('Login')) || null;
      });
      
      if (!loginBtn || !(await loginBtn.asElement())) {
        fail('Login button found', 'Could not find login button');
        await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
        return;
      }

      await loginBtn.asElement().click();
      pass('Login form submitted');

      // Wait for navigation/page change after login
      await page.waitForFunction(
        () => document.body.innerText.includes('评测') || 
              document.body.innerText.includes('工作台') ||
              document.body.innerText.includes('任务') ||
              document.body.innerText.includes('仪表'),
        { timeout: TIMEOUT }
      );
      
    } catch (e) {
      fail('Login succeeded', e.message);
      await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
      return;
    }

    // Step 5: Check sidebar menu after login
    console.log('[Step 5] Checking sidebar/menu after login...');
    const postLoginText = await page.evaluate(() => document.body.innerText);
    const menuKeywords = ['评测任务', '工作台', '任务管理', '评测'];
    const found = menuKeywords.filter(kw => postLoginText.includes(kw));
    
    if (found.length > 0) {
      pass(`Post-login page contains menu text: ${found.join(', ')}`);
    } else {
      fail('Post-login page contains menu text', `Expected one of: ${menuKeywords.join(', ')}. Body text (first 300 chars): ${postLoginText.substring(0, 300)}`);
      await page.screenshot({ path: '/tmp/render-check-fail.png' }).catch(() => {});
    }

  } catch (e) {
    fail('Render check runtime', e.message);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

(async () => {
  console.log('========================================');
  console.log(`  Render Check (${QUICK_MODE ? 'Quick' : 'Full'}) - ${new Date().toISOString()}`);
  console.log(`  URL: ${BASE_URL}`);
  console.log('========================================');

  await run();

  console.log('\n========================================');
  console.log(`  Render Results: ${results.filter(r=>r.status==='pass').length} passed, ${results.filter(r=>r.status==='fail').length} failed`);
  console.log('========================================');

  process.exit(exitCode);
})();
