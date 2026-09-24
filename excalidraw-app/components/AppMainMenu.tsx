import { usersIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu, useI18n } from "@excalidraw/excalidraw/index";
import React from "react";

import type { Theme } from "@excalidraw/element/types";

import {
  activeBoardAtom,
  appJotaiStore,
  isReadOnlySessionAtom,
  useAtom,
  useAtomValue,
} from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCurrentUser } from "../auth/authStore";
import {
  activeRoomLinkAtom,
  collabAPIAtom,
  isOwnerAtom,
} from "../collab/Collab";
import { LanguageList } from "../app-language/LanguageList";
import { getCollaborationLinkData } from "../data";
import { DrawingsStore } from "../data/DrawingsStore";
import { SharedBoardsStore } from "../data/SharedBoardsStore";
import { dashboardState } from "../dashboardState";
import { useSaveBoard } from "../hooks/useSaveBoard";
import { getBoardMenuPermissions } from "../permissions/boardMenuPermissions";

const homeIcon = (
  <svg
    aria-hidden="true"
    focusable="false"
    role="img"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={2}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "1em", height: "1em" }}
  >
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <polyline points="9 21 9 12 15 12 15 21" />
  </svg>
);

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
}> = React.memo((props) => {
  const currentUser = getCurrentUser();
  const { save: saveBoard, status: saveBoardStatus } = useSaveBoard();
  const [activeBoard, setActiveBoard] = useAtom(activeBoardAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const collabAPI = useAtomValue(collabAPIAtom);
  const isCollaborationOwner = useAtomValue(isOwnerAtom);
  const isReadOnlySession = useAtomValue(isReadOnlySessionAtom);
  const { t } = useI18n();
  const permissions = getBoardMenuPermissions({
    isAuthenticated: !!currentUser,
    hasHomeNavigation: !!dashboardState.getOnBack(),
    isCollabEnabled: props.isCollabEnabled,
    isCollaborating: props.isCollaborating,
    isCollaborationOwner,
    isReadOnlySession,
  });

  const handleLeaveCollaboration = async () => {
    if (!collabAPI) {
      return;
    }
    const didLeave = await collabAPI.leaveCollaboration();
    if (didLeave) {
      dashboardState.getOnBack()?.();
      void appDialog.toast({ title: t("app.sharedBoardLeftSuccessfully") });
    }
  };

  const renameSharedBoardIfNeeded = async (name: string) => {
    if (!props.isCollaborating || !isCollaborationOwner || !activeRoomLink) {
      return;
    }

    const linkData = getCollaborationLinkData(activeRoomLink);
    if (!linkData) {
      return;
    }

    await SharedBoardsStore.renameByRoom(
      linkData.roomId,
      linkData.roomKey,
      name,
    );
  };

  const handleRenameBoard = async () => {
    if (!permissions.renameBoard) {
      await appDialog.alert({
        title: "Solo el dueño puede renombrar",
        text: "Este tablero compartido pertenece a otro usuario. Solo el dueño puede renombrar el tablero guardado.",
        icon: "info",
      });
      return;
    }

    const trimmed = await appDialog.promptText({
      title: t("app.renameBoard"),
      label: t("app.newName"),
      initialValue: activeBoard.name ?? "",
      confirmButtonText: t("app.rename"),
      requiredMessage: t("app.enterBoardName"),
    });
    if (!trimmed || trimmed === activeBoard.name) {
      return;
    }
    const isTaken = await DrawingsStore.isNameTaken(
      trimmed,
      activeBoard.id ?? undefined,
    );
    if (isTaken) {
      await appDialog.alert({
        title: t("app.duplicateName"),
        icon: "warning",
      });
      return;
    }

    if (activeBoard.id) {
      await DrawingsStore.rename(activeBoard.id, trimmed);
      await renameSharedBoardIfNeeded(trimmed);
      setActiveBoard({ id: activeBoard.id, name: trimmed });
      appJotaiStore.set(activeBoardAtom, { id: activeBoard.id, name: trimmed });
      void appDialog.toast({ title: t("app.boardRenamedSuccessfully") });
      return;
    }

    const record = await saveBoard({ name: trimmed });
    if (record) {
      await renameSharedBoardIfNeeded(trimmed);
    }
  };

  const saveBoardIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1em", height: "1em" }}
    >
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );

  const renameIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1em", height: "1em" }}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  return (
    <MainMenu>
      {permissions.home && (
        <MainMenu.Item
          icon={homeIcon}
          onSelect={async () => {
            await dashboardState.flushAutoSave();
            dashboardState.getOnBack()?.();
          }}
        >
          {t("app.home")}
        </MainMenu.Item>
      )}
      {permissions.saveBoard && (
        <MainMenu.Item icon={saveBoardIcon} onSelect={() => saveBoard()}>
          {saveBoardStatus === "saving"
            ? t("app.saving")
            : saveBoardStatus === "saved"
            ? t("app.saved")
            : t("app.saveBoard")}
        </MainMenu.Item>
      )}
      {permissions.renameBoard && (
        <MainMenu.Item icon={renameIcon} onSelect={handleRenameBoard}>
          {t("app.renameBoard")}
        </MainMenu.Item>
      )}
      {permissions.loadScene && <MainMenu.DefaultItems.LoadScene />}
      {permissions.saveToActiveFile && (
        <MainMenu.DefaultItems.SaveToActiveFile />
      )}
      {permissions.export && <MainMenu.DefaultItems.Export />}
      {permissions.saveAsImage && <MainMenu.DefaultItems.SaveAsImage />}
      {permissions.liveCollaboration &&
        props.isCollaborating &&
        !isCollaborationOwner && (
          <MainMenu.Item icon={usersIcon} onSelect={handleLeaveCollaboration}>
            {t("roomDialog.button_leaveSession")}
          </MainMenu.Item>
        )}
      {permissions.liveCollaboration &&
        (!props.isCollaborating || isCollaborationOwner) && (
          <MainMenu.DefaultItems.LiveCollaborationTrigger
            isCollaborating={props.isCollaborating}
            onSelect={() => props.onCollabDialogOpen()}
          />
        )}
      {permissions.commandPalette && (
        <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      )}
      {permissions.clearCanvas && <MainMenu.DefaultItems.ClearCanvas />}
      <MainMenu.Separator />
      {permissions.preferences && <MainMenu.DefaultItems.Preferences />}
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      {permissions.toggleTheme && (
        <MainMenu.DefaultItems.ToggleTheme
          allowSystemTheme
          theme={props.theme}
          onSelect={props.setTheme}
        />
      )}
      {permissions.changeCanvasBackground && (
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      )}
    </MainMenu>
  );
});
