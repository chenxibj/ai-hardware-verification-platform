/**
 * @file NodeList.test.js
 * @description Tests for NodeList page (simpler test - just check rendering)
 */
import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import api from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('NodeList Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/nodes') {
        return Promise.resolve({
          data: {
            code: 0,
            data: [
              { id: 1, name: 'node-1', status: 'ONLINE', gpuModel: 'A100', tags: '{}', type: 'GPU' },
            ],
          },
        });
      }
      if (url === '/resource-pools') {
        return Promise.resolve({ data: { code: 0, data: [] } });
      }
      return Promise.resolve({ data: { code: 0, data: [] } });
    });
  });

  test('NodeList lazy loading - import succeeds', async () => {
    // NodeList has complex dependencies - verify it can be imported
    const NodeList = (await import('../../pages/NodeList')).default;
    expect(NodeList).toBeDefined();
  });

  test('fetches nodes on mount', async () => {
    const NodeList = (await import('../../pages/NodeList')).default;
    render(<NodeList />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
  });
});
