import '@testing-library/jest-dom';

// cmdk uses ResizeObserver and scrollIntoView internally; jsdom does not implement them
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.HTMLElement.prototype.scrollIntoView = function () {};
