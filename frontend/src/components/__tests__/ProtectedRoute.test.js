/**
 * @file ProtectedRoute.test.js
 * @description Tests for ProtectedRoute component — role-based access control
 */
import React from 'react';
import { render, screen, fireEvent } from '../../test-utils';
import ProtectedRoute from '../../components/ProtectedRoute';
import useAuthStore from '../../stores/useAuthStore';

jest.mock('../../stores/useAuthStore');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders children when no roles restriction', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'USER' } }));
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  test('renders children when user has matching role', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'ADMIN' } }));
    render(
      <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  test('shows 403 when user role does not match', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'USER' } }));
    render(
      <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('无访问权限')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  test('shows current role in 403 message', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'ENGINEER' } }));
    render(
      <ProtectedRoute roles={['ADMIN']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText(/ENGINEER/)).toBeInTheDocument();
  });

  test('shows "返回首页" button on 403 that navigates to /', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'USER' } }));
    render(
      <ProtectedRoute roles={['ADMIN']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );
    const button = screen.getByRole('button', { name: '返回首页' });
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('renders children when roles is empty array', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: { role: 'USER' } }));
    render(
      <ProtectedRoute roles={[]}>
        <div>Accessible Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Accessible Content')).toBeInTheDocument();
  });

  test('handles null user gracefully', () => {
    useAuthStore.mockImplementation((sel) => sel({ user: null }));
    render(
      <ProtectedRoute roles={['ADMIN']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('无访问权限')).toBeInTheDocument();
  });
});
