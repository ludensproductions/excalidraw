import { exportToBlob, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useRef } from "react";

import { activeBoardAtom, appJotaiStore, useAtomValue } from "../app-jotai";
import { getCurrentUser } from "../auth/authStore";
import {
  activeRoomLinkAtom,
  isCollaboratingAtom,
} from "../collab/Collab";
import { DrawingsStore } from "../data/DrawingsStore";

const AUTO_SAVE_DELAY = 3000; // ms after last change

export const useAutoSaveBoard = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const activeBoard = useAtomValue(activeBoardAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  // Refs so the debounced async callback always sees latest values
  const activeBoardRef = useRef(activeBoard);
  const isCollaboratingRef = useRef(isCollaborating);
  const activeRoomLinkRef = useRef(activeRoomLink);
  const excalidrawAPIRef = useRef(excalidrawAPI);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeBoardRef.current = activeBoard;
  }, [activeBoard]);
  useEffect(() => {
    isCollaboratingRef.current = isCollaborating;
  }, [isCollaborating]);
  useEffect(() => {
    activeRoomLinkRef.current = activeRoomLink;
  }, [activeRoomLink]);
  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  const doSave = useCallback(async () => {
    const board = activeBoardRef.current;
    const api = excalidrawAPIRef.current;
    if (!api) {
      return;
    }

    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();

    // Don't auto-create an empty new board
    if (!board.id && elements.length === 0) {
      return;
    }

    // A collaboration room opened from "Compartidos" doesn't represent a
    // private board record. Persist the room through the collab pipeline only.
    if (!board.id && isCollaboratingRef.current) {
      return;
    }

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

    try {
      const record = await DrawingsStore.save(
        {
          name: board.name ?? "Sin título",
          elements,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          thumbnail,
          collabLink:
            isCollaboratingRef.current && activeRoomLinkRef.current
              ? activeRoomLinkRef.current
              : null,
          userId: getCurrentUser()?.id,
        },
        board.id ?? undefined,
      );
      if (!board.id) {
        // First autosave for a brand-new board: remember the id so subsequent
        // saves update the same record instead of creating new ones.
        const next = { id: record.id, name: record.name };
        activeBoardRef.current = next;
        appJotaiStore.set(activeBoardAtom, next);
      }
    } catch {
      // auto-save failures are silent
    }
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doSave();
    }, AUTO_SAVE_DELAY);
  }, [doSave]);

  // Flush any pending debounced save immediately and await completion.
  const flushAutoSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  // Flush immediately when the tab hides or the page unloads
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void doSave();
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [doSave]);

  // Flush pending save on unmount (e.g. when navigating back to the dashboard)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void doSave();
      }
    };
  }, [doSave]);

  return { scheduleAutoSave, flushAutoSave };
};
