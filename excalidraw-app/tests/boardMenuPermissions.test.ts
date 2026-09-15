import {
  getBoardMenuPermissions,
  getBoardMenuRole,
  type BoardMenuContext,
} from "../permissions/boardMenuPermissions";

const baseContext: BoardMenuContext = {
  isAuthenticated: true,
  hasHomeNavigation: true,
  isCollabEnabled: true,
  isCollaborating: false,
  isCollaborationOwner: false,
  isReadOnlySession: false,
};

describe("board menu permissions", () => {
  it("allows personal board owners to save and rename", () => {
    const permissions = getBoardMenuPermissions(baseContext);

    expect(getBoardMenuRole(baseContext)).toBe("personal_owner");
    expect(permissions.saveBoard).toBe(true);
    expect(permissions.renameBoard).toBe(true);
    expect(permissions.clearCanvas).toBe(true);
  });

  it("allows collaboration owners to save and rename", () => {
    const permissions = getBoardMenuPermissions({
      ...baseContext,
      isCollaborating: true,
      isCollaborationOwner: true,
    });

    expect(permissions.role).toBe("collaboration_owner");
    expect(permissions.saveBoard).toBe(true);
    expect(permissions.renameBoard).toBe(true);
  });

  it("hides private-board actions from collaboration guests", () => {
    const permissions = getBoardMenuPermissions({
      ...baseContext,
      isCollaborating: true,
      isCollaborationOwner: false,
    });

    expect(permissions.role).toBe("collaboration_editor");
    expect(permissions.saveBoard).toBe(false);
    expect(permissions.renameBoard).toBe(false);
    expect(permissions.clearCanvas).toBe(true);
  });

  it("hides scene-mutating actions from read-only collaborators", () => {
    const permissions = getBoardMenuPermissions({
      ...baseContext,
      isCollaborating: true,
      isReadOnlySession: true,
    });

    expect(permissions.role).toBe("collaboration_viewer");
    expect(permissions.saveBoard).toBe(false);
    expect(permissions.renameBoard).toBe(false);
    expect(permissions.loadScene).toBe(false);
    expect(permissions.clearCanvas).toBe(false);
    expect(permissions.changeCanvasBackground).toBe(false);
    expect(permissions.export).toBe(true);
  });
});
