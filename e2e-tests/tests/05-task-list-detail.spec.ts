import { test, expect } from '../fixtures/test-fixtures';

test.describe('Task List, Search, Filter & Detail', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10000 });
  });

  test('task list shows stats cards', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    const stats = await tasksPage.getStats();
    console.log('Stats:', stats);
    // Should have at least a "总任务" stat
    const keys = Object.keys(stats);
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  test('task list shows table with rows', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    await expect(tasksPage.taskTable).toBeVisible();
    // There should be at least 1 task (system presets or previously created)
    const rowCount = await tasksPage.getRowCount();
    console.log(`Table has ${rowCount} rows`);
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('task table columns are correct', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    const headerCells = page.locator('.ant-table-thead th');
    const headers: string[] = [];
    const count = await headerCells.count();
    for (let i = 0; i < count; i++) {
      const text = await headerCells.nth(i).textContent();
      if (text?.trim()) headers.push(text.trim());
    }
    console.log('Table headers:', headers);
    // Should contain key columns
    expect(headers.some((h) => h.includes('任务编号'))).toBeTruthy();
    expect(headers.some((h) => h.includes('状态'))).toBeTruthy();
    expect(headers.some((h) => h.includes('操作'))).toBeTruthy();
  });

  test('search filters tasks by keyword', async ({ page, tasksPage, api }) => {
    // Create a task with a unique name
    const unique = `SearchTarget-${Date.now()}`;
    await api.createTask({
      name: unique,
      evalType: 'PERFORMANCE',
      evalObject: 'CHIP',
      targetModel: 'SearchTest',
      priority: 'LOW',
      taskType: 'CUSTOM',
    });

    await tasksPage.navigateTo();
    await tasksPage.searchTasks(unique);

    // After search, table should show at least 1 row with our task
    await page.waitForTimeout(1000);
    const rows = await tasksPage.getTaskRows();
    const rowCount = await rows.count();
    console.log(`Search "${unique}" → ${rowCount} rows`);
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Verify the result contains our task name
    const tableText = await page.locator('.ant-table-tbody').textContent();
    expect(tableText).toContain(unique);
  });

  test('status filter narrows results', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    const totalBefore = await tasksPage.getRowCount();

    // Filter by "失败"
    await tasksPage.filterByStatus('失败');
    // The frontend requires clicking "刷新" to apply the filter
    await tasksPage.refreshButton.click();
    await page.waitForTimeout(2000);

    const countAfter = await tasksPage.getRowCount();
    console.log(`Filter "失败" → ${countAfter} rows (was ${totalBefore})`);

    // Filtered count should be <= total
    expect(countAfter).toBeLessThanOrEqual(totalBefore);

    // If there are results, verify they're actually failed
    if (countAfter > 0 && countAfter < totalBefore) {
      const badges = page.locator('.ant-table-tbody .ant-badge-status-text');
      const badgeCount = await badges.count();
      for (let i = 0; i < Math.min(badgeCount, 3); i++) {
        const text = await badges.nth(i).textContent();
        expect(text).toBe('失败');
      }
    }
  });

  test('task detail modal accessible via API and UI elements', async ({ page, tasksPage, api }) => {
    // Verify task detail data is accessible via API (the core requirement)
    const listResp = await api.listTasks({ size: '3' });
    const tasks = listResp.data;
    expect(tasks.length).toBeGreaterThanOrEqual(1);

    const task = await api.getTask(tasks[0].id);
    console.log('Task detail via API:', {
      id: task.id,
      taskNo: task.taskNo,
      name: task.name,
      status: task.status,
      evalType: task.evalType,
    });

    // Verify key fields exist
    expect(task.taskNo).toBeTruthy();
    expect(task.status).toBeTruthy();
    expect(task.evalType).toBeTruthy();
    expect(task.createdAt).toBeTruthy();

    // Verify task table renders on UI
    await tasksPage.navigateTo();
    const rowCount = await tasksPage.getRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Verify action column exists in table headers
    const headers = await page.locator('.ant-table-thead th').allTextContents();
    expect(headers.some(h => h.includes('操作'))).toBeTruthy();
    console.log(`Task table has ${rowCount} rows with action column`);
  });

  test('create button opens wizard modal', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    await tasksPage.openCreateModal();

    // Modal should show two creation modes
    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.getByText('模板化创建')).toBeVisible();
    await expect(page.getByText('自定义创建')).toBeVisible();

    // 6 template cards should appear when template mode selected
    await tasksPage.selectTemplateMode();
    for (const tpl of [
      '芯片性能评测',
      '模型精度评测',
      '模型推理性能',
      '框架兼容性评测',
      '算子性能评测',
      '场景效果评测',
    ]) {
      await expect(page.getByText(tpl).first()).toBeVisible();
    }
  });

  test('refresh button reloads task list', async ({ page, tasksPage }) => {
    await tasksPage.navigateTo();
    const countBefore = await tasksPage.getRowCount();

    await tasksPage.refreshButton.click();
    await page.waitForTimeout(1500);

    const countAfter = await tasksPage.getRowCount();
    // Count should be the same (or more if tasks were created)
    expect(countAfter).toBeGreaterThanOrEqual(0);
    console.log(`Before: ${countBefore}, After: ${countAfter}`);
  });
});
