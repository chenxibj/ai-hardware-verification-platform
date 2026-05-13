/**
 * @file ChipList.test.js
 * @description Tests for ChipList page
 */
import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import ChipList from '../../pages/ChipList';
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

describe('ChipList Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'ADMIN' }));

    api.get.mockImplementation((url) => {
      if (url === '/chips') {
        return Promise.resolve({
          data: {
            code: 0,
            data: [
              { id: 1, name: 'NVIDIA A100', chipType: 'GPU', status: 'EVALUATED', manufacturer: 'NVIDIA' },
              { id: 2, name: 'Ascend 910B', chipType: 'NPU', status: 'EVALUATING', manufacturer: 'Huawei' },
            ],
            total: 2,
          },
        });
      }
      return Promise.resolve({ data: { code: 0, data: [], total: 0 } });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('fetches chips on mount', async () => {
    render(<ChipList />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/chips', expect.any(Object));
    });
  });

  test('renders chip data in table', async () => {
    render(<ChipList />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA A100')).toBeInTheDocument();
    });
  });

  test('renders chip type tags', async () => {
    render(<ChipList />);
    await waitFor(() => {
      expect(screen.getByText('GPU')).toBeInTheDocument();
    });
  });
});
