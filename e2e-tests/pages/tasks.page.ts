import { type Page, type APIRequestContext, expect } from '@playwright/test';

/** Task status constants */
export const TASK_STATUSES = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TERMINATED: 'TERMINATED',
} as const;
export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES];

/** Terminal states where task lifecycle is done */
export const TERMINAL_STATES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED'];

/** Preset template definitions matching the frontend */
export const PRESET_TEMPLATES = [
  { id: 'chip_perf', name: '芯片性能评测', evalType: 'PERFORMANCE', evalObject: 'CHIP' },
  { id: 'model_accuracy', name: '模型精度评测', evalType: 'ACCURACY', evalObject: 'MODEL' },
  { id: 'model_perf', name: '模型推理性能', evalType: 'PERFORMANCE', evalObject: 'MODEL' },
  { id: 'framework_compat', name: '框架兼容性评测', evalType: 'COMPATIBILITY', evalObject: 'FRAMEWORK' },
  { id: 'operator_perf', name: '算子性能评测', evalType: 'PERFORMANCE', evalObject: 'OPERATOR' },
  { id: 'scene_effect', name: '场景效果评测', evalType: 'PERFORMANCE', evalObject: 'SCENE' },
] as const;

/** API helper — direct HTTP for fast polling without browser */
export class TaskApiHelper {
  private token: string = '';

  constructor(private baseURL: string) {}

