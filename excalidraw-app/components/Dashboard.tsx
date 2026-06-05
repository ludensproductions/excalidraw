import React, { useCallback, useEffect, useRef, useState } from "react";

import { THEME } from "@excalidraw/excalidraw";

import { activeBoardAtom, appJotaiStore } from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCollaborationLinkData } from "../data";
import { DrawingsStore } from "../data/DrawingsStore";
import { SharedBoardsStore } from "../data/SharedBoardsStore";
import { useHandleAppTheme } from "../useHandleAppTheme";

import "./Dashboard.scss";

import type { AuthUser } from "../auth/authStore";
import type { DrawingRecord } from "../data/DrawingsStore";
import type { SharedBoard } from "../data/SharedBoardsStore";

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) {
    return "Ahora mismo";
  }
  if (diff < 3_600_000) {
    return `Hace ${Math.floor(diff / 60_000)} min`;
  }
  if (diff < 86_400_000) {
    return `Hace ${Math.floor(diff / 3_600_000)} h`;
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
};

const PencilIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "3rem", height: "3rem" }}
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

interface BoardCardProps {
  board: DrawingRecord;
  onOpen: (board: DrawingRecord) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => Promise<void>;
  onClearCollabLink: (id: string) => Promise<void>;
}

const BoardCard: React.FC<BoardCardProps> = ({
  board,
  onOpen,
  onDelete,
  onRename,
  onClearCollabLink,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(board.name);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftName(board.name);
    setIsEditing(true);
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== board.name) {
      await onRename(board.id, trimmed);
    }
  };

  const cancelRename = () => {
    setDraftName(board.name);
    setIsEditing(false);
  };

  const copyCollabLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!board.collabLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(board.collabLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = board.collabLink;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const clearCollabLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await appDialog.confirm({
      title: "Eliminar enlace de colaboracion",
      text: "El board dejara de mostrar este enlace colaborativo guardado.",
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await onClearCollabLink(board.id);
  };

  return (
    <div
      className="dashboard__card"
      onClick={() => !isEditing && onOpen(board)}
    >
      <div className="dashboard__card-thumb">
        {board.thumbnail ? (
          <img src={board.thumbnail} alt={board.name} />
        ) : (
          <div className="dashboard__card-thumb-placeholder">
            <PencilIcon />
          </div>
        )}
      </div>
      <div className="dashboard__card-info">
        {isEditing ? (
          <input
            ref={inputRef}
            className="dashboard__card-name-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            maxLength={120}
          />
        ) : (
          <span
            className="dashboard__card-name"
            title={board.name}
            onDoubleClick={startRename}
          >
            {board.name}
          </span>
        )}
        <span className="dashboard__card-date">
          {formatDate(board.updatedAt)}
        </span>
        {board.collabLink && (
          <div className="dashboard__card-collab-row">
            <button
              className="dashboard__card-collab"
              title="Copiar enlace de colaboración"
              onClick={copyCollabLink}
            >
              {copied ? "✓ Copiado" : "● Copiar enlace"}
            </button>
            <button
              className="dashboard__card-collab-clear"
              title="Eliminar enlace de colaboración"
              onClick={clearCollabLink}
            >
              ×
            </button>
          </div>
        )}
      </div>
      <button
        className="dashboard__card-rename"
        title="Renombrar board"
        onClick={startRename}
      >
        ✎
      </button>
      <button
        className="dashboard__card-delete"
        title="Eliminar board"
        onClick={(e) => onDelete(board.id, e)}
      >
        ×
      </button>
    </div>
  );
};

interface SharedBoardCardProps {
  board: SharedBoard;
  currentUserId: string;
  onJoin: (board: SharedBoard) => void;
  onLeave: (board: SharedBoard) => void;
}

const SharedBoardCard: React.FC<SharedBoardCardProps> = ({
  board,
  currentUserId,
  onJoin,
  onLeave,
}) => {
  const isOwner = board.createdBy === currentUserId;
  const MAX_AVATARS = 4;
  const visibleMembers = board.members.slice(0, MAX_AVATARS);
  const overflow = board.members.length - MAX_AVATARS;

  return (
    <div className="dashboard__shared-card" onClick={() => onJoin(board)}>
      <div className="dashboard__shared-card-header">
        <span className="dashboard__shared-card-name" title={board.name}>
          {board.name}
        </span>
        {isOwner && (
          <span className="dashboard__shared-card-owner-badge">Tuyo</span>
        )}
      </div>

      <div className="dashboard__shared-card-members">
        {visibleMembers.map((m) => (
          <span
            key={m.userId}
            className={`dashboard__shared-card-avatar${
              m.userId === currentUserId ? " current" : ""
            }`}
            title={m.username}
          >
            {m.username.charAt(0).toUpperCase()}
          </span>
        ))}
        {overflow > 0 && (
          <span className="dashboard__shared-card-avatar overflow">
            +{overflow}
          </span>
        )}
        <span className="dashboard__shared-card-member-names">
          {board.members.map((m) => m.username).join(", ")}
        </span>
      </div>

      <div className="dashboard__shared-card-footer">
        <button
          className="dashboard__shared-card-join"
          onClick={(e) => {
            e.stopPropagation();
            onJoin(board);
          }}
        >
          Unirse
        </button>
        <button
          className="dashboard__shared-card-leave"
          title="Salir del tablero compartido"
          onClick={(e) => {
            e.stopPropagation();
            onLeave(board);
          }}
        >
          Salir
        </button>
      </div>
    </div>
  );
};

interface DashboardProps {
  user: AuthUser;
  onOpenBoard: (record: DrawingRecord) => void;
  onOpenSharedBoard: (board: SharedBoard) => void;
  onNewBoard: () => void;
  onLogout: () => void;
}

type Tab = "recent" | "all" | "shared";
type RecentItem =
  | { type: "own"; board: DrawingRecord; updatedAt: number }
  | { type: "shared"; board: SharedBoard; updatedAt: number };

const getRoomIdFromCollabLink = (link: string | null): string | null => {
  if (!link) {
    return null;
  }
  return getCollaborationLinkData(link)?.roomId ?? null;
};

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  onOpenBoard,
  onOpenSharedBoard,
  onNewBoard,
  onLogout,
}) => {
  const [boards, setBoards] = useState<DrawingRecord[]>([]);
  const [sharedBoards, setSharedBoards] = useState<SharedBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("recent");

  const { editorTheme, setAppTheme } = useHandleAppTheme();
  const isDark = editorTheme === THEME.DARK;

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    setSharedError(null);
    const [all, shared] = await Promise.all([
      DrawingsStore.getAllForUser(user.id),
      SharedBoardsStore.getAll().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setSharedError(msg);
        return [] as SharedBoard[];
      }),
    ]);
    setBoards(all);
    setSharedBoards(shared);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await appDialog.confirm({
      title: "Eliminar board",
      text: "Esta accion no se puede deshacer.",
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await DrawingsStore.delete(id);
    setBoards((prev) => prev.filter((b) => b.id !== id));
  };

  const handleRename = async (id: string, newName: string) => {
    await DrawingsStore.rename(id, newName);
    const now = Date.now();
    setBoards((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, name: newName, updatedAt: now } : b,
      ),
    );
    // Keep the editor's active board name in sync if it's the one open
    const active = appJotaiStore.get(activeBoardAtom);
    if (active?.id === id) {
      appJotaiStore.set(activeBoardAtom, { ...active, name: newName });
    }
  };

  const handleClearCollabLink = async (id: string) => {
    await DrawingsStore.setCollabLink(id, null);
    setBoards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, collabLink: null } : b)),
    );
  };

  const handleLeaveSharedBoard = async (board: SharedBoard) => {
    const isOwner = board.createdBy === user.id;
    const confirmed = await appDialog.confirm({
      title: isOwner ? "Eliminar tablero compartido" : "Salir del tablero",
      text: isOwner
        ? `Se eliminara "${board.name}" para los participantes.`
        : `Dejaras de ver "${board.name}" en tus compartidos.`,
      confirmButtonText: isOwner ? "Eliminar" : "Salir",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await SharedBoardsStore.leave(board.id, isOwner);
    if (isOwner) {
      const linkedBoards = boards.filter(
        (ownBoard) =>
          getRoomIdFromCollabLink(ownBoard.collabLink) === board.roomId,
      );
      await Promise.all(
        linkedBoards.map((ownBoard) =>
          DrawingsStore.setCollabLink(ownBoard.id, null),
        ),
      );
      setBoards((prev) =>
        prev.map((ownBoard) =>
          getRoomIdFromCollabLink(ownBoard.collabLink) === board.roomId
            ? { ...ownBoard, collabLink: null }
            : ownBoard,
        ),
      );
    }
    setSharedBoards((prev) => prev.filter((b) => b.id !== board.id));
  };

  const handleOpenBoard = (board: DrawingRecord) => {
    // Own boards always open as local editor sessions. Live collaboration
    // should be started explicitly from the Share dialog.
    onOpenBoard(board);
  };

  const sharedRoomIds = new Set(sharedBoards.map((board) => board.roomId));
  const privateBoards = boards.filter(
    (board) => !getRoomIdFromCollabLink(board.collabLink),
  );
  const recentItems: RecentItem[] = [
    ...privateBoards.map((board) => ({
      type: "own" as const,
      board,
      updatedAt: board.updatedAt,
    })),
    ...sharedBoards.map((board) => ({
      type: "shared" as const,
      board,
      updatedAt: board.updatedAt,
    })),
    ...boards
      .filter((board) => {
        const roomId = getRoomIdFromCollabLink(board.collabLink);
        return roomId && !sharedRoomIds.has(roomId);
      })
      .map((board) => ({
        type: "own" as const,
        board,
        updatedAt: board.updatedAt,
      })),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const displayedBoards = activeTab === "recent" ? [] : privateBoards;

  return (
    <div className={`dashboard${isDark ? " dashboard--dark" : ""}`}>
      <header className="dashboard__header">
        <div className="dashboard__logo">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: "1.75rem", height: "1.75rem" }}
          >
            <rect width="100" height="100" rx="20" fill="#6965db" />
            <path
              d="M20 75 L50 25 L80 75"
              stroke="white"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <line
              x1="32"
              y1="58"
              x2="68"
              y2="58"
              stroke="white"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </svg>
          <span>Excalidraw</span>
        </div>

        <nav className="dashboard__tabs">
          <button
            className={`dashboard__tab${
              activeTab === "recent" ? " active" : ""
            }`}
            onClick={() => setActiveTab("recent")}
          >
            Recientes
          </button>
          <button
            className={`dashboard__tab${activeTab === "all" ? " active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            Mis tableros
          </button>
          <button
            className={`dashboard__tab${
              activeTab === "shared" ? " active" : ""
            }`}
            onClick={() => setActiveTab("shared")}
          >
            Compartidos
            {sharedBoards.length > 0 && (
              <span className="dashboard__tab-badge">
                {sharedBoards.length}
              </span>
            )}
          </button>
        </nav>

        <div className="dashboard__user">
          <span className="dashboard__username">{user.username}</span>
          <button
            className="dashboard__theme-toggle"
            onClick={() => setAppTheme(isDark ? THEME.LIGHT : THEME.DARK)}
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {isDark ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className="dashboard__logout-btn" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="dashboard__main">
        {activeTab === "shared" ? (
          <>
            <div className="dashboard__section-header">
              <h2>
                Tableros compartidos
                {!loading && sharedBoards.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 400,
                      color: "#9ca3af",
                      marginLeft: "0.5rem",
                    }}
                  >
                    ({sharedBoards.length})
                  </span>
                )}
              </h2>
              <button
                className="dashboard__shared-refresh"
                onClick={fetchBoards}
                disabled={loading}
                title="Actualizar tableros compartidos"
              >
                ↻
              </button>
            </div>
            {sharedError && (
              <div className="dashboard__shared-error">
                <strong>Error al cargar tableros compartidos:</strong>{" "}
                {sharedError}
              </div>
            )}
            {loading ? (
              <div className="dashboard__loading">
                <p>Cargando tableros compartidos...</p>
              </div>
            ) : sharedBoards.length === 0 ? (
              <div className="dashboard__empty">
                <p>Aún no participas en ningún tablero compartido.</p>
                <p style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
                  Inicia o únete a una sesión de colaboración en vivo para que
                  aparezca aquí.
                </p>
              </div>
            ) : (
              <div className="dashboard__shared-grid">
                {sharedBoards.map((board) => (
                  <SharedBoardCard
                    key={board.id}
                    board={board}
                    currentUserId={user.id}
                    onJoin={onOpenSharedBoard}
                    onLeave={handleLeaveSharedBoard}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="dashboard__section-header">
              <h2>
                {activeTab === "recent" ? "Recientes" : "Mis tableros"}
                {!loading &&
                  (activeTab === "recent"
                    ? recentItems.length > 0
                    : privateBoards.length > 0) && (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 400,
                        color: "#9ca3af",
                        marginLeft: "0.5rem",
                      }}
                    >
                      {activeTab === "recent"
                        ? `(${recentItems.length})`
                        : `(${privateBoards.length})`}
                    </span>
                  )}
              </h2>
              <button className="dashboard__new-btn" onClick={onNewBoard}>
                + Nuevo board
              </button>
            </div>

            {loading ? (
              <div className="dashboard__loading">
                <p>Cargando boards...</p>
              </div>
            ) : activeTab === "recent" && recentItems.length === 0 ? (
              <div className="dashboard__empty">
                <PencilIcon />
                <p>No tienes boards aún.</p>
                <button className="dashboard__new-btn" onClick={onNewBoard}>
                  Crear tu primer board
                </button>
              </div>
            ) : activeTab === "all" && displayedBoards.length === 0 ? (
              <div className="dashboard__empty">
                <PencilIcon />
                <p>No tienes boards guardados.</p>
                <button className="dashboard__new-btn" onClick={onNewBoard}>
                  Crear tu primer board
                </button>
              </div>
            ) : activeTab === "recent" ? (
              <div className="dashboard__grid">
                {recentItems.map((item) =>
                  item.type === "own" ? (
                    <BoardCard
                      key={`own:${item.board.id}`}
                      board={item.board}
                      onOpen={handleOpenBoard}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onClearCollabLink={handleClearCollabLink}
                    />
                  ) : (
                    <SharedBoardCard
                      key={`shared:${item.board.id}`}
                      board={item.board}
                      currentUserId={user.id}
                      onJoin={onOpenSharedBoard}
                      onLeave={handleLeaveSharedBoard}
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="dashboard__grid">
                {displayedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    onOpen={handleOpenBoard}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    onClearCollabLink={handleClearCollabLink}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
