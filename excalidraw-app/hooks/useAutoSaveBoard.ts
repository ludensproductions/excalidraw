import { exportToBlob } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { useCallback, useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import {
  activeBoardAtom,
  appJotaiStore,
  isReadOnlySessionAtom,
  useAtomValue,
} from "../app-jotai";
import { getCurrentUser } from "../auth/authStore";
import {
  activeRoomLinkAtom,
  isCollaboratingAtom,
  isOwnerAtom,
} from "../collab/Collab";
import { dashboardState } from "../dashboardState";
import { DrawingsStore } from "../data/DrawingsStore";

const AUTO_SAVE_DELAY = 3000; // ms after last change

export type AutoSaveSnapshot = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

// What the autosave persists: the last scene the editor reported through
// onChange. It's never read back from the editor at save time because a save
// that runs late (queued behind a slow one, or flushed on unmount) would find
// the editor already unmounted, with an empty scene and no files, and wipe the
// board (RD-512, mostly on mobile where saves are slower).
export const getAutoSaveSceneData = (
  snapshot: AutoSaveSnapshot | null,
): {
  elements: OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
} | null => {
  if (!snapshot || snapshot.appState.isLoading) {
    return null;
  }
  return {
    elements: snapshot.elements.filter((element) => !element.isDeleted),
    appState: snapshot.appState,
    files: snapshot.files,
  };
};

export const resolveAutoSaveTargetBoardId = (params: {
  activeBoardId: string | null;
  storeBoardId: string | null;
  ensuredBoardId: string | null;
  isCollaborating: boolean;
  isCollaborationOwner: boolean;
  isReadOnlySession: boolean;
  createId: () => string;
}): { id: string; created: boolean } | null => {
  const existingId =
    params.activeBoardId ?? params.storeBoardId ?? params.ensuredBoardId;

  if (params.isCollaborating) {
    if (
      !params.isCollaborationOwner ||
      params.isReadOnlySession ||
      !existingId
    ) {
      return null;
    }
    return { id: existingId, created: false };
  }

  return existingId
    ? { id: existingId, created: false }
    : { id: params.createId(), created: true };
};

export const useAutoSaveBoard = () => {
  const activeBoard = useAtomValue(activeBoardAtom);
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const isCollaborationOwner = useAtomValue(isOwnerAtom);
  const isReadOnlySession = useAtomValue(isReadOnlySessionAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  // Refs so the debounced async callback always sees latest values
  const activeBoardRef = useRef(activeBoard);
  const ensuredBoardIdRef = useRef<string | null>(activeBoard.id);
  const isCollaboratingRef = useRef(isCollaborating);
  const isCollaborationOwnerRef = useRef(isCollaborationOwner);
  const isReadOnlySessionRef = useRef(isReadOnlySession);
  const activeRoomLinkRef = useRef(activeRoomLink);
  const snapshotRef = useRef<AutoSaveSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const queuedSaveRef = useRef(false);

  useEffect(() => {
    activeBoardRef.current = activeBoard;
    if (activeBoard.id) {
      ensuredBoardIdRef.current = activeBoard.id;
    } else {
      ensuredBoardIdRef.current = null;
    }
  }, [activeBoard]);
  useEffect(() => {
    isCollaboratingRef.current = isCollaborating;
  }, [isCollaborating]);
  useEffect(() => {
    isCollaborationOwnerRef.current = isCollaborationOwner;
  }, [isCollaborationOwner]);
  useEffect(() => {
    isReadOnlySessionRef.current = isReadOnlySession;
  }, [isReadOnlySession]);
  useEffect(() => {
    activeRoomLinkRef.current = activeRoomLink;
  }, [activeRoomLink]);

  const runSave = useCallback(async () => {
    if (dashboardState.isAutoSaveSuppressed()) {
      return;
    }

    const board = activeBoardRef.current;
    const storeBoard = appJotaiStore.get(activeBoardAtom);
    const scene = getAutoSaveSceneData(snapshotRef.current);
    if (!scene) {
      return;
    }

    const { elements, appState, files } = scene;

    // Don't auto-create an empty new board
    if (!board.id && elements.length === 0) {
      return;
    }

    // A collaboration room opened by a non-owner doesn't represent a private
    // board record. Persist it through the collab pipeline only.
    if (
      isCollaboratingRef.current &&
      (!isCollaborationOwnerRef.current || isReadOnlySessionRef.current)
    ) {
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
      const target = resolveAutoSaveTargetBoardId({
        activeBoardId: board.id,
        storeBoardId: storeBoard.id,
        ensuredBoardId: ensuredBoardIdRef.current,
        isCollaborating: isCollaboratingRef.current,
        isCollaborationOwner: isCollaborationOwnerRef.current,
        isReadOnlySession: isReadOnlySessionRef.current,
        createId: () => crypto.randomUUID(),
      });

      if (!target) {
        return;
      }

      if (target.created) {
        activeBoardRef.current = { id: target.id, name: board.name };
        appJotaiStore.set(activeBoardAtom, { id: target.id, name: board.name });
      }

      const record = await DrawingsStore.save(
        {
          name: board.name ?? t("labels.untitled"),
          elements,
          files,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          thumbnail,
          collabLink:
            isCollaboratingRef.current && activeRoomLinkRef.current
              ? activeRoomLinkRef.current
              : null,
          userId: getCurrentUser()?.id,
        },
        target.id,
      );
      ensuredBoardIdRef.current = record.id;
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

  const doSave = useCallback(async () => {
    if (inFlightSaveRef.current) {
      // whoever asked waits for this save too, not only for the running one
      queuedSaveRef.current = true;
      return inFlightSaveRef.current;
    }

    const saves = (async () => {
      try {
        do {
          queuedSaveRef.current = false;
          await runSave();
        } while (queuedSaveRef.current);
      } finally {
        inFlightSaveRef.current = null;
      }
    })();
    inFlightSaveRef.current = saves;
    // opening a board from the dashboard waits for this, so it never loads a
    // version older than the one still being saved
    dashboardState.trackPendingSave(saves);
    return saves;
  }, [runSave]);

  const scheduleAutoSave = useCallback(
    (snapshot?: AutoSaveSnapshot) => {
      if (snapshot) {
        snapshotRef.current = snapshot;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doSave();
      }, AUTO_SAVE_DELAY);
    },
    [doSave],
  );

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
