/**
 * @file ShareModal.test.js
 * @description Tests for ShareModal component and its utility functions
 */
import React from 'react';
import { render, screen, fireEvent, within } from '../../test-utils';
import ShareModal, { getShareSettings } from '../../components/ShareModal';

describe('getShareSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns default settings when no data in localStorage', () => {
    const settings = getShareSettings('asset-1');
    expect(settings).toEqual({ visibility: 'private', shares: [] });
  });

  test('returns stored settings', () => {
    const stored = {
      'asset-1': { visibility: 'team', shares: [{ userId: '1', permissions: ['view'] }] },
    };
    localStorage.setItem('ahvp_share_settings', JSON.stringify(stored));
    
    const settings = getShareSettings('asset-1');
    expect(settings.visibility).toBe('team');
    expect(settings.shares).toHaveLength(1);
  });

  test('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('ahvp_share_settings', 'not-json');
    const settings = getShareSettings('asset-1');
    expect(settings).toEqual({ visibility: 'private', shares: [] });
  });
});

describe('ShareModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('renders modal with share content when visible', () => {
    render(
      <ShareModal visible={true} onClose={mockOnClose} assetId="1" assetName="Test Asset" />
    );
    const elements = screen.getAllByText(/分享/);
    expect(elements.length).toBeGreaterThan(0);
  });

  test('renders visibility options', () => {
    render(
      <ShareModal visible={true} onClose={mockOnClose} assetId="1" assetName="Test Asset" />
    );
    expect(screen.getByText('私有')).toBeInTheDocument();
    expect(screen.getByText('团队可见')).toBeInTheDocument();
    expect(screen.getByText('公开')).toBeInTheDocument();
  });
});
