import React, { useCallback, useEffect, useRef, useState } from "react";

import { THEME } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faBan,
  faCheck,
  faPenToSquare,
  faUser,
  faUserShield,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";

import { activeBoardAtom, appJotaiStore } from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCollaborationLinkData } from "../data";
import { DrawingsStore } from "../data/DrawingsStore";
import { SharedBoardsStore } from "../data/SharedBoardsStore";
import {
  UserManagementStore,
  type ManagedUserProfile,
  type UserRole,
  type UserStatus,
} from "../data/UserManagementStore";
import { destroyCollabRoomInFirebase, loadFromFirebase } from "../data/firebase";
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
    return t("app.justNow");
  }
  if (diff < 3_600_000) {
    return t("app.minutesAgo", { count: Math.floor(diff / 60_000) });
  }
  if (diff < 86_400_000) {
    return t("app.hoursAgo", { count: Math.floor(diff / 3_600_000) });
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

const getUserStatusLabel = (status: UserStatus): string => {
  switch (status) {
    case "active":
      return t("app.userStatusActive");
    case "disabled":
      return t("app.userStatusDisabled");
    case "banned":
      return t("app.userStatusBanned");
    default:
      return status;
  }
};

const getUserRoleLabel = (role: UserRole): string => {
  return role === "admin" ? t("app.userRoleAdmin") : t("app.userRoleUser");
};

const getStatusPalette = (
  status: UserStatus,
  isDark: boolean,
): { background: string; color: string; borderColor: string } => {
  if (status === "active") {
    return {
      background: isDark ? "#143223" : "#dcfce7",
      color: isDark ? "#86efac" : "#166534",
      borderColor: isDark ? "#166534" : "#86efac",
    };
  }
  if (status === "disabled") {
    return {
      background: isDark ? "#2e2e4a" : "#f3f4f6",
      color: isDark ? "#d1d5db" : "#4b5563",
      borderColor: isDark ? "#4b5563" : "#d1d5db",
    };
  }
  return {
    background: isDark ? "#321718" : "#fee2e2",
    color: isDark ? "#fca5a5" : "#991b1b",
    borderColor: isDark ? "#7f1d1d" : "#fca5a5",
  };
};

const getRolePalette = (
  role: UserRole,
  isDark: boolean,
): { background: string; color: string; borderColor: string } => {
  if (role === "admin") {
    return {
      background: isDark ? "#1f2457" : "#e0e7ff",
      color: isDark ? "#a5b4fc" : "#3730a3",
      borderColor: isDark ? "#4338ca" : "#a5b4fc",
    };
  }
  return {
    background: isDark ? "#1f2937" : "#f8fafc",
    color: isDark ? "#cbd5e1" : "#475569",
    borderColor: isDark ? "#475569" : "#cbd5e1",
  };
};

const getActionButtonStyle = (
  tone: "primary" | "neutral" | "danger",
  isDark: boolean,
): React.CSSProperties => {
  if (tone === "primary") {
    return {
      background: "#6965db",
      color: "#ffffff",
      border: "none",
    };
  }

  if (tone === "danger") {
    return {
      background: isDark ? "#321718" : "#fff1f2",
      color: isDark ? "#fca5a5" : "#b91c1c",
      border: `1px solid ${isDark ? "#7f1d1d" : "#fecdd3"}`,
    };
  }

  return {
    background: "transparent",
    color: isDark ? "#d1d5db" : "#374151",
    border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
  };
};

const getActionIconButtonStyle = (
  tone: "primary" | "neutral" | "danger",
  isDark: boolean,
): React.CSSProperties => ({
  ...getActionButtonStyle(tone, isDark),
  width: "2.5rem",
  height: "2.5rem",
  padding: 0,
  borderRadius: "999px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1rem",
});

interface BoardCardProps {
  board: DrawingRecord;
  onOpen: (board: DrawingRecord) => void | Promise<void>;
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
      title: t("app.deleteCollabLink"),
      text: t("app.deleteCollabLinkText"),
      confirmButtonText: t("app.delete"),
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
      onClick={() => {
        if (!isEditing) {
          void onOpen(board);
        }
      }}
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
        <span className="dashboard__card-date">{formatDate(board.updatedAt)}</span>
        {board.collabLink && (
          <div className="dashboard__card-collab-row">
            <button
              className="dashboard__card-collab"
              title={t("app.copyCollabLinkTitle")}
              onClick={copyCollabLink}
            >
              {copied ? t("app.copied") : t("app.copyLink")}
            </button>
            <button
              className="dashboard__card-collab-clear"
              title={t("app.deleteCollabLinkTitle")}
              onClick={clearCollabLink}
            >
              x
            </button>
          </div>
        )}
      </div>
      <button
        className="dashboard__card-rename"
        title={t("app.renameBoard")}
        onClick={startRename}
      >
        Edit
      </button>
      <button
        className="dashboard__card-delete"
        title={t("app.deleteBoard")}
        onClick={(e) => onDelete(board.id, e)}
      >
        x
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
  const maxAvatars = 4;
  const visibleMembers = board.members.slice(0, maxAvatars);
  const overflow = board.members.length - maxAvatars;

  return (
    <div className="dashboard__shared-card" onClick={() => onJoin(board)}>
      <div className="dashboard__shared-card-header">
        <span className="dashboard__shared-card-name" title={board.name}>
          {board.name}
        </span>
        {isOwner && (
          <span className="dashboard__shared-card-owner-badge">{t("app.yours")}</span>
        )}
      </div>

      <div className="dashboard__shared-card-members">
        {visibleMembers.map((member) => (
          <span
            key={member.userId}
            className={`dashboard__shared-card-avatar${
              member.userId === currentUserId ? " current" : ""
            }`}
            title={member.username}
          >
            {member.username.charAt(0).toUpperCase()}
          </span>
        ))}
        {overflow > 0 && (
          <span className="dashboard__shared-card-avatar overflow">+{overflow}</span>
        )}
        <span className="dashboard__shared-card-member-names">
          {board.members.map((member) => member.username).join(", ")}
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
          {t("app.open")}
        </button>
        <button
          className="dashboard__shared-card-leave"
          title={isOwner ? t("app.finalizeSession") : t("app.leaveSharedBoard")}
          onClick={(e) => {
            e.stopPropagation();
            onLeave(board);
          }}
        >
          {isOwner ? t("app.finalizeSession") : t("app.leave")}
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

type Tab = "recent" | "all" | "shared" | "users";
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
  const [managedUsers, setManagedUsers] = useState<ManagedUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { editorTheme, setAppTheme } = useHandleAppTheme();
  const isDark = editorTheme === THEME.DARK;
  const isAdmin = user.role === "admin";

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    if (!isAdmin && activeTab === "users") {
      setActiveTab("recent");
    }
  }, [activeTab, isAdmin]);

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

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setUsersLoading(true);
    setUsersError(null);
    try {
      const profiles = await UserManagementStore.getAll();
      setManagedUsers(profiles);
      setSelectedUserId((prev) => {
        if (prev && profiles.some((profile) => profile.id === prev)) {
          return prev;
        }
        return profiles[0]?.id ?? null;
      });
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : String(error));
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (activeTab === "users" && isAdmin) {
      void fetchUsers();
    }
  }, [activeTab, fetchUsers, isAdmin]);

  const syncManagedUser = useCallback((updatedProfile: ManagedUserProfile) => {
    setManagedUsers((prev) =>
      prev.map((profile) =>
        profile.id === updatedProfile.id ? updatedProfile : profile,
      ),
    );
  }, []);

  const ensureUserIsManageable = useCallback(
    async (profile: ManagedUserProfile): Promise<boolean> => {
      if (profile.id !== user.id) {
        return true;
      }
      await appDialog.alert({
        title: t("app.cannotManageCurrentUser"),
        text: t("app.cannotManageCurrentUserText"),
        icon: "warning",
      });
      return false;
    },
    [user.id],
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await appDialog.confirm({
      title: t("app.deleteBoard"),
      text: t("app.deleteBoardConfirm"),
      confirmButtonText: t("app.delete"),
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await DrawingsStore.delete(id);
    setBoards((prev) => prev.filter((board) => board.id !== id));
  };

  const handleRename = async (id: string, newName: string) => {
    const isTaken = await DrawingsStore.isNameTaken(newName, id);
    if (isTaken) {
      await appDialog.alert({
        title: t("app.duplicateName"),
        icon: "warning",
      });
      return;
    }
    await DrawingsStore.rename(id, newName);
    const now = Date.now();
    setBoards((prev) =>
      prev.map((board) =>
        board.id === id ? { ...board, name: newName, updatedAt: now } : board,
      ),
    );
    const active = appJotaiStore.get(activeBoardAtom);
    if (active?.id === id) {
      appJotaiStore.set(activeBoardAtom, { ...active, name: newName });
    }
  };

  const handleClearCollabLink = async (id: string) => {
    await DrawingsStore.setCollabLink(id, null);
    setBoards((prev) =>
      prev.map((board) =>
        board.id === id ? { ...board, collabLink: null } : board,
      ),
    );
  };

  const handleLeaveSharedBoard = async (board: SharedBoard) => {
    const isOwner = board.createdBy === user.id;
    const choice = await appDialog.choose({
      title: isOwner ? t("app.deleteSharedBoard") : t("app.leaveSharedBoard"),
      text: t("app.leaveSharedSaveDraftText"),
      confirmButtonText: t("app.saveDraft"),
      denyButtonText: isOwner
        ? t("app.finalizeWithoutSaving")
        : t("app.leaveWithoutSaving"),
      cancelButtonText: t("app.cancel"),
      icon: "question",
      confirmButtonVariant: "primary",
      denyButtonVariant: isOwner ? "danger" : "default",
    });
    if (choice === "cancel") {
      return;
    }

    const shouldSaveDraft = choice === "confirm";
    const linkedBoards = isOwner
      ? boards.filter(
          (ownBoard) =>
            getRoomIdFromCollabLink(ownBoard.collabLink) === board.roomId,
        )
      : [];

    let persistedBoards: DrawingRecord[] = [];
    if (shouldSaveDraft) {
      try {
        const remoteElements = await loadFromFirebase(
          board.roomId,
          board.roomKey,
          null,
        );
        const draftElements = remoteElements ?? [];

        if (isOwner && linkedBoards.length > 0) {
          persistedBoards = await Promise.all(
            linkedBoards.map((ownBoard) =>
              DrawingsStore.save(
                {
                  name: ownBoard.name,
                  elements: draftElements,
                  appState: ownBoard.appState,
                  thumbnail: ownBoard.thumbnail,
                  collabLink: null,
                  userId: ownBoard.userId,
                },
                ownBoard.id,
              ),
            ),
          );

          setBoards((prev) =>
            prev.map((ownBoard) => {
              const updated = persistedBoards.find(
                (persistedBoard) => persistedBoard.id === ownBoard.id,
              );
              return updated ?? ownBoard;
            }),
          );
        }

        if (!isOwner) {
          const draftBoard = await DrawingsStore.save({
            name: `${board.name} (${t("app.draft")})`,
            elements: draftElements,
            appState: { viewBackgroundColor: "#ffffff" },
            thumbnail: null,
            collabLink: null,
            userId: user.id,
          });
          setBoards((prev) => [draftBoard, ...prev]);
        }
      } catch (error) {
        console.error(
          "Failed to persist shared board draft before leaving:",
          error,
        );
      }
    }

    if (isOwner) {
      await Promise.all([
        SharedBoardsStore.leaveByRoom(board.roomId, board.roomKey),
        destroyCollabRoomInFirebase(board.roomId),
      ]);
    } else {
      await SharedBoardsStore.leaveByRoom(board.roomId, board.roomKey);
    }

    if (isOwner) {
      if (shouldSaveDraft) {
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
      } else {
        await Promise.all(
          linkedBoards.map((ownBoard) => DrawingsStore.delete(ownBoard.id)),
        );
        setBoards((prev) =>
          prev.filter(
            (ownBoard) =>
              getRoomIdFromCollabLink(ownBoard.collabLink) !== board.roomId,
          ),
        );
      }
    }

    setSharedBoards((prev) => prev.filter((item) => item.id !== board.id));
  };

  const handleOpenBoard = async (board: DrawingRecord) => {
    await onOpenBoard(board);
  };

  const handleOpenSharedBoard = async (board: SharedBoard) => {
    const stillExists = await SharedBoardsStore.isVisibleByRoom(
      board.roomId,
      board.roomKey,
    );

    if (!stillExists) {
      setSharedBoards((prev) => prev.filter((item) => item.id !== board.id));
      await appDialog.alert({
        title: t("app.collaborationClosedTitle"),
        text: t("app.collaborationClosedText"),
        icon: "warning",
      });
      return;
    }

    await onOpenSharedBoard(board);
  };

  const handleEditManagedUsername = async (profile: ManagedUserProfile) => {
    if (!(await ensureUserIsManageable(profile))) {
      return;
    }

    const nextUsername = await appDialog.promptText({
      title: t("app.editUsername"),
      label: t("app.newUsername"),
      initialValue: profile.username,
      confirmButtonText: t("app.save"),
      requiredMessage: t("app.fieldRequired"),
      maxLength: 60,
    });

    if (!nextUsername || nextUsername === profile.username) {
      return;
    }

    if (nextUsername.trim().length < 2) {
      await appDialog.alert({
        title: t("auth.errors.usernameMinLength"),
        icon: "warning",
      });
      return;
    }

    try {
      const updated = await UserManagementStore.updateProfile(profile.id, {
        username: nextUsername,
      });
      syncManagedUser(updated);
    } catch (error) {
      await appDialog.error(
        t("app.userActionFailed"),
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleManagedRoleChange = async (
    profile: ManagedUserProfile,
    nextRole: UserRole,
  ) => {
    if (!(await ensureUserIsManageable(profile))) {
      return;
    }

    const confirmed = await appDialog.confirm({
      title: nextRole === "admin" ? t("app.makeAdmin") : t("app.makeUser"),
      text: `${t("app.user")}: ${profile.username}`,
      confirmButtonText: t("app.confirm"),
    });

    if (!confirmed) {
      return;
    }

    try {
      const updated = await UserManagementStore.updateProfile(profile.id, {
        role: nextRole,
      });
      syncManagedUser(updated);
    } catch (error) {
      await appDialog.error(
        t("app.userActionFailed"),
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleManagedStatusChange = async (
    profile: ManagedUserProfile,
    nextStatus: UserStatus,
  ) => {
    if (!(await ensureUserIsManageable(profile))) {
      return;
    }

    const titleByStatus: Record<UserStatus, string> = {
      active: t("app.activateUser"),
      disabled: t("app.disableUser"),
      banned: t("app.banUser"),
    };

    const confirmed = await appDialog.confirm({
      title: titleByStatus[nextStatus],
      text: `${t("app.user")}: ${profile.username}`,
      confirmButtonText: t("app.confirm"),
      danger: nextStatus === "banned",
    });

    if (!confirmed) {
      return;
    }

    try {
      const updated = await UserManagementStore.updateProfile(profile.id, {
        status: nextStatus,
      });
      syncManagedUser(updated);
    } catch (error) {
      await appDialog.error(
        t("app.userActionFailed"),
        error instanceof Error ? error.message : String(error),
      );
    }
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

  const displayedBoards = activeTab === "all" ? privateBoards : [];
  const selectedManagedUser =
    managedUsers.find((profile) => profile.id === selectedUserId) ??
    managedUsers[0] ??
    null;

  const panelBackground = isDark ? "#1e1e2e" : "#ffffff";
  const panelBorder = isDark ? "#2e2e4a" : "#e5e7eb";
  const secondaryBackground = isDark ? "#242436" : "#f8fafc";
  const titleColor = isDark ? "#e1e1f0" : "#1a1a2e";
  const mutedColor = isDark ? "#9ca3af" : "#6b7280";

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
            className={`dashboard__tab${activeTab === "recent" ? " active" : ""}`}
            onClick={() => setActiveTab("recent")}
          >
            {t("app.recent")}
          </button>
          <button
            className={`dashboard__tab${activeTab === "all" ? " active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            {t("app.myBoards")}
          </button>
          <button
            className={`dashboard__tab${activeTab === "shared" ? " active" : ""}`}
            onClick={() => setActiveTab("shared")}
          >
            {t("app.shared")}
            {sharedBoards.length > 0 && (
              <span className="dashboard__tab-badge">{sharedBoards.length}</span>
            )}
          </button>
          {isAdmin && (
            <button
              className={`dashboard__tab${activeTab === "users" ? " active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              {t("app.userManagement")}
              {managedUsers.length > 0 && (
                <span className="dashboard__tab-badge">{managedUsers.length}</span>
              )}
            </button>
          )}
        </nav>

        <div className="dashboard__user">
          <span className="dashboard__username">{user.username}</span>
          <button
            className="dashboard__theme-toggle"
            onClick={() => setAppTheme(isDark ? THEME.LIGHT : THEME.DARK)}
            title={isDark ? t("app.switchToLight") : t("app.switchToDark")}
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
            {t("app.logOut")}
          </button>
        </div>
      </header>

      <main className="dashboard__main">
        {activeTab === "users" ? (
          <>
            <div className="dashboard__section-header">
              <h2>
                {t("app.userManagement")}
                {!usersLoading && managedUsers.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 400,
                      color: mutedColor,
                      marginLeft: "0.5rem",
                    }}
                  >
                    ({managedUsers.length})
                  </span>
                )}
              </h2>
              <button
                className="dashboard__shared-refresh"
                onClick={() => {
                  void fetchUsers();
                }}
                disabled={usersLoading}
                title={t("app.refreshUsers")}
                aria-label={t("app.refreshUsers")}
              >
                <FontAwesomeIcon
                  icon={faArrowsRotate}
                  className={`dashboard__shared-refresh-icon${
                    usersLoading ? " dashboard__shared-refresh-icon--spinning" : ""
                  }`}
                />
              </button>
            </div>
            {usersError && (
              <div className="dashboard__shared-error">
                <strong>{t("app.errorLoadingUsers")}</strong> {usersError}
              </div>
            )}
            {usersLoading ? (
              <div className="dashboard__loading">
                <p>{t("app.loadingUsers")}</p>
              </div>
            ) : managedUsers.length === 0 ? (
              <div className="dashboard__empty">
                <p>{t("app.noUsers")}</p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "1.25rem",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    background: panelBackground,
                    border: `1.5px solid ${panelBorder}`,
                    borderRadius: "12px",
                    padding: "0.75rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {managedUsers.map((profile) => {
                    const selected = profile.id === selectedManagedUser?.id;
                    const rolePalette = getRolePalette(profile.role, isDark);
                    const statusPalette = getStatusPalette(profile.status, isDark);
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setSelectedUserId(profile.id)}
                        style={{
                          textAlign: "left",
                          width: "100%",
                          padding: "0.85rem",
                          borderRadius: "10px",
                          border: `1.5px solid ${selected ? "#6965db" : panelBorder}`,
                          background: selected
                            ? isDark
                              ? "#1e1e4a"
                              : "#f5f3ff"
                            : secondaryBackground,
                          color: titleColor,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.55rem",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                            {profile.username}
                          </div>
                          <div
                            style={{
                              color: mutedColor,
                              fontSize: "0.8rem",
                              marginTop: "0.2rem",
                              wordBreak: "break-word",
                            }}
                          >
                            {profile.email}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.45rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              ...rolePalette,
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderRadius: "999px",
                              padding: "0.18rem 0.55rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            {getUserRoleLabel(profile.role)}
                          </span>
                          <span
                            style={{
                              ...statusPalette,
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderRadius: "999px",
                              padding: "0.18rem 0.55rem",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                            }}
                          >
                            {getUserStatusLabel(profile.status)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedManagedUser && (
                  <div
                    style={{
                      background: panelBackground,
                      border: `1.5px solid ${panelBorder}`,
                      borderRadius: "12px",
                      padding: "1rem",
                      color: titleColor,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        marginBottom: "1rem",
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "1.1rem",
                            fontWeight: 700,
                          }}
                        >
                          {selectedManagedUser.username}
                        </h3>
                        <p
                          style={{
                            margin: "0.35rem 0 0",
                            color: mutedColor,
                            fontSize: "0.9rem",
                            wordBreak: "break-word",
                          }}
                        >
                          {selectedManagedUser.email}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            ...getRolePalette(selectedManagedUser.role, isDark),
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "999px",
                            padding: "0.18rem 0.55rem",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {getUserRoleLabel(selectedManagedUser.role)}
                        </span>
                        <span
                          style={{
                            ...getStatusPalette(selectedManagedUser.status, isDark),
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "999px",
                            padding: "0.18rem 0.55rem",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {getUserStatusLabel(selectedManagedUser.status)}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "0.85rem",
                      }}
                    >
                      {[
                        [t("auth.fields.username"), selectedManagedUser.username],
                        [t("app.userEmail"), selectedManagedUser.email],
                        [t("app.userRole"), getUserRoleLabel(selectedManagedUser.role)],
                        [t("app.userStatus"), getUserStatusLabel(selectedManagedUser.status)],
                        [t("app.userJoined"), formatDate(selectedManagedUser.createdAt)],
                        [t("app.userLastUpdate"), formatDate(selectedManagedUser.updatedAt)],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          style={{
                            background: secondaryBackground,
                            border: `1px solid ${panelBorder}`,
                            borderRadius: "10px",
                            padding: "0.75rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: mutedColor,
                              marginBottom: "0.35rem",
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: 600,
                              wordBreak: "break-word",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p
                      style={{
                        margin: "1rem 0 0",
                        fontSize: "0.85rem",
                        color: mutedColor,
                      }}
                    >
                      {t("app.userEmailReadOnlyHint")}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.65rem",
                        marginTop: "1rem",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void handleEditManagedUsername(selectedManagedUser);
                        }}
                        title={t("app.editUsername")}
                        aria-label={t("app.editUsername")}
                        style={{
                          ...getActionIconButtonStyle("primary", isDark),
                        }}
                      >
                        <FontAwesomeIcon icon={faPenToSquare} />
                      </button>

                      {selectedManagedUser.role === "admin" ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedRoleChange(selectedManagedUser, "user");
                          }}
                          title={t("app.makeUser")}
                          aria-label={t("app.makeUser")}
                          style={{
                            ...getActionIconButtonStyle("neutral", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faUser} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedRoleChange(selectedManagedUser, "admin");
                          }}
                          title={t("app.makeAdmin")}
                          aria-label={t("app.makeAdmin")}
                          style={{
                            ...getActionIconButtonStyle("neutral", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faUserShield} />
                        </button>
                      )}

                      {selectedManagedUser.status !== "active" && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedStatusChange(selectedManagedUser, "active");
                          }}
                          title={t("app.activateUser")}
                          aria-label={t("app.activateUser")}
                          style={{
                            ...getActionIconButtonStyle("neutral", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      )}

                      {selectedManagedUser.status !== "disabled" && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedStatusChange(selectedManagedUser, "disabled");
                          }}
                          title={t("app.disableUser")}
                          aria-label={t("app.disableUser")}
                          style={{
                            ...getActionIconButtonStyle("neutral", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faUserSlash} />
                        </button>
                      )}

                      {selectedManagedUser.status !== "banned" && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedStatusChange(selectedManagedUser, "banned");
                          }}
                          title={t("app.banUser")}
                          aria-label={t("app.banUser")}
                          style={{
                            ...getActionIconButtonStyle("danger", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faBan} />
                        </button>
                      )}
                    </div>

                    {selectedManagedUser.id === user.id && (
                      <p
                        style={{
                          margin: "0.9rem 0 0",
                          color: mutedColor,
                          fontSize: "0.85rem",
                        }}
                      >
                        {t("app.cannotManageCurrentUserText")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : activeTab === "shared" ? (
          <>
            <div className="dashboard__section-header">
              <h2>
                {t("app.sharedBoards")}
                {!loading && sharedBoards.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 400,
                      color: mutedColor,
                      marginLeft: "0.5rem",
                    }}
                  >
                    ({sharedBoards.length})
                  </span>
                )}
              </h2>
              <button
                className="dashboard__shared-refresh"
                onClick={() => {
                  void fetchBoards();
                }}
                disabled={loading}
                title={t("app.refreshSharedBoards")}
                aria-label={t("app.refreshSharedBoards")}
              >
                <FontAwesomeIcon
                  icon={faArrowsRotate}
                  className={`dashboard__shared-refresh-icon${
                    loading ? " dashboard__shared-refresh-icon--spinning" : ""
                  }`}
                />
              </button>
            </div>
            {sharedError && (
              <div className="dashboard__shared-error">
                <strong>{t("app.errorLoadingSharedBoards")}</strong> {sharedError}
              </div>
            )}
            {loading ? (
              <div className="dashboard__loading">
                <p>{t("app.loadingSharedBoards")}</p>
              </div>
            ) : sharedBoards.length === 0 ? (
              <div className="dashboard__empty">
                <p>{t("app.noSharedBoards")}</p>
                <p style={{ fontSize: "0.875rem", color: mutedColor }}>
                  {t("app.sharedBoardsHint")}
                </p>
              </div>
            ) : (
              <div className="dashboard__shared-grid">
                {sharedBoards.map((board) => (
                  <SharedBoardCard
                    key={board.id}
                    board={board}
                    currentUserId={user.id}
                    onJoin={handleOpenSharedBoard}
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
                {activeTab === "recent" ? t("app.recent") : t("app.myBoards")}
                {!loading &&
                  (activeTab === "recent"
                    ? recentItems.length > 0
                    : privateBoards.length > 0) && (
                    <span
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 400,
                        color: mutedColor,
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
                {t("app.newBoard")}
              </button>
            </div>

            {loading ? (
              <div className="dashboard__loading">
                <p>{t("app.loadingBoards")}</p>
              </div>
            ) : activeTab === "recent" && recentItems.length === 0 ? (
              <div className="dashboard__empty">
                <PencilIcon />
                <p>{t("app.noBoards")}</p>
                <button className="dashboard__new-btn" onClick={onNewBoard}>
                  {t("app.createFirstBoard")}
                </button>
              </div>
            ) : activeTab === "all" && displayedBoards.length === 0 ? (
              <div className="dashboard__empty">
                <PencilIcon />
                <p>{t("app.noSavedBoards")}</p>
                <button className="dashboard__new-btn" onClick={onNewBoard}>
                  {t("app.createFirstBoard")}
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
                      onJoin={handleOpenSharedBoard}
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


