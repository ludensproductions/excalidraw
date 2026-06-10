import { usersIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu, useI18n } from "@excalidraw/excalidraw/index";
import React from "react";

import type { Theme } from "@excalidraw/element/types";

import { activeBoardAtom, appJotaiStore, useAtom } from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCurrentUser, logoutUser } from "../auth/authStore";
import { DrawingsStore } from "../data/DrawingsStore";
import { dashboardState } from "../dashboardState";
import { useSaveBoard } from "../hooks/useSaveBoard";

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
  const { t } = useI18n();

  const handleLogout = () => {
    logoutUser();
    window.location.reload();
  };

  const handleRenameBoard = async () => {
    if (!activeBoard.id) {
      await appDialog.alert({
        title: t("app.saveBoardFirst"),
        text: t("app.saveBoardFirstText"),
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
    await DrawingsStore.rename(activeBoard.id, trimmed);
    setActiveBoard({ id: activeBoard.id, name: trimmed });
    appJotaiStore.set(activeBoardAtom, { id: activeBoard.id, name: trimmed });
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
      {dashboardState.getOnBack() && (
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
      <MainMenu.Item icon={saveBoardIcon} onSelect={saveBoard}>
        {saveBoardStatus === "saving"
          ? t("app.saving")
          : saveBoardStatus === "saved"
            ? t("app.saved")
            : t("app.saveBoard")}
      </MainMenu.Item>
      <MainMenu.Item icon={renameIcon} onSelect={handleRenameBoard}>
        {t("app.renameBoard")}
      </MainMenu.Item>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {currentUser && (
        <MainMenu.Item icon={usersIcon} onSelect={handleLogout}>
          {currentUser.username} - {t("app.logOut")}
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
