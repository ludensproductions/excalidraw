import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";
import {
  activeBoardAtom,
  appJotaiStore,
  hasDashboardBackAtom,
} from "./app-jotai";
import { AuthPage } from "./auth/AuthPage";
import {
  getCurrentUser,
  isAuthHydrated,
  logoutUser,
  subscribeToAuth,
  waitForAuthHydration,
} from "./auth/authStore";
import { Dashboard } from "./components/Dashboard";
import { dashboardState } from "./dashboardState";

import type { AuthUser } from "./auth/authStore";
import type { DrawingRecord } from "./data/DrawingsStore";
import type { SharedBoard } from "./data/SharedBoardsStore";

type AppView =
  | { type: "auth" }
  | { type: "dashboard" }
  | { type: "editor"; boardId: string | null; key: number };

const hasExternalLinkInUrl = (): boolean => {
  const hash = window.location.hash;
  return (
    /^#room=[a-zA-Z0-9_-]+,[a-zA-Z0-9_-]+(,ro)?$/.test(hash) ||
    /^#json=[a-zA-Z0-9_-]+,[a-zA-Z0-9_-]+$/.test(hash)
  );
};

const AppRoot: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser);
  const [authReady, setAuthReady] = useState<boolean>(isAuthHydrated);
  const [view, setView] = useState<AppView>(() => {
    if (!getCurrentUser()) {
      return { type: "auth" };
    }
    if (hasExternalLinkInUrl()) {
      return { type: "editor", boardId: null, key: Date.now() };
    }
    return { type: "dashboard" };
  });

  useEffect(() => {
    let cancelled = false;
    waitForAuthHydration().then(() => {
      if (cancelled) {
        return;
      }
      const u = getCurrentUser();
      setUser(u);
      setAuthReady(true);
      if (u && hasExternalLinkInUrl()) {
        setView({ type: "editor", boardId: null, key: Date.now() });
      } else {
        setView(u ? { type: "dashboard" } : { type: "auth" });
      }
    });
    const unsub = subscribeToAuth((u) => {
      setUser(u);
      if (!u) {
        setView({ type: "auth" });
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Register back-to-dashboard callback whenever we're in the editor
  useEffect(() => {
    if (view.type === "editor") {
      appJotaiStore.set(hasDashboardBackAtom, true);
      dashboardState.setOnBack(() => {
        appJotaiStore.set(hasDashboardBackAtom, false);
        setView({ type: "dashboard" });
      });
      return () => {
        dashboardState.setOnBack(null);
        appJotaiStore.set(hasDashboardBackAtom, false);
      };
    }
    return undefined;
  }, [view.type]);

  const handleAuthenticated = (u: AuthUser) => {
    setUser(u);
    if (hasExternalLinkInUrl()) {
      setView({ type: "editor", boardId: null, key: Date.now() });
    } else {
      setView({ type: "dashboard" });
    }
  };

  const handleLogout = () => {
    logoutUser();
    setUser(null);
    dashboardState.setOnBack(null);
    setView({ type: "auth" });
  };

  const openBoard = (record: DrawingRecord) => {
    appJotaiStore.set(hasDashboardBackAtom, true);
    appJotaiStore.set(activeBoardAtom, { id: record.id, name: record.name });
    dashboardState.setPendingBoard(record);
    // Always open as a private editor session. Collaboration must be started
    // explicitly by the user via the Share dialog (or by opening a #room=...
    // URL directly). This avoids surprising the user with auto-rejoin.
    window.history.replaceState({}, "", window.location.pathname);
    setView({ type: "editor", boardId: record.id, key: Date.now() });
  };

  const newBoard = () => {
    appJotaiStore.set(hasDashboardBackAtom, true);
    appJotaiStore.set(activeBoardAtom, { id: null, name: null });
    dashboardState.setNewBoard();
    window.history.replaceState({}, "", window.location.pathname);
    setView({ type: "editor", boardId: null, key: Date.now() });
  };

  const openSharedBoard = (board: SharedBoard) => {
    appJotaiStore.set(hasDashboardBackAtom, true);
    appJotaiStore.set(activeBoardAtom, { id: null, name: board.name });
    const roomUrl = `${window.location.origin}${window.location.pathname}#room=${board.roomId},${board.roomKey}`;
    window.history.pushState({}, "", roomUrl);
    setView({ type: "editor", boardId: null, key: Date.now() });
  };

  if (!authReady) {
    return null;
  }

  if (view.type === "auth" || !user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  if (view.type === "dashboard") {
    return (
      <Dashboard
        user={user}
        onOpenBoard={openBoard}
        onOpenSharedBoard={openSharedBoard}
        onNewBoard={newBoard}
        onLogout={handleLogout}
      />
    );
  }

  // editor
  return <ExcalidrawApp key={view.key} />;
};

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();
root.render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
