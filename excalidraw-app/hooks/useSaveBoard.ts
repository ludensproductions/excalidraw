import { exportToBlob, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { useCallback } from "react";

import {
  activeBoardAtom,
  boardSaveStatusAtom,
  isReadOnlySessionAtom,
  useAtom,
  useAtomValue,
} from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCurrentUser } from "../auth/authStore";
import { MAX_FIELD_LENGTH } from "../auth/authValidation";
import {
  activeRoomLinkAtom,
  isCollaboratingAtom,
  isOwnerAtom,
} from "../collab/Collab";
import { DrawingsStore } from "../data/DrawingsStore";

import type { DrawingRecord } from "../data/DrawingsStore";
import type { BoardSaveStatus } from "../app-jotai";

export type SaveStatus = BoardSaveStatus;
export type SaveBoardOptions = {
  name?: string;
};

type ExcalidrawAPI = NonNullable<ReturnType<typeof useExcalidrawAPI>>;

const createThumbnail = async (api: ExcalidrawAPI): Promise<string | null> => {
  const elements = api.getSceneElements();
  if (!elements.length) {
    return null;
  }
  try {
    const blob = await exportToBlob({
      elements,
      appState: { ...api.getAppState(), exportBackground: true },
      files: api.getFiles(),
      maxWidthOrHeight: 200,
    });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // thumbnail is optional
    return null;
  }
};

export const useSaveBoard = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [activeBoard, setActiveBoard] = useAtom(activeBoardAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const isCollaborationOwner = useAtomValue(isOwnerAtom);
  const isReadOnlySession = useAtomValue(isReadOnlySessionAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const [status, setStatus] = useAtom(boardSaveStatusAtom);

  const save = useCallback(
    async (options?: SaveBoardOptions) => {
      if (!excalidrawAPI || status === "saving") {
        return null;
      }

      if (isCollaborating && (!isCollaborationOwner || isReadOnlySession)) {
        await appDialog.alert({
          title: t("app.onlyOwnerCanSave"),
          text: t("app.onlyOwnerCanSaveText"),
          icon: "info",
        });
        return null;
      }

      let name = options?.name?.trim() || activeBoard.name;
      if (!name) {
        const input = await appDialog.promptText({
          title: t("app.saveBoard"),
          label: t("app.boardName"),
          placeholder: t("app.boardNamePlaceholder"),
          confirmButtonText: t("app.save"),
          requiredMessage: t("app.enterBoardNameToSave"),
        });
        if (!input) {
          return null;
        }
        name = input;
      }

      setStatus("saving");
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const thumbnail = await createThumbnail(excalidrawAPI);

        const record: DrawingRecord = await DrawingsStore.save(
          {
            name,
            elements,
            files,
            appState: { viewBackgroundColor: appState.viewBackgroundColor },
            thumbnail,
            collabLink:
              isCollaborating && activeRoomLink ? activeRoomLink : null,
            userId: getCurrentUser()?.id,
          },
          activeBoard.id ?? undefined,
        );

        setActiveBoard({ id: record.id, name: record.name });
        setStatus("saved");
        void appDialog.toast({ title: t("app.boardSavedSuccessfully") });
        setTimeout(() => setStatus("idle"), 2000);
        return record;
      } catch {
        setStatus("idle");
        return null;
      }
    },
    [
      excalidrawAPI,
      activeBoard,
      isCollaborating,
      isCollaborationOwner,
      isReadOnlySession,
      activeRoomLink,
      setActiveBoard,
      setStatus,
      status,
    ],
  );

  // Saves the shared board as a new, independent private board. The editor
  // stays on the shared board; the copy just shows up in the dashboard.
  const saveLocalCopy = useCallback(async () => {
    if (!excalidrawAPI) {
      return null;
    }

    const defaultName = Array.from(
      t("app.localCopyName", {
        name: activeBoard.name || t("app.defaultBoardName"),
      }),
    )
      .slice(0, MAX_FIELD_LENGTH)
      .join("");
    const name = await appDialog.promptText({
      title: t("app.saveLocalCopy"),
      label: t("app.boardName"),
      initialValue: defaultName,
      confirmButtonText: t("app.save"),
      requiredMessage: t("app.enterBoardNameToSave"),
    });
    if (!name) {
      return null;
    }

    if (await DrawingsStore.isNameTaken(name)) {
      await appDialog.alert({ title: t("app.duplicateName"), icon: "warning" });
      return null;
    }

    try {
      const record = await DrawingsStore.save({
        name,
        elements: excalidrawAPI.getSceneElements(),
        files: excalidrawAPI.getFiles(),
        appState: {
          viewBackgroundColor: excalidrawAPI.getAppState().viewBackgroundColor,
        },
        thumbnail: await createThumbnail(excalidrawAPI),
        collabLink: null,
        userId: getCurrentUser()?.id,
      });
      void appDialog.toast({ title: t("app.localCopySavedSuccessfully") });
      return record;
    } catch (error) {
      await appDialog.error(
        t("app.couldNotSaveBoard"),
        error instanceof Error ? error.message : undefined,
      );
      return null;
    }
  }, [excalidrawAPI, activeBoard.name]);

  return { save, saveLocalCopy, status, activeBoard };
};
