// Polyfill TextEncoder/TextDecoder for jsdom
import { TextEncoder, TextDecoder } from 'util';
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

// Mock matchMedia for antd responsive components
// IMPORTANT: Use a plain function, not jest.fn().mockImplementation() 
// to prevent jest.restoreAllMocks() from clearing the mock
global.matchMedia = global.matchMedia || function matchMediaPolyfill(query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: function() {},
    removeListener: function() {},
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() { return false; },
  };
};

// Mock getSelection (used by some AntD components)
window.getSelection = window.getSelection || function() {
  return {
    removeAllRanges: function() {},
    addRange: function() {},
  };
};

// Mock IntersectionObserver
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock ResizeObserver
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock scrollTo
window.scrollTo = window.scrollTo || function() {};
Element.prototype.scrollTo = Element.prototype.scrollTo || function() {};
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function() {};

// Suppress specific console warnings in tests
// POLICY: Only suppress React/router framework noise.
// NEVER suppress real errors (Uncaught, destructure, component crashes).
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  // Only suppress React internal warnings that are not actionable
  if (msg.includes('act(')) return;
  if (msg.includes('React Router Future Flag Warning')) return;
  if (msg.includes('Warning: An update to') && msg.includes('not wrapped in act')) return;
  if (msg.includes('Warning: validateDOMNesting')) return;
  // Let all other errors through — they may indicate real bugs
  originalError.call(console, ...args);
};

console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('React Router Future Flag Warning')) return;
  if (msg.includes('componentWillReceiveProps')) return;
  originalWarn.call(console, ...args);
};
