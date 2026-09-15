export type BoardMenuRole =
  | "signed_out"
  | "personal_owner"
  | "collaboration_owner"
  | "collaboration_editor"
  | "collaboration_viewer";

export type BoardMenuAction =
  | "home"
  | "saveBoard"
  | "renameBoard"
  | "loadScene"
  | "saveToActiveFile"
  | "export"
  | "saveAsImage"
  | "liveCollaboration"
  | "commandPalette"
  | "help"
  | "clearCanvas"
  | "preferences"
  | "toggleTheme"
  | "changeCanvasBackground"
  | "logout";

export type BoardMenuContext = {
  isAuthenticated: boolean;
  hasHomeNavigation: boolean;
  isCollabEnabled: boolean;
  isCollaborating: boolean;
  isCollaborationOwner: boolean;
  isReadOnlySession: boolean;
};

export type BoardMenuPermissions = Record<BoardMenuAction, boolean> & {
  role: BoardMenuRole;
};

export const getBoardMenuRole = ({
  isAuthenticated,
  isCollaborating,
  isCollaborationOwner,
  isReadOnlySession,
}: BoardMenuContext): BoardMenuRole => {
  if (!isAuthenticated) {
    return "signed_out";
  }
  if (!isCollaborating) {
    return "personal_owner";
  }
  if (isReadOnlySession) {
    return "collaboration_viewer";
  }
  if (isCollaborationOwner) {
    return "collaboration_owner";
  }
  return "collaboration_editor";
};

export const getBoardMenuPermissions = (
  context: BoardMenuContext,
): BoardMenuPermissions => {
  const role = getBoardMenuRole(context);
  const canManagePrivateBoard =
    role === "personal_owner" || role === "collaboration_owner";
  const canMutateScene = role !== "signed_out" && role !== "collaboration_viewer";
  const canUseUtilityActions = role !== "signed_out";

  return {
    role,
    home: context.hasHomeNavigation && canUseUtilityActions,
    saveBoard: canManagePrivateBoard,
    renameBoard: canManagePrivateBoard,
    loadScene: canMutateScene,
    saveToActiveFile: canUseUtilityActions,
    export: canUseUtilityActions,
    saveAsImage: canUseUtilityActions,
    liveCollaboration: context.isCollabEnabled && canUseUtilityActions,
    commandPalette: canMutateScene,
    help: canUseUtilityActions,
    clearCanvas: canMutateScene,
    preferences: canUseUtilityActions,
    toggleTheme: canUseUtilityActions,
    changeCanvasBackground: canMutateScene,
    logout: context.isAuthenticated,
  };
};
