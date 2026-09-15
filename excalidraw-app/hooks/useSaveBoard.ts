import { exportToBlob, useExcalidrawAPI } from "@excalidraw/excalidraw";
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

export const useSaveBoard = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [activeBoard, setActiveBoard] = useAtom(activeBoardAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const isCollaborationOwner = useAtomValue(isOwnerAtom);
  const isReadOnlySession = useAtomValue(isReadOnlySessionAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const [status, setStatus] = useAtom(boardSaveStatusAtom);

  const save = useCallback(async (options?: SaveBoardOptions) => {
    if (!excalidrawAPI || status === "saving") {
      return null;
    }

    if (
      isCollaborating &&
      (!isCollaborationOwner || isReadOnlySession)
    ) {
      await appDialog.alert({
        title: "Solo el dueño puede guardar",
        text: "Este tablero compartido pertenece a otro usuario. Tus cambios se sincronizan en la colaboracion; para guardarlo en tus tableros, exporta una copia o pide al dueño que finalice la sesion.",
        icon: "info",
      });
      return null;
    }

    let name = options?.name?.trim() || activeBoard.name;
    if (!name) {
      const input = await appDialog.promptText({
        title: "Guardar tablero",
        label: "Nombre del tablero",
        placeholder: "Ej. Wireframe principal",
        confirmButtonText: "Guardar",
        requiredMessage: "Escribe un nombre para guardar el tablero.",
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

      let thumbnail: string | null = null;
      if (elements.length) {
        try {
          const blob = await exportToBlob({
            elements,
            appState: { ...appState, exportBackground: true },
            files,
            maxWidthOrHeight: 200,
          });
          thumbnail = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch {
          // thumbnail is optional
        }
      }

      const record: DrawingRecord = await DrawingsStore.save(
        {
          name,
          elements,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          thumbnail,
          collabLink: isCollaborating && activeRoomLink ? activeRoomLink : null,
          userId: getCurrentUser()?.id,
        },
        activeBoard.id ?? undefined,
      );

      setActiveBoard({ id: record.id, name: record.name });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
      return record;
    } catch {
      setStatus("idle");
      return null;
    }
  }, [
    excalidrawAPI,
    activeBoard,
    isCollaborating,
    isCollaborationOwner,
    isReadOnlySession,
    activeRoomLink,
    setActiveBoard,
    status,
  ]);

  return { save, status, activeBoard };
};
