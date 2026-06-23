if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}
