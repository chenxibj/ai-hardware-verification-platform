/**
 * @file ReportList.test.js
 * @description Tests for ReportList page
 */
import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import ReportList from '../../pages/ReportList';
import api from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('ReportList Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/chip-reports') {
        return Promise.resolve({
          data: {
            code: 0,
            data: [
              {
                id: 1,
                reportNo: 'RPT-001',
                chipId: 10,
                overallScore: 85.2,
                status: 'PUBLISHED',
                createdAt: '2026-05-10',
              },
            ],
            total: 1,
          },
        });
      }
      if (url.startsWith('/chips/')) {
        return Promise.resolve({ data: { code: 0, data: { id: 10, name: 'A100' } } });
      }
      return Promise.resolve({ data: { code: 0, data: [] } });
    });
  });

  test('renders report list page', async () => {
    render(<ReportList />);
    await waitFor(() => {
      expect(screen.getByText(/评测报告/i)).toBeInTheDocument();
    });
  });

  test('fetches reports on mount', async () => {
    render(<ReportList />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/chip-reports', expect.any(Object));
    });
  });

  test('renders report data', async () => {
    render(<ReportList />);
    await waitFor(() => {
      expect(screen.getByText('RPT-001')).toBeInTheDocument();
    });
  });

  test('renders search input', () => {
    render(<ReportList />);
    const searchInputs = screen.getAllByRole('textbox');
    expect(searchInputs.length).toBeGreaterThan(0);
  });
});
