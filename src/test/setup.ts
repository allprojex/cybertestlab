import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom polyfills required by Radix UI / shadcn primitives
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverMock;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!(window as any).PointerEvent) {
  (window as any).PointerEvent = class PointerEvent extends MouseEvent {} as any;
}
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
