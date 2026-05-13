/**
 * @file NotFound.test.js
 * @description Tests for NotFound (404) page
 */
import React from 'react';
import { render, screen, fireEvent } from '../../test-utils';
import NotFound from '../../pages/NotFound';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('NotFound Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders 404 title', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  test('renders description message', () => {
    render(<NotFound />);
    expect(screen.getByText('抱歉，您访问的页面不存在')).toBeInTheDocument();
  });

  test('renders "返回首页" button', () => {
    render(<NotFound />);
    expect(screen.getByRole('button', { name: '返回首页' })).toBeInTheDocument();
  });

  test('navigates to / on button click', () => {
    render(<NotFound />);
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
