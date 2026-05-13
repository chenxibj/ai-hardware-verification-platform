/**
 * @file useTaskData.test.js
 * @description Tests for useTaskData custom hook
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useTaskData from '../../hooks/useTaskData';
import api from '../../utils/api';

// Mock api
jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock axios for agentApi
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  })),
}));

// Mock antd message and Modal
jest.mock('antd', () => ({
  message: {
    success: jest.fn(),
    error: jest.fn(),
  },
  Modal: {
    confirm: jest.fn(({ onOk }) => onOk && onOk()),
  },
}));

describe('useTaskData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock responses
    api.get.mockResolvedValue({ data: { code: 0, data: [] } });
    api.post.mockResolvedValue({ data: { code: 0 } });
  });

  test('initializes with default state', () => {
    const { result } = renderHook(() => useTaskData());
    
    expect(result.current.tasks).toEqual([]);
    expect(result.current.loading).toBe(true); // initial fetch triggers loading
    expect(result.current.stats).toEqual({});
    expect(result.current.statusFilter).toBeNull();
    expect(result.current.searchText).toBe('');
    expect(result.current.selectedKeys).toEqual([]);
  });

  test('fetches tasks on mount', async () => {
    const mockTasks = [
      { id: 1, name: 'Task 1', status: 'RUNNING' },
      { id: 2, name: 'Task 2', status: 'COMPLETED' },
    ];
    api.get.mockImplementation((url) => {
      if (url === '/tasks') return Promise.resolve({ data: { code: 0, data: mockTasks } });
      return Promise.resolve({ data: { code: 0, data: [] } });
    });

    const { result } = renderHook(() => useTaskData());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.tasks).toEqual(mockTasks);
  });

  test('setStatusFilter updates filter', () => {
    const { result } = renderHook(() => useTaskData());
    
    act(() => {
      result.current.setStatusFilter('RUNNING');
    });
    
    expect(result.current.statusFilter).toBe('RUNNING');
  });

  test('setSearchText updates search', () => {
    const { result } = renderHook(() => useTaskData());
    
    act(() => {
      result.current.setSearchText('test query');
    });
    
    expect(result.current.searchText).toBe('test query');
  });

  test('setSelectedKeys updates selection', () => {
    const { result } = renderHook(() => useTaskData());
    
    act(() => {
      result.current.setSelectedKeys([1, 2, 3]);
    });
    
    expect(result.current.selectedKeys).toEqual([1, 2, 3]);
  });

  test('handleRetry calls correct endpoint', async () => {
    api.post.mockResolvedValueOnce({ data: { code: 0 } });
    const { result } = renderHook(() => useTaskData());
    
    await act(async () => {
      await result.current.handleRetry(5);
    });
    
    expect(api.post).toHaveBeenCalledWith('/tasks/5/retry');
  });
});
