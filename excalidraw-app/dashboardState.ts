import type { DrawingRecord } from "./data/DrawingsStore";

let _onBack: (() => void) | null = null;
let _pendingBoard: DrawingRecord | null = null;
let _isNewBoard = false;
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
    _isNewBoard = false;
  },
  setNewBoard(): void {
    _pendingBoard = null;
    _isNewBoard = true;
  },
  consumePendingBoard(): { board: DrawingRecord | null; isNew: boolean } {
    const board = _pendingBoard;
    const isNew = _isNewBoard;
    _pendingBoard = null;
    _isNewBoard = false;
    return { board, isNew };
  },
};
