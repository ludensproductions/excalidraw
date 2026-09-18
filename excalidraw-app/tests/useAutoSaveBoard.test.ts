import { resolveAutoSaveTargetBoardId } from "../hooks/useAutoSaveBoard";

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
