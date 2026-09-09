import '@testing-library/jest-dom';

// cmdk uses ResizeObserver and scrollIntoView internally; jsdom does not implement them
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.HTMLElement.prototype.scrollIntoView = function () {};

// jsdom does not implement URL.createObjectURL / revokeObjectURL; the
// attachment-uploader uses them for client-side thumbnail previews.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = (obj: Blob | MediaSource) =>
    `blob:test/${Math.random().toString(36).slice(2)}`;
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}
