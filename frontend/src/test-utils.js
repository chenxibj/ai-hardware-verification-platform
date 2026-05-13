/**
 * @file test-utils.js
 * @description Custom render with providers for testing
 * Wraps components with Router, AntD ConfigProvider, etc.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

/**
 * Custom render that wraps component with all providers
 */
function customRender(ui, options = {}) {
  const {
    route = '/',
    initialEntries,
    ...renderOptions
  } = options;

  // Use MemoryRouter if initialEntries provided, otherwise BrowserRouter
  const Router = initialEntries ? MemoryRouter : BrowserRouter;
  const routerProps = initialEntries ? { initialEntries } : {};

  // Set window.location for BrowserRouter
  if (!initialEntries && route !== '/') {
    window.history.pushState({}, 'Test page', route);
  }

  function AllProviders({ children }) {
    return (
      <ConfigProvider locale={zhCN}>
        <Router {...routerProps}>
          {children}
        </Router>
      </ConfigProvider>
    );
  }

  return render(ui, { wrapper: AllProviders, ...renderOptions });
}

// Re-export everything
export * from '@testing-library/react';

// Override render method
export { customRender as render };

/**
 * Helper to create a mock auth store state
 */
export function mockAuthState(overrides = {}) {
  const state = {
    token: 'mock-token',
    user: {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      role: 'ENGINEER',
      ...overrides.user,
    },
    isAuthenticated: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
    ...overrides,
  };
  return state;
}

/**
 * Helper to set up localStorage auth state
 */
export function setupAuthLocalStorage(user = null) {
  const defaultUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'ENGINEER',
  };
  const u = user || defaultUser;
  localStorage.setItem('token', 'mock-token');
  localStorage.setItem('user', JSON.stringify(u));
  return u;
}

/**
 * Helper to clear localStorage auth state
 */
export function clearAuthLocalStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

/**
 * Mock API response helper
 */
export function mockApiResponse(data, code = 0, message = 'success') {
  return { data: { code, data, message } };
}

/**
 * Mock API error helper
 */
export function mockApiError(status, message = 'Error') {
  const error = new Error(message);
  error.response = {
    status,
    data: { message },
  };
  error.displayMessage = `[${status}] ${message}`;
  return error;
}

/**
 * Wait for async operations to complete
 */
export async function waitForLoadingToFinish() {
  // Wait for any pending microtasks/promises
  await new Promise((resolve) => setTimeout(resolve, 0));
}
