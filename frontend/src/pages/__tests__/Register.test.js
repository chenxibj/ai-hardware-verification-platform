/**
 * @file Register.test.js
 * @description Tests for Register page
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import Register from '../../pages/Register';
import api from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('Register Page', () => {
  const mockSwitchToLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders registration form title', () => {
    render(<Register onSwitchToLogin={mockSwitchToLogin} />);
    expect(screen.getByText('注册账号')).toBeInTheDocument();
  });

  test('renders all required form fields', () => {
    render(<Register onSwitchToLogin={mockSwitchToLogin} />);
    expect(screen.getByPlaceholderText(/用户名/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/邮箱/i)).toBeInTheDocument();
  });

  test('renders "已有账号？" link that calls onSwitchToLogin', () => {
    render(<Register onSwitchToLogin={mockSwitchToLogin} />);
    const loginLink = screen.getByText(/登录/);
    expect(loginLink).toBeInTheDocument();
  });

  test('shows validation for empty username', async () => {
    render(<Register onSwitchToLogin={mockSwitchToLogin} />);
    const submitButton = screen.getByRole('button', { name: /注 册|注册/i });
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText('请输入用户名')).toBeInTheDocument();
    });
  });
});
