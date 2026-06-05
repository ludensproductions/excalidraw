import { exportToBlob, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useCallback, useState } from "react";

import { activeBoardAtom, useAtom, useAtomValue } from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCurrentUser } from "../auth/authStore";
import { activeRoomLinkAtom, isCollaboratingAtom } from "../collab/Collab";
import { DrawingsStore } from "../data/DrawingsStore";

export type SaveStatus = "idle" | "saving" | "saved";

export const useSaveBoard = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [activeBoard, setActiveBoard] = useAtom(activeBoardAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const save = useCallback(async () => {
    if (!excalidrawAPI || status === "saving") {
      return;
    }

    if (isCollaborating && !activeBoard.id) {
      await appDialog.alert({
        title: "Tablero compartido",
        text: "Este tablero se guarda en la sesion colaborativa, no en tus boards privados.",
        icon: "info",
      });
      return;
    }

    let name = activeBoard.name;
    if (!name) {
      const input = await appDialog.promptText({
        title: "Guardar board",
        label: "Nombre del board",
        placeholder: "Ej. Wireframe principal",
        confirmButtonText: "Guardar",
        requiredMessage: "Escribe un nombre para guardar el board.",
      });
      if (!input) {
        return;
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

      const record = await DrawingsStore.save(
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
    } catch {
      setStatus("idle");
    }
  }, [
    excalidrawAPI,
    activeBoard,
    isCollaborating,
    activeRoomLink,
    setActiveBoard,
    status,
  ]);

  return { save, status, activeBoard };
};
