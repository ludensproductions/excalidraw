import type { DrawingRecord } from "./data/DrawingsStore";

let _onBack: (() => void) | null = null;
let _pendingBoard: DrawingRecord | null = null;
let _flushAutoSave: (() => Promise<void>) | null = null;
let _autoSaveSuppressed = false;

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
    if (_autoSaveSuppressed) {
      return;
    }
    if (_flushAutoSave) {
      try {
        await _flushAutoSave();
      } catch {
        // best effort
      }
    }
  },
  setAutoSaveSuppressed(suppressed: boolean): void {
    _autoSaveSuppressed = suppressed;
  },
  isAutoSaveSuppressed(): boolean {
    return _autoSaveSuppressed;
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
