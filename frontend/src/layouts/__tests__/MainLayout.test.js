/**
 * @file MainLayout.test.js
 * @description Tests for MainLayout component
 */
import React from 'react';
import { render, screen, fireEvent } from '../../test-utils';
import MainLayout from '../../layouts/MainLayout';
import useAuthStore from '../../stores/useAuthStore';
import useNotificationStore from '../../stores/useNotificationStore';

jest.mock('../../stores/useAuthStore');
jest.mock('../../stores/useNotificationStore');

// Mock logo import
jest.mock('../../assets/logo.svg', () => 'logo.svg');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/' }),
}));

describe('MainLayout', () => {
  const mockLogout = jest.fn();
  const mockUser = { id: 1, username: 'testuser', email: 'test@example.com', role: 'ADMIN' };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.mockImplementation((sel) => {
      const state = { user: mockUser, logout: mockLogout };
      return sel(state);
    });
    useNotificationStore.mockImplementation((sel) => {
      const state = { unreadCount: 3 };
      return sel(state);
    });
  });

  test('renders sidebar with logo text', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText('AI软硬件验证')).toBeInTheDocument();
  });

  test('renders children content', () => {
    render(<MainLayout><div>Test Content</div></MainLayout>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  test('renders username in header', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  test('renders footer with copyright', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText(/人工智能软硬件验证平台/)).toBeInTheDocument();
    expect(screen.getByText(/上海人工智能实验室/)).toBeInTheDocument();
  });

  test('renders Dashboard menu item', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('renders evaluation center menu group', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText('评测中心')).toBeInTheDocument();
  });

  test('renders system settings for admin user', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.getByText('系统设置')).toBeInTheDocument();
  });

  test('hides system settings for non-admin user', () => {
    const normalUser = { ...mockUser, role: 'ENGINEER' };
    useAuthStore.mockImplementation((sel) => {
      const state = { user: normalUser, logout: mockLogout };
      return sel(state);
    });
    render(<MainLayout><div>Content</div></MainLayout>);
    expect(screen.queryByText('系统设置')).not.toBeInTheDocument();
  });

  test('toggle sidebar collapse button exists', () => {
    render(<MainLayout><div>Content</div></MainLayout>);
    // The collapse toggle button should be in the header
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
