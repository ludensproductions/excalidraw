import { renderHook } from "@testing-library/react";

import { activeBoardAtom, appJotaiStore } from "../app-jotai";
import { dashboardState } from "../dashboardState";
import {
  getAutoSaveSceneData,
  resolveAutoSaveTargetBoardId,
  useAutoSaveBoard,
} from "../hooks/useAutoSaveBoard";

import type { AutoSaveSnapshot } from "../hooks/useAutoSaveBoard";

const mocks = vi.hoisted(() => ({
  save: vi.fn<
    (
      data: { elements: Array<{ id: string }>; files: unknown },
      id?: string,
    ) => Promise<{ id?: string; name: string }>
  >(),
}));

vi.mock("../data/DrawingsStore", () => ({
  DrawingsStore: { save: mocks.save },
}));

// the thumbnail is optional; jsdom can't draw it
vi.mock("@excalidraw/excalidraw", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@excalidraw/excalidraw")>()),
  exportToBlob: vi.fn().mockRejectedValue(new Error("no canvas")),
}));

describe("resolveAutoSaveTargetBoardId", () => {
  const createId = vi.fn(() => "generated-id");

  beforeEach(() => {
    createId.mockClear();
  });

  it("does not create a private copy for a collaboration owner without an active private board", () => {
    const target = resolveAutoSaveTargetBoardId({
      activeBoardId: null,
      storeBoardId: null,
      ensuredBoardId: null,
      isCollaborating: true,
      isCollaborationOwner: true,
      isReadOnlySession: false,
      createId,
    });

    expect(target).toBeNull();
    expect(createId).not.toHaveBeenCalled();
  });

  it("uses the active private board when the collaboration belongs to it", () => {
    const target = resolveAutoSaveTargetBoardId({
      activeBoardId: "board-1",
      storeBoardId: null,
      ensuredBoardId: null,
      isCollaborating: true,
      isCollaborationOwner: true,
      isReadOnlySession: false,
      createId,
    });

    expect(target).toEqual({ id: "board-1", created: false });
    expect(createId).not.toHaveBeenCalled();
  });

  it("creates a draft id only for non-collaboration autosave sessions", () => {
    const target = resolveAutoSaveTargetBoardId({
      activeBoardId: null,
      storeBoardId: null,
      ensuredBoardId: null,
      isCollaborating: false,
      isCollaborationOwner: false,
      isReadOnlySession: false,
      createId,
    });

    expect(target).toEqual({ id: "generated-id", created: true });
    expect(createId).toHaveBeenCalledTimes(1);
  });
});

describe("getAutoSaveSceneData (RD-512)", () => {
  const snapshot = (
    elements: Array<{ id: string; isDeleted: boolean }>,
    isLoading = false,
  ) =>
    ({
      elements,
      appState: { isLoading, viewBackgroundColor: "#fff" },
      files: { f1: { id: "f1" } },
    } as unknown as AutoSaveSnapshot);

  it("skips saving before the editor reported any scene", () => {
    expect(getAutoSaveSceneData(null)).toBeNull();
  });

  it("skips saving while the scene is still loading", () => {
    expect(getAutoSaveSceneData(snapshot([], true))).toBeNull();
  });

  it("leaves deleted elements out", () => {
    const data = getAutoSaveSceneData(
      snapshot([
        { id: "a", isDeleted: false },
        { id: "b", isDeleted: true },
      ]),
    );
    expect(data?.elements.map((e) => e.id)).toEqual(["a"]);
    expect(Object.keys(data!.files)).toEqual(["f1"]);
  });
});

describe("useAutoSaveBoard (RD-512)", () => {
  const scene = (id: string) =>
    ({
      elements: [{ id, isDeleted: false }],
      appState: { isLoading: false, viewBackgroundColor: "#fff" },
      files: { f1: { id: "f1" } },
    } as unknown as AutoSaveSnapshot);

  const savedIds = () =>
    mocks.save.mock.calls.map(([data]) => data.elements.map((e) => e.id));

  let finishSave: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    finishSave = [];
    mocks.save.mockReset();
    mocks.save.mockImplementation(
      (_data, id) =>
        new Promise((resolve) => {
          finishSave.push(() => resolve({ id, name: "Board" }));
        }),
    );
    dashboardState.setAutoSaveSuppressed(false);
    appJotaiStore.set(activeBoardAtom, { id: "board-1", name: "Board" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  it("going back waits for the save queued behind a slow one", async () => {
    const { result, unmount } = renderHook(() => useAutoSaveBoard());
    result.current.scheduleAutoSave(scene("first"));
    await tick(3000);
    expect(savedIds()).toEqual([["first"]]);

    result.current.scheduleAutoSave(scene("second"));
    let wentBack = false;
    const back = result.current.flushAutoSave().then(() => {
      wentBack = true;
    });

    finishSave[0]();
    await tick();
    expect(savedIds()).toEqual([["first"], ["second"]]);
    expect(wentBack).toBe(false);

    finishSave[1]();
    await back;
    expect(wentBack).toBe(true);
    unmount();
  });

  it("saves the last scene, not an empty one, when it unmounts mid-save", async () => {
    const { result, unmount } = renderHook(() => useAutoSaveBoard());
    result.current.scheduleAutoSave(scene("first"));
    await tick(3000);

    result.current.scheduleAutoSave(scene("second"));
    unmount();
    let opened = false;
    const open = dashboardState.waitForPendingSaves().then(() => {
      opened = true;
    });

    finishSave[0]();
    await tick();
    expect(savedIds()).toEqual([["first"], ["second"]]);
    expect(mocks.save.mock.calls[1][0].files).toEqual({ f1: { id: "f1" } });
    expect(mocks.save.mock.calls[1][1]).toBe("board-1");
    expect(opened).toBe(false);

    finishSave[1]();
    await open;
    expect(opened).toBe(true);
  });

  it("keeps saving after a save fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("network"));
    const { result, unmount } = renderHook(() => useAutoSaveBoard());
    result.current.scheduleAutoSave(scene("first"));
    await tick(3000);
    result.current.scheduleAutoSave(scene("second"));
    await tick(3000);
    expect(savedIds()).toEqual([["first"], ["second"]]);
    finishSave[0]();
    await tick();
    unmount();
  });
});

describe("dashboardState.waitForPendingSaves", () => {
  it("waits for saves started before and while waiting", async () => {
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    }).then(() => {
      order.push("first");
      const second = Promise.resolve().then(() => {
        order.push("second");
      });
      dashboardState.trackPendingSave(second);
    });
    dashboardState.trackPendingSave(first);

    const waiting = dashboardState.waitForPendingSaves().then(() => {
      order.push("open");
    });
    finishFirst();
    await waiting;

    expect(order).toEqual(["first", "second", "open"]);
  });

  it("does not hang on a failed save", async () => {
    const failed = Promise.reject(new Error("network"));
    dashboardState.trackPendingSave(failed);
    failed.catch(() => {});
    await expect(dashboardState.waitForPendingSaves()).resolves.toBeUndefined();
  });
});
