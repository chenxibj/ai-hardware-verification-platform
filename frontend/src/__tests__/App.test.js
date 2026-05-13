/**
 * @file App.test.js
 * @description Tests for App.js — main application routing
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import App from '../App';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('shows Login when not authenticated', () => {
    render(
      <BrowserRouter>
        <ConfigProvider>
          <App />
        </ConfigProvider>
      </BrowserRouter>
    );
    expect(screen.getByText('欢迎登录')).toBeInTheDocument();
  });
});
