import { usersIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import React from "react";

import { DEFAULT_SIDEBAR } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import { activeBoardAtom, appJotaiStore, useAtom } from "../app-jotai";
import { getCurrentUser, logoutUser } from "../auth/authStore";
import { DrawingsStore } from "../data/DrawingsStore";
import { dashboardState } from "../dashboardState";
import { useSaveBoard } from "../hooks/useSaveBoard";

import { DRAWINGS_PANEL_TAB } from "./DrawingsPanel";

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

const drawingsMenuIcon = (
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
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
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
  const excalidrawAPI = useExcalidrawAPI();
  const { save: saveBoard, status: saveBoardStatus } = useSaveBoard();
  const [activeBoard, setActiveBoard] = useAtom(activeBoardAtom);

  const handleLogout = () => {
    logoutUser();
    window.location.reload();
  };

  const handleRenameBoard = async () => {
    if (!activeBoard.id) {
      window.alert(
        "Este board aún no se ha guardado. Guárdalo primero para poder renombrarlo.",
      );
      return;
    }
    const input = window.prompt(
      "Nuevo nombre del board:",
      activeBoard.name ?? "",
    );
    const trimmed = input?.trim();
    if (!trimmed || trimmed === activeBoard.name) {
      return;
    }
    await DrawingsStore.rename(activeBoard.id, trimmed);
    setActiveBoard({ id: activeBoard.id, name: trimmed });
    // also keep jotai store in sync (in case the atom default differs)
    appJotaiStore.set(activeBoardAtom, { id: activeBoard.id, name: trimmed });
  };

  const openDrawingsPanel = () => {
    excalidrawAPI?.toggleSidebar({
      name: DEFAULT_SIDEBAR.name,
      tab: DRAWINGS_PANEL_TAB,
      force: true,
    });
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
          onSelect={() => {
            void dashboardState.flushAutoSave();
            dashboardState.getOnBack()?.();
          }}
        >
          Dashboard
        </MainMenu.Item>
      )}
      <MainMenu.Item icon={saveBoardIcon} onSelect={saveBoard}>
        {saveBoardStatus === "saving"
          ? "Guardando..."
          : saveBoardStatus === "saved"
          ? "✓ Guardado"
          : "Guardar board"}
      </MainMenu.Item>
      <MainMenu.Item icon={renameIcon} onSelect={handleRenameBoard}>
        Renombrar board
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
      <MainMenu.Item icon={drawingsMenuIcon} onSelect={openDrawingsPanel}>
        Mis dibujos
      </MainMenu.Item>
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {currentUser && (
        <MainMenu.Item icon={usersIcon} onSelect={handleLogout}>
          {currentUser.username} · Cerrar sesión
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
