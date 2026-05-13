/**
 * @file Settings.test.js
 * @description Tests for Settings page
 */
import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import Settings from '../../pages/Settings';
import { healthApi } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  healthApi: {
    check: jest.fn(),
  },
}));

describe('Settings Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({
      id: 1, username: 'testuser', email: 'test@example.com', role: 'ADMIN',
    }));

    healthApi.check.mockResolvedValue({
      data: {
        status: 'UP',
        components: {},
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('renders system info section', async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText(/系统信息/i)).toBeInTheDocument();
    });
  });

  test('renders platform name', async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(screen.getByText(/人工智能软硬件验证平台/i)).toBeInTheDocument();
    });
  });

  test('calls health check on mount', async () => {
    render(<Settings />);
    await waitFor(() => {
      expect(healthApi.check).toHaveBeenCalled();
    });
  });
});
