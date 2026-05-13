/**
 * @file Dashboard.test.js
 * @description Tests for Dashboard page
 */
import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import Dashboard from '../../pages/Dashboard';
import api from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Mock RadarChart
jest.mock('../../components/RadarChart', () => {
  return function MockRadarChart() {
    return <div data-testid="radar-chart">Radar Chart</div>;
  };
});

// Mock HotAssetsCard
jest.mock('../../pages/assets/HotAssetsCard', () => {
  return function MockHotAssetsCard() {
    return <div data-testid="hot-assets">Hot Assets</div>;
  };
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock all dashboard API calls - Dashboard does Promise.all with 8 calls
    api.get.mockImplementation((url) => {
      const resp = (data, total) => Promise.resolve({
        data: { code: 0, data, total: total || 0 },
      });
      if (url === '/tasks') return resp([], 0);
      if (url === '/nodes') return resp([], 0);
      if (url === '/chip-reports') return resp([], 0);
      if (url === '/assets') return resp([], 0);
      if (url === '/plans') return resp([], 0);
      if (url === '/chips') return resp([], 0);
      if (url === '/tasks/queue-status') return resp(null, 0);
      if (url === '/tasks/stalled') return resp([], 0);
      return resp([], 0);
    });
  });

  test('makes API calls on mount', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    // Should have at least 6 API calls
    expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  test('renders quick action cards', async () => {
    render(<Dashboard />);
    // Wait for component to finish loading
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    // Dashboard shows action cards
    const cards = document.querySelectorAll('.ant-card');
    expect(cards.length).toBeGreaterThan(0);
  });
});
