// Simple event bus for pin changes so sidebar and dashboard stay in sync
const listeners = new Set();

export function onPinChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitPinChange() {
  listeners.forEach(fn => fn());
}
