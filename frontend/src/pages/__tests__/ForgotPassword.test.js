/**
 * @file ForgotPassword.test.js
 * @description Tests for ForgotPassword page
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import ForgotPassword from '../../pages/ForgotPassword';

describe('ForgotPassword Page', () => {
  const mockSwitchToLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders title', () => {
    render(<ForgotPassword onSwitchToLogin={mockSwitchToLogin} />);
    expect(screen.getByText('找回密码')).toBeInTheDocument();
  });

  test('renders email input', () => {
    render(<ForgotPassword onSwitchToLogin={mockSwitchToLogin} />);
    expect(screen.getByPlaceholderText('注册邮箱')).toBeInTheDocument();
  });

  test('renders buttons', () => {
    render(<ForgotPassword onSwitchToLogin={mockSwitchToLogin} />);
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThanOrEqual(2);
  });

  test('back to login calls onSwitchToLogin', () => {
    render(<ForgotPassword onSwitchToLogin={mockSwitchToLogin} />);
    const btns = screen.getAllByRole('button');
    // Find the button with ArrowLeft icon + 返回登录
    const backBtn = btns.find(b => b.textContent.includes('返回登录'));
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(mockSwitchToLogin).toHaveBeenCalled();
  });

  test('shows result page after form submit', async () => {
    render(<ForgotPassword onSwitchToLogin={mockSwitchToLogin} />);
    fireEvent.change(screen.getByPlaceholderText('注册邮箱'), { target: { value: 'test@example.com' } });
    // AntD adds space in button text, use form submit
    const form = document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      const matches = screen.getAllByText(/管理员/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
