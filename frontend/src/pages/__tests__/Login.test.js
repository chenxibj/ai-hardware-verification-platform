/**
 * @file Login.test.js
 * @description Tests for Login page component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import Login from '../../pages/Login';
import useAuthStore from '../../stores/useAuthStore';

// Mock useAuthStore
jest.mock('../../stores/useAuthStore');

// Mock Register and ForgotPassword to avoid their full rendering
jest.mock('../../pages/Register', () => {
  return function MockRegister({ onSwitchToLogin }) {
    return (
      <div data-testid="register-page">
        <button onClick={onSwitchToLogin}>返回登录</button>
      </div>
    );
  };
});

jest.mock('../../pages/ForgotPassword', () => {
  return function MockForgotPassword({ onSwitchToLogin }) {
    return (
      <div data-testid="forgot-page">
        <button onClick={onSwitchToLogin}>返回登录</button>
      </div>
    );
  };
});

describe('Login Page', () => {
  const mockLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.mockImplementation((selector) => {
      const state = { login: mockLogin };
      return selector(state);
    });
  });

  test('renders login form with title', () => {
    render(<Login />);
    expect(screen.getByText('欢迎登录')).toBeInTheDocument();
    expect(screen.getByText('AI Hardware Verification Platform')).toBeInTheDocument();
  });

  test('renders email and password inputs', () => {
    render(<Login />);
    expect(screen.getByPlaceholderText('邮箱')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('密码')).toBeInTheDocument();
  });

  test('renders login button', () => {
    render(<Login />);
    expect(screen.getByRole('button', { name: /登 录/i })).toBeInTheDocument();
  });

  test('renders register and forgot password links', () => {
    render(<Login />);
    expect(screen.getByText('立即注册')).toBeInTheDocument();
    expect(screen.getByText('忘记密码？')).toBeInTheDocument();
  });

  test('renders product features section', () => {
    render(<Login />);
    expect(screen.getByText('多层级评测')).toBeInTheDocument();
    expect(screen.getByText('自动化执行')).toBeInTheDocument();
    expect(screen.getByText('精度与性能')).toBeInTheDocument();
    expect(screen.getByText('报告与榜单')).toBeInTheDocument();
  });

  test('switches to register page', () => {
    render(<Login />);
    fireEvent.click(screen.getByText('立即注册'));
    expect(screen.getByTestId('register-page')).toBeInTheDocument();
  });

  test('switches to forgot password page', () => {
    render(<Login />);
    fireEvent.click(screen.getByText('忘记密码？'));
    expect(screen.getByTestId('forgot-page')).toBeInTheDocument();
  });

  test('switches back to login from register', () => {
    render(<Login />);
    fireEvent.click(screen.getByText('立即注册'));
    expect(screen.getByTestId('register-page')).toBeInTheDocument();
    fireEvent.click(screen.getByText('返回登录'));
    expect(screen.getByText('欢迎登录')).toBeInTheDocument();
  });

  test('shows validation error when email is empty', async () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: /登 录/i }));
    await waitFor(() => {
      expect(screen.getByText('请输入邮箱')).toBeInTheDocument();
    });
  });

  test('shows validation error for invalid email format', async () => {
    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText('邮箱'), { target: { value: 'notanemail' } });
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /登 录/i }));
    await waitFor(() => {
      expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
    });
  });

  test('calls login on valid form submit', async () => {
    mockLogin.mockResolvedValueOnce({ success: true });
    render(<Login />);
    
    fireEvent.change(screen.getByPlaceholderText('邮箱'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: /登 录/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'Password123');
    });
  });

  test('displays lock info when account is locked', async () => {
    mockLogin.mockResolvedValueOnce({ success: false, message: '账户已锁定，请30分钟后重试' });
    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText('邮箱'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /登 录/i }));

    await waitFor(() => {
      expect(screen.getByText(/账户已锁定/)).toBeInTheDocument();
    });
  });
});
