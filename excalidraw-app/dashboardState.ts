import type { DrawingRecord } from "./data/DrawingsStore";

let _onBack: (() => void) | null = null;
let _pendingBoard: DrawingRecord | null = null;
let _flushAutoSave: (() => Promise<void>) | null = null;

export const dashboardState = {
  setOnBack(cb: (() => void) | null): void {
    _onBack = cb;
  },
  getOnBack(): (() => void) | null {
    return _onBack;
  },
  setFlushAutoSave(fn: (() => Promise<void>) | null): void {
    _flushAutoSave = fn;
  },
  async flushAutoSave(): Promise<void> {
    if (_flushAutoSave) {
      try {
        await _flushAutoSave();
      } catch {
        // best effort
      }
    }
  },
  setPendingBoard(r: DrawingRecord | null): void {
    _pendingBoard = r;
  },
  consumePendingBoard(): DrawingRecord | null {
    const board = _pendingBoard;
    _pendingBoard = null;
    return board;
  },
};
