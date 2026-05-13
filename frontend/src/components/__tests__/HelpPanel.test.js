/**
 * @file HelpPanel.test.js
 * @description Tests for HelpPanel component
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HelpPanel from '../../components/HelpPanel';
import api from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('HelpPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders help float button', () => {
    render(<HelpPanel />);
    // FloatButton renders with a tooltip "帮助"
    const button = document.querySelector('.ant-float-btn');
    expect(button).toBeInTheDocument();
  });

  test('opens drawer on button click', async () => {
    render(<HelpPanel />);
    const button = document.querySelector('.ant-float-btn');
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('帮助中心')).toBeInTheDocument();
      expect(screen.getByText('常见问题')).toBeInTheDocument();
    });
  });

  test('renders FAQ items', async () => {
    render(<HelpPanel />);
    fireEvent.click(document.querySelector('.ant-float-btn'));
    await waitFor(() => {
      expect(screen.getByText('如何创建评测任务？')).toBeInTheDocument();
      expect(screen.getByText('如何查看评测报告？')).toBeInTheDocument();
      expect(screen.getByText('如何注册芯片？')).toBeInTheDocument();
    });
  });

  test('renders feedback form', async () => {
    render(<HelpPanel />);
    fireEvent.click(document.querySelector('.ant-float-btn'));
    await waitFor(() => {
      expect(screen.getByText('问题反馈')).toBeInTheDocument();
      expect(screen.getByText('提交反馈')).toBeInTheDocument();
    });
  });
});
