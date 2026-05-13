/**
 * @file RadarChart.test.js
 * @description Tests for RadarChart component
 */
import React from 'react';
import { render } from '@testing-library/react';

// Mock echarts-for-react
jest.mock('echarts-for-react', () => {
  return function MockReactECharts(props) {
    return <div data-testid="echarts-mock" data-option={JSON.stringify(props.option)} />;
  };
});

import RadarChart from '../../components/RadarChart';

describe('RadarChart', () => {
  test('renders without crashing with default props', () => {
    const { getByTestId } = render(<RadarChart />);
    expect(getByTestId('echarts-mock')).toBeInTheDocument();
  });

  test('renders with single dataset', () => {
    const data = [
      { dimension: '计算', score: 85 },
      { dimension: '访存', score: 72 },
      { dimension: '通信', score: 90 },
    ];
    const { getByTestId } = render(<RadarChart data={data} />);
    const option = JSON.parse(getByTestId('echarts-mock').getAttribute('data-option'));
    expect(option.series).toBeDefined();
  });

  test('renders with multi datasets', () => {
    const datasets = [
      { name: 'Chip A', data: [{ dimension: '计算', score: 85 }], color: '#f00' },
      { name: 'Chip B', data: [{ dimension: '计算', score: 92 }], color: '#0f0' },
    ];
    const { getByTestId } = render(<RadarChart datasets={datasets} />);
    const option = JSON.parse(getByTestId('echarts-mock').getAttribute('data-option'));
    expect(option.series).toBeDefined();
  });

  test('handles empty data gracefully', () => {
    const { getByTestId } = render(<RadarChart data={[]} />);
    expect(getByTestId('echarts-mock')).toBeInTheDocument();
  });

  test('uses custom height', () => {
    const { getByTestId } = render(<RadarChart height={600} />);
    expect(getByTestId('echarts-mock')).toBeInTheDocument();
  });
});