  private async safeJson(resp: Response): Promise<any> {
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (${resp.status}): ${text.slice(0, 200)}`);
    }
  }

  async login(email: string, password: string) {
    const resp = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await this.safeJson(resp);
    if (json.code !== 0) throw new Error(`Login failed: ${json.message}`);
    this.token = json.data.token;
    return json.data;
  }

  private authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async createTask(payload: Record<string, any>): Promise<any> {
    // Ensure taskType is always set (DB NOT NULL constraint)
    const body = { taskType: 'CUSTOM', ...payload };
    const resp = await fetch(`${this.baseURL}/api/tasks`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    const json = await this.safeJson(resp);
    if (json.code !== 0) throw new Error(`Create task failed: ${json.message}`);
    return json.data;
  }

  async getTask(taskId: number): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/${taskId}`, {
      headers: this.authHeaders(),
    });
    const json = await this.safeJson(resp);
    if (json.code !== 0) throw new Error(`Get task failed: ${json.message}`);
    return json.data;
  }

  async listTasks(params?: Record<string, string>): Promise<any> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const resp = await fetch(`${this.baseURL}/api/tasks${qs}`, {
      headers: this.authHeaders(),
    });
    const json = await this.safeJson(resp);
    if (json.code !== 0) throw new Error(`List tasks failed: ${json.message}`);
    return json;
  }

  async cancelTask(taskId: number): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    return this.safeJson(resp);
  }

  async retryTask(taskId: number): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    return this.safeJson(resp);
  }

  async cloneTask(taskId: number): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/${taskId}/clone`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    return this.safeJson(resp);
  }

  async deleteTask(taskId: number): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    return this.safeJson(resp);
  }

  async batchCancel(ids: number[]): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/batch/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ ids }),
    });
    return this.safeJson(resp);
  }

  async batchDelete(ids: number[]): Promise<any> {
    const resp = await fetch(`${this.baseURL}/api/tasks/batch/delete`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ ids }),
    });
    return this.safeJson(resp);
  }

  /**
   * Poll task status until it reaches one of the target states.
   * Returns the task data once target is hit, or throws on timeout.
   */
  async waitForStatus(
    taskId: number,
    targetStatuses: TaskStatus[],
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<any> {
    const { intervalMs = 3000, timeoutMs = 180_000 } = options;
    const start = Date.now();
    let lastStatus = '';
    let task: any;

    while (Date.now() - start < timeoutMs) {
      task = await this.getTask(taskId);
      lastStatus = task.status;
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(
        `  [poll] task ${taskId} status=${lastStatus} progress=${task.progress ?? 0}% (${elapsed}s)`,
      );

      if (targetStatuses.includes(lastStatus as TaskStatus)) {
        return task;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
      `Timeout waiting for task ${taskId} to reach [${targetStatuses.join('|')}]. ` +
        `Last status: ${lastStatus} after ${Math.round((Date.now() - start) / 1000)}s`,
    );
  }

  /** Wait for any terminal state */
  async waitForTerminal(taskId: number, timeoutMs = 180_000): Promise<any> {
    return this.waitForStatus(taskId, TERMINAL_STATES, { timeoutMs });
  }

  /** Wait for task to leave PENDING */
  async waitForScheduled(taskId: number, timeoutMs = 60_000): Promise<any> {
    return this.waitForStatus(
      taskId,
      ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED'],
      { timeoutMs, intervalMs: 2000 },
    );
  }
}

/** UI Page Object for the Tasks page */
export class TasksPage {
  constructor(private page: Page) {}

  // --- Navigation ---
  async navigateTo() {
    await this.page.locator('.ant-menu-item').filter({ hasText: '评测任务' }).click();
    await this.page.waitForTimeout(500);
    await this.page.locator('.ant-table').first().waitFor({ timeout: 10000 });
  }

  // --- Selectors ---
  get createButton() {
    return this.page.getByRole('button', { name: /创建评测任务/ });
  }
  get refreshButton() {
    return this.page.getByRole('button', { name: /刷新/ });
  }
  get searchInput() {
    return this.page.locator('input[placeholder*="搜索"]');
  }
  get taskTable() {
    return this.page.locator('.ant-table');
  }
  get batchCancelBtn() {
    return this.page.getByRole('button', { name: /批量取消/ });
  }
  get batchDeleteBtn() {
    return this.page.getByRole('button', { name: /批量删除/ });
  }

  // --- Stats cards ---
  async getStats() {
    const cards = this.page.locator('.ant-statistic');
    const result: Record<string, string> = {};
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const title = await cards.nth(i).locator('.ant-statistic-title').textContent();
      const value = await cards.nth(i).locator('.ant-statistic-content-value').textContent();
      if (title) result[title.trim()] = value?.trim() || '0';
    }
    return result;
  }

  // --- Task table ---
  async getTaskRows() {
    return this.page.locator('.ant-table-tbody tr.ant-table-row');
  }

  async getRowCount(): Promise<number> {
    return (await this.getTaskRows()).count();
  }

  async clickTaskAction(taskNo: string, action: string) {
    const row = this.page.locator('.ant-table-row').filter({ hasText: taskNo });
    await row.getByRole('button', { name: new RegExp(action) }).click();
  }

  // --- Search & Filter ---
  async searchTasks(keyword: string) {
    await this.searchInput.fill(keyword);
    await this.searchInput.press('Enter');
    await this.page.waitForTimeout(1000);
  }

  async filterByStatus(status: string) {
    await this.page.locator('.ant-select').filter({ hasText: /状态/ }).first().click();
    await this.page.locator('.ant-select-item-option').filter({ hasText: status }).click();
    await this.page.waitForTimeout(1000);
  }

  // --- Create-task wizard helpers ---
  async openCreateModal() {
    await this.createButton.click();
    await this.page.locator('.ant-modal').waitFor({ timeout: 5000 });
  }

  async selectTemplateMode() {
    await this.page.locator('.ant-card').filter({ hasText: '模板化创建' }).click();
    await this.page.waitForTimeout(300);
  }

  async selectCustomMode() {
    await this.page.locator('.ant-card').filter({ hasText: '自定义创建' }).click();
    await this.page.waitForTimeout(300);
  }

  async selectTemplate(templateName: string) {
    await this.page.locator('.ant-card').filter({ hasText: templateName }).click();
    await this.page.waitForTimeout(300);
  }

  async clickNext() {
    await this.page.getByRole('button', { name: '下一步' }).click();
    await this.page.waitForTimeout(500);
  }

  async clickSubmit() {
    await this.page.getByRole('button', { name: /提交任务/ }).click();
    // Antd 5.x message classes
    await this.page
      .locator('.ant-message-notice-success, .ant-message-success')
      .or(this.page.getByText(/创建成功|已自动调度/))
      .first()
      .waitFor({ timeout: 15000 });
  }

  async fillBasicInfo(opts: {
    name: string;
    evalType?: string;
    evalObject?: string;
    targetModel: string;
    priority?: string;
    description?: string;
  }) {
    const modal = this.page.locator('.ant-modal');
    await modal.getByLabel(/任务名称/).fill(opts.name);

    if (opts.evalType) {
      await modal
        .locator('.ant-form-item')
        .filter({ hasText: '评测类型' })
        .locator('.ant-select-selector')
        .click();
      await this.page.locator('.ant-select-item-option').filter({ hasText: opts.evalType }).click();
    }

    if (opts.evalObject) {
      await modal
        .locator('.ant-form-item')
        .filter({ hasText: '评测维度' })
        .locator('.ant-select-selector')
        .click();
      await this.page
        .locator('.ant-select-item-option')
        .filter({ hasText: opts.evalObject })
        .click();
    }

    await modal.getByLabel(/评测对象/).fill(opts.targetModel);

    if (opts.priority) {
      await modal
        .locator('.ant-form-item')
        .filter({ hasText: '优先级' })
        .locator('.ant-select-selector')
        .click();
      await this.page
        .locator('.ant-select-item-option')
        .filter({ hasText: opts.priority })
        .click();
    }

    if (opts.description) {
      await modal.locator('textarea').fill(opts.description);
    }
  }

  /** Full wizard: template mode */
  async createFromTemplate(templateName: string, taskName: string, targetModel: string) {
    await this.openCreateModal();
    await this.selectTemplateMode();
    await this.selectTemplate(templateName);
    await this.clickNext();
    await this.fillBasicInfo({ name: taskName, targetModel });
    await this.clickNext();
    await this.clickNext(); // eval config defaults
    await this.clickSubmit();
  }

  /** Full wizard: custom mode */
  async createCustomTask(opts: {
    name: string;
    evalType: string;
    evalObject: string;
    targetModel: string;
    priority?: string;
    description?: string;
  }) {
    await this.openCreateModal();
    await this.selectCustomMode();
    await this.clickNext();
    await this.fillBasicInfo(opts);
    await this.clickNext();
    await this.clickNext(); // eval config defaults
    await this.clickSubmit();
  }

  // --- Detail modal ---
  async getDetailInfo() {
    const modal = this.page.locator('.ant-modal').last();
    // Wait for descriptions to render
    await modal.locator('.ant-descriptions').first().waitFor({ timeout: 5000 });
    // Use broader selector — Antd 5.x uses different class structures
    const rows = modal.locator('.ant-descriptions-row td');
    const result: Record<string, string> = {};
    const count = await rows.count();
    for (let i = 0; i < count - 1; i += 2) {
      const label = await rows.nth(i).textContent();
      const value = await rows.nth(i + 1).textContent();
      if (label?.trim()) result[label.trim()] = value?.trim() || '';
    }
    // Fallback: try the item-based approach
    if (Object.keys(result).length === 0) {
      const items = modal.locator('[class*="descriptions-item"]');
      const itemCount = await items.count();
      for (let i = 0; i < itemCount; i++) {
        const el = items.nth(i);
        const label = await el.locator('[class*="item-label"]').textContent().catch(() => null);
        const value = await el.locator('[class*="item-content"]').textContent().catch(() => null);
        if (label?.trim()) result[label.trim()] = value?.trim() || '';
      }
    }
    return result;
  }

  async closeDetailModal() {
    await this.page.locator('.ant-modal .ant-modal-close').last().click();
    await this.page.waitForTimeout(300);
  }

  // --- Row selection for batch ops ---
  async selectRowByIndex(index: number) {
    await this.page
      .locator('.ant-table-row')
      .nth(index)
      .locator('.ant-checkbox-input')
      .check();
    await this.page.waitForTimeout(200);
  }
}
