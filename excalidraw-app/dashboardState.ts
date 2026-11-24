import type { DrawingRecord } from "./data/DrawingsStore";

let _onBack: (() => void) | null = null;
let _pendingBoard: DrawingRecord | null = null;
let _flushAutoSave: (() => Promise<void>) | null = null;
let _autoSaveSuppressed = false;
const _pendingSaves = new Set<Promise<unknown>>();

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
  trackPendingSave(save: Promise<unknown>): void {
    _pendingSaves.add(save);
    const done = () => _pendingSaves.delete(save);
    save.then(done, done);
  },
  async waitForPendingSaves(): Promise<void> {
    while (_pendingSaves.size) {
      await Promise.allSettled([..._pendingSaves]);
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
