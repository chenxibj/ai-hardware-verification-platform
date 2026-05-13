/**
 * @file routes.test.js
 * @description Tests for src/config/routes.js — route configuration and helpers
 */
import React from 'react';
import {
  routeConfig,
  flattenRoutes,
  generateMenuItems,
  findActiveKey,
  findOpenKeys,
  findBreadcrumb,
} from '../../config/routes';

describe('routeConfig', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(routeConfig)).toBe(true);
    expect(routeConfig.length).toBeGreaterThan(0);
  });

  test('dashboard is the first entry with path /', () => {
    expect(routeConfig[0].key).toBe('dashboard');
    expect(routeConfig[0].path).toBe('/');
  });

  test('each leaf route has key, path, component, and testId', () => {
    const flat = flattenRoutes(routeConfig);
    flat.forEach((route) => {
      expect(route.key).toBeDefined();
      expect(route.path).toBeDefined();
      expect(route.component).toBeDefined();
      expect(route.testId).toBeDefined();
    });
  });
});

describe('flattenRoutes', () => {
  test('returns array of leaf routes', () => {
    const flat = flattenRoutes(routeConfig);
    expect(flat.length).toBeGreaterThan(10);
    // All should have path and component
    flat.forEach((r) => {
      expect(r.path).toBeTruthy();
      expect(r.component).toBeDefined();
    });
  });

  test('does not include group entries without path', () => {
    const flat = flattenRoutes(routeConfig);
    flat.forEach((r) => {
      expect(r.path).not.toBeUndefined();
    });
  });

  test('includes nested children routes', () => {
    const flat = flattenRoutes(routeConfig);
    const chipRoute = flat.find((r) => r.key === 'chips');
    expect(chipRoute).toBeDefined();
    expect(chipRoute.path).toBe('/chips');
  });
});

describe('generateMenuItems', () => {
  test('generates menu items array', () => {
    const items = generateMenuItems(routeConfig);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('excludes hidden routes', () => {
    const items = generateMenuItems(routeConfig);
    const allKeys = [];
    items.forEach((item) => {
      allKeys.push(item.key);
      if (item.children) {
        item.children.forEach((c) => allKeys.push(c.key));
      }
    });
    // chip-profile is hidden, should not appear
    expect(allKeys).not.toContain('/chips/:id');
  });

  test('includes dashboard', () => {
    const items = generateMenuItems(routeConfig);
    const dashboard = items.find((i) => i.key === '/');
    expect(dashboard).toBeDefined();
    expect(dashboard.label).toBe('Dashboard');
  });

  test('groups have children', () => {
    const items = generateMenuItems(routeConfig);
    const evalCenter = items.find((i) => i.key === 'eval-center');
    expect(evalCenter).toBeDefined();
    expect(evalCenter.children.length).toBeGreaterThan(0);
  });
});

describe('findActiveKey', () => {
  test('exact match for /', () => {
    expect(findActiveKey(routeConfig, '/')).toBe('/');
  });

  test('exact match for /chips', () => {
    expect(findActiveKey(routeConfig, '/chips')).toBe('/chips');
  });

  test('parameterized route /chips/42 falls back to /chips', () => {
    expect(findActiveKey(routeConfig, '/chips/42')).toBe('/chips');
  });

  test('returns / for unknown path', () => {
    expect(findActiveKey(routeConfig, '/nonexistent')).toBe('/');
  });

  test('exact match for /reports', () => {
    expect(findActiveKey(routeConfig, '/reports')).toBe('/reports');
  });
});

describe('findOpenKeys', () => {
  test('returns eval-center for /chips', () => {
    const keys = findOpenKeys(routeConfig, '/chips');
    expect(keys).toContain('eval-center');
  });

  test('returns eval-center for /chips/42 (param route)', () => {
    const keys = findOpenKeys(routeConfig, '/chips/42');
    expect(keys).toContain('eval-center');
  });

  test('returns resource-mgmt for /nodes', () => {
    const keys = findOpenKeys(routeConfig, '/nodes');
    expect(keys).toContain('resource-mgmt');
  });

  test('returns empty array for /', () => {
    const keys = findOpenKeys(routeConfig, '/');
    expect(keys).toEqual([]);
  });

  test('returns sys-settings for /admin/users', () => {
    const keys = findOpenKeys(routeConfig, '/admin/users');
    expect(keys).toContain('sys-settings');
  });
});

describe('findBreadcrumb', () => {
  test('returns breadcrumb for /chips', () => {
    const bc = findBreadcrumb(routeConfig, '/chips');
    expect(bc.length).toBeGreaterThanOrEqual(2);
    expect(bc[0].title).toBe('评测中心');
    expect(bc[1].title).toBe('芯片管理');
  });

  test('returns breadcrumb for param route /chips/42', () => {
    const bc = findBreadcrumb(routeConfig, '/chips/42');
    expect(bc.length).toBeGreaterThanOrEqual(2);
  });

  test('returns default breadcrumb for unknown path', () => {
    const bc = findBreadcrumb(routeConfig, '/unknown-page');
    expect(bc).toEqual([{ title: '页面' }]);
  });

  test('returns breadcrumb for /nodes', () => {
    const bc = findBreadcrumb(routeConfig, '/nodes');
    expect(bc[0].title).toBe('资源管理');
    expect(bc[1].title).toBe('节点管理');
  });
});
