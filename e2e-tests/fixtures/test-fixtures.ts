import { test as base } from '@playwright/test';
import { TasksPage, TaskApiHelper } from '../pages/tasks.page';
import { LoginPage } from '../pages/login.page';
import { AppNavigation, ResourcesPage } from '../pages/resources.page';

export const TEST_USER = {
  email: 'test@ahvp.com',
  password: 'test123',
};

type Fixtures = {
  tasksPage: TasksPage;
  loginPage: LoginPage;
  nav: AppNavigation;
  resourcesPage: ResourcesPage;
  api: TaskApiHelper;
};

export const test = base.extend<Fixtures>({
  tasksPage: async ({ page }, use) => {
    await use(new TasksPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  nav: async ({ page }, use) => {
    await use(new AppNavigation(page));
  },
  resourcesPage: async ({ page }, use) => {
    await use(new ResourcesPage(page));
  },
  api: async ({ baseURL }, use) => {
    const api = new TaskApiHelper(baseURL!);
    await api.login(TEST_USER.email, TEST_USER.password);
    await use(api);
  },
});

export { expect } from '@playwright/test';
