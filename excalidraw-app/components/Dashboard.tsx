import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { THEME, exportToBlob } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownAZ,
  faArrowDownWideShort,
  faArrowDownZA,
  faArrowUpWideShort,
  faArrowsRotate,
  faCheck,
  faMagnifyingGlass,
  faPenToSquare,
  faTrashCan,
  faUser,
  faUserShield,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";
import {
  getNonDeletedElements,
  isInitializedImageElement,
} from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";

import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import { activeBoardAtom, appJotaiStore } from "../app-jotai";
import { appDialog } from "../appDialog";
import { FIREBASE_STORAGE_PREFIXES } from "../app_constants";
import {
  AUTH_FIELD_LIMITS,
  MAX_FIELD_LENGTH,
  normalizeUsername,
  validateUsername,
} from "../auth/authValidation";
import { updateCurrentUsername, type AuthUser } from "../auth/authStore";
import { getCollaborationLinkData } from "../data";
import { DrawingsStore } from "../data/DrawingsStore";
import { SharedBoardsStore } from "../data/SharedBoardsStore";
import {
  UserManagementStore,
  type ManagedUserProfile,
  type UserRole,
  type UserStatus,
} from "../data/UserManagementStore";
import { loadFilesFromFirebase, loadFromFirebase } from "../data/firebase";
import { getErrorMessage } from "../errorMessages";
import { useHandleAppTheme } from "../useHandleAppTheme";

import "./Dashboard.scss";

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
  tone: "primary" | "neutral" | "danger" | "success",
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

  if (tone === "success") {
    return {
      background: isDark ? "#132a1c" : "#f0fdf4",
      color: isDark ? "#86efac" : "#15803d",
      border: `1px solid ${isDark ? "#14532d" : "#bbf7d0"}`,
    };
  }

  return {
    background: "transparent",
    color: isDark ? "#d1d5db" : "#374151",
    border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
  };
};

const getActionIconButtonStyle = (
  tone: "primary" | "neutral" | "danger" | "success",
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

const loadSharedBoardFiles = async (
  board: SharedBoard,
  elements: DrawingRecord["elements"],
): Promise<BinaryFiles> => {
  const fileIds = elements.reduce((acc, element) => {
    if (isInitializedImageElement(element)) {
      acc.push(element.fileId);
    }
    return acc;
  }, [] as FileId[]);

  if (!fileIds.length) {
    return {};
  }

  const { loadedFiles } = await loadFilesFromFirebase(
    `${FIREBASE_STORAGE_PREFIXES.collabFiles}/${board.roomId}`,
    board.roomKey,
    fileIds,
  );

  return Object.fromEntries(
    loadedFiles.map((file) => [file.id, file]),
  ) as BinaryFiles;
};

const blobToDataURL = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// shared_boards.updated_at doesn't change when the scene is edited (the scene
// lives in collab_rooms), so previews are keyed by room and regenerated on
// every board-list fetch instead
const getSharedBoardPreviewKey = (board: SharedBoard): string => board.roomId;

const createDashboardThumbnail = async (
  elements: DrawingRecord["elements"],
  files: BinaryFiles,
  viewBackgroundColor = "#ffffff",
): Promise<string | null> => {
  // room scenes keep recently deleted elements (isDeleted) so deletions sync
  // between peers; the exporter doesn't filter them, so drop them here
  const visibleElements = getNonDeletedElements(elements);
  if (!visibleElements.length) {
    return null;
  }

  const blob = await exportToBlob({
    elements: visibleElements,
    appState: { viewBackgroundColor, exportBackground: true },
    files,
    maxWidthOrHeight: 200,
  });

  return blobToDataURL(blob);
};

const createSharedBoardThumbnail = async (
  board: SharedBoard,
): Promise<string | null> => {
  const elements = await loadFromFirebase(board.roomId, board.roomKey, null);
  const visibleElements = getNonDeletedElements(elements ?? []);

  if (!visibleElements.length) {
    return null;
  }

  const files = await loadSharedBoardFiles(board, visibleElements);
  return createDashboardThumbnail(visibleElements, files);
};

interface BoardCardProps {
  board: DrawingRecord;
  onOpen: (board: DrawingRecord) => void | Promise<void>;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => Promise<void>;
}

const BoardCard: React.FC<BoardCardProps> = ({
  board,
  onOpen,
  onDelete,
  onRename,
}) => {
  // same modal as "Renombrar tablero" in the editor menu
  const startRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextName = await appDialog.promptText({
      title: t("app.renameBoard"),
      label: t("app.newName"),
      initialValue: board.name,
      confirmButtonText: t("app.rename"),
      requiredMessage: t("app.enterBoardName"),
    });
    if (nextName && nextName !== board.name) {
      await onRename(board.id, nextName);
    }
  };

  return (
    <div className="dashboard__card" onClick={() => void onOpen(board)}>
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
        <span
          className="dashboard__card-name"
          title={board.name}
          onDoubleClick={startRename}
        >
          {board.name}
        </span>
        <span className="dashboard__card-date">
          {formatDate(board.updatedAt)}
        </span>
      </div>
      <div className="dashboard__card-actions">
        <button
          className="dashboard__card-action dashboard__card-rename"
          title={t("app.renameBoard")}
          aria-label={t("app.renameBoard")}
          onClick={startRename}
        >
          <FontAwesomeIcon icon={faPenToSquare} />
        </button>
        <button
          className="dashboard__card-action dashboard__card-delete"
          title={t("app.deleteBoard")}
          aria-label={t("app.deleteBoard")}
          onClick={(e) => onDelete(board.id, e)}
        >
          <FontAwesomeIcon icon={faTrashCan} />
        </button>
      </div>
    </div>
  );
};

interface SharedBoardCardProps {
  board: SharedBoard;
  currentUserId: string;
  thumbnail: string | null;
  onJoin: (board: SharedBoard) => void;
  onLeave: (board: SharedBoard) => void;
  onDelete: (board: SharedBoard) => void;
  onRename: (board: SharedBoard) => void;
}

const SharedBoardCard: React.FC<SharedBoardCardProps> = ({
  board,
  currentUserId,
  thumbnail,
  onJoin,
  onLeave,
  onDelete,
  onRename,
}) => {
  const isOwner = board.createdBy === currentUserId;
  const maxAvatars = 4;
  const otherMembers = board.members.filter(
    (member) => member.userId !== currentUserId,
  );
  const visibleMembers = otherMembers.slice(0, maxAvatars);
  const hiddenMembers = otherMembers.slice(maxAvatars);
  const overflow = hiddenMembers.length;
  const memberNames = [
    t("app.you"),
    ...otherMembers.map((member) => member.username),
  ];
  const membersLabel = memberNames.join(", ");

  return (
    <div className="dashboard__shared-card" onClick={() => onJoin(board)}>
      <div className="dashboard__shared-card-thumb">
        {thumbnail ? (
          <img src={thumbnail} alt={board.name} />
        ) : (
          <div className="dashboard__shared-card-thumb-placeholder">
            <PencilIcon />
          </div>
        )}
      </div>
      {isOwner && (
        <div className="dashboard__shared-card-actions">
          <button
            className="dashboard__card-action dashboard__card-rename"
            title={t("app.renameBoard")}
            aria-label={t("app.renameBoard")}
            onClick={(e) => {
              e.stopPropagation();
              onRename(board);
            }}
          >
            <FontAwesomeIcon icon={faPenToSquare} />
          </button>
          <button
            className="dashboard__card-action dashboard__card-delete"
            title={t("app.deleteBoard")}
            aria-label={t("app.deleteBoard")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(board);
            }}
          >
            <FontAwesomeIcon icon={faTrashCan} />
          </button>
        </div>
      )}
      <div className="dashboard__shared-card-content">
        <div className="dashboard__shared-card-header">
          <span className="dashboard__shared-card-name" title={board.name}>
            {board.name}
          </span>
          {isOwner && (
            <span className="dashboard__shared-card-owner-badge">
              {t("app.yours")}
            </span>
          )}
        </div>

        <div
          className="dashboard__shared-card-members"
          aria-label={membersLabel}
        >
          {visibleMembers.map((member) => (
            <span
              key={member.userId}
              className="dashboard__shared-card-avatar"
              title={member.username}
            >
              {member.username.trim().charAt(0).toUpperCase() || "?"}
            </span>
          ))}
          {overflow > 0 && (
            <span className="dashboard__shared-card-avatar overflow">
              +{overflow}
            </span>
          )}
          <span className="dashboard__shared-card-member-names">
            {membersLabel}
          </span>
          <span
            className="dashboard__shared-card-members-popover"
            aria-hidden="true"
          >
            <span className="dashboard__shared-card-members-popover-content">
              {memberNames.map((name, index) => (
                <span
                  key={`${index}-${name}`}
                  className={`dashboard__shared-card-member-chip${
                    index === 0 ? " current" : ""
                  }`}
                >
                  {name}
                </span>
              ))}
            </span>
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
            title={
              isOwner ? t("app.finalizeSession") : t("app.leaveSharedBoard")
            }
            onClick={(e) => {
              e.stopPropagation();
              onLeave(board);
            }}
          >
            {isOwner ? t("app.finalizeSession") : t("app.leave")}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DashboardProps {
  user: AuthUser;
  onOpenBoard: (record: DrawingRecord) => void;
  onOpenSharedBoard: (board: SharedBoard) => void | Promise<void>;
  onNewBoard: () => void;
  onLogout: () => void;
}

const RECENT_LIMIT = 4;

type Tab = "all" | "shared" | "users";
type BoardSort = "newest" | "oldest" | "az" | "za";
type RecentItem =
  | { type: "own"; board: DrawingRecord; updatedAt: number }
  | { type: "shared"; board: SharedBoard; updatedAt: number };

// case- and accent-insensitive, so "diseno" finds "Diseño"
const normalizeSearchText = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

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
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [boardSort, setBoardSort] = useState<BoardSort>("newest");
  const [managedUsers, setManagedUsers] = useState<ManagedUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sharedBoardPreviews, setSharedBoardPreviews] = useState<
    Record<string, string | null>
  >({});
  const sharedBoardPreviewsRef = useRef<Record<string, string | null>>({});
  const sharedPreviewRequestsRef = useRef<Set<string>>(new Set());
  // bumped on every fetch; a preview is stale when generated for an older one
  const previewGenerationRef = useRef(0);
  const previewGenerationByKeyRef = useRef<Record<string, number>>({});
  const isMountedRef = useRef(true);

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
      setActiveTab("all");
    }
  }, [activeTab, isAdmin]);

  const fetchBoards = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setSharedError(null);
      const [all, shared] = await Promise.all([
        DrawingsStore.getAllForUser(user.id),
        SharedBoardsStore.getAll().catch((err: unknown) => {
          setSharedError(getErrorMessage(err));
          return [] as SharedBoard[];
        }),
      ]);
      previewGenerationRef.current += 1;
      setBoards(all);
      setSharedBoards(shared);
      setLoading(false);
    },
    [user.id],
  );

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
      setUsersError(getErrorMessage(error));
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  const { recentItems, myBoardItems, visibleSharedBoards } = useMemo(() => {
    const sharedRoomIds = new Set(sharedBoards.map((board) => board.roomId));
    const canTrustSharedBoardList = !loading && !sharedError;
    const boardsForDisplay = boards.map((board) => {
      const roomId = getRoomIdFromCollabLink(board.collabLink);
      return canTrustSharedBoardList && roomId && !sharedRoomIds.has(roomId)
        ? { ...board, collabLink: null }
        : board;
    });
    const privateBoards = boardsForDisplay.filter(
      (board) => !getRoomIdFromCollabLink(board.collabLink),
    );
    // the full list has every own board; one in an active room shows as its
    // shared card, like in recents (once, even if several link to it)
    const sharedByRoom = new Map(
      sharedBoards.map((board) => [board.roomId, board]),
    );
    const seenRoomIds = new Set<string>();
    const myBoardItems: RecentItem[] = [];
    for (const board of boardsForDisplay) {
      const roomId = getRoomIdFromCollabLink(board.collabLink);
      const shared = roomId ? sharedByRoom.get(roomId) : undefined;
      if (!shared) {
        myBoardItems.push({
          type: "own",
          board,
          updatedAt: board.updatedAt,
        });
      } else if (!seenRoomIds.has(shared.roomId)) {
        seenRoomIds.add(shared.roomId);
        myBoardItems.push({
          type: "shared",
          board: shared,
          updatedAt: shared.updatedAt,
        });
      }
    }
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
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, RECENT_LIMIT);
    const visibleSharedBoards =
      activeTab === "shared"
        ? sharedBoards
        : activeTab === "all"
        ? [
            ...new Set(
              [...recentItems, ...myBoardItems]
                .filter(
                  (item): item is Extract<RecentItem, { type: "shared" }> =>
                    item.type === "shared",
                )
                .map((item) => item.board),
            ),
          ]
        : [];

    return { recentItems, myBoardItems, visibleSharedBoards };
  }, [activeTab, boards, loading, sharedBoards, sharedError]);

  const handleEditCurrentUsername = async () => {
    const nextUsername = await appDialog.promptText({
      title: t("app.editUsername"),
      label: t("app.newUsername"),
      initialValue: user.username,
      confirmButtonText: t("app.save"),
      requiredMessage: t("app.fieldRequired"),
      maxLength: AUTH_FIELD_LIMITS.username.max,
    });

    if (!nextUsername) {
      return;
    }

    const normalizedUsername = normalizeUsername(nextUsername);
    if (normalizedUsername === user.username) {
      return;
    }

    const validationError = validateUsername(normalizedUsername);
    if (validationError) {
      await appDialog.alert({
        title: t(validationError),
        icon: "warning",
      });
      return;
    }

    try {
      const updatedUser = await updateCurrentUsername(normalizedUsername);
      setManagedUsers((prev) =>
        prev.map((profile) =>
          profile.id === updatedUser.id
            ? { ...profile, username: updatedUser.username }
            : profile,
        ),
      );
      void appDialog.toast({ title: t("app.userUpdatedSuccessfully") });
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
    }
  };

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  // others may have edited a shared board while this tab was in background
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void fetchBoards(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchBoards]);

  useEffect(() => {
    const generation = previewGenerationRef.current;
    visibleSharedBoards.forEach((board) => {
      const previewKey = getSharedBoardPreviewKey(board);
      if (
        previewGenerationByKeyRef.current[previewKey] === generation ||
        sharedPreviewRequestsRef.current.has(previewKey)
      ) {
        return;
      }

      previewGenerationByKeyRef.current[previewKey] = generation;
      sharedPreviewRequestsRef.current.add(previewKey);
      createSharedBoardThumbnail(board)
        .then((thumbnail) => {
          if (!isMountedRef.current) {
            return;
          }
          // replace the old preview only once the new one is ready
          setSharedBoardPreviews((prev) => {
            const next = { ...prev, [previewKey]: thumbnail };
            sharedBoardPreviewsRef.current = next;
            return next;
          });
        })
        .catch((error: unknown) => {
          console.error("Failed to generate shared board preview:", error);
          if (!isMountedRef.current) {
            return;
          }
          // keep the last good preview, if any
          setSharedBoardPreviews((prev) => {
            if (Object.prototype.hasOwnProperty.call(prev, previewKey)) {
              return prev;
            }
            const next = { ...prev, [previewKey]: null };
            sharedBoardPreviewsRef.current = next;
            return next;
          });
        })
        .finally(() => {
          sharedPreviewRequestsRef.current.delete(previewKey);
        });
    });
  }, [visibleSharedBoards]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    try {
      await appDialog.withLoading(t("app.deletingBoard"), () =>
        DrawingsStore.delete(id),
      );
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
      return;
    }
    setBoards((prev) => prev.filter((board) => board.id !== id));
    void appDialog.toast({ title: t("app.boardDeletedSuccessfully") });
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
    void appDialog.toast({ title: t("app.boardRenamedSuccessfully") });
  };

  const handleRenameSharedBoard = async (board: SharedBoard) => {
    const nextName = await appDialog.promptText({
      title: t("app.renameBoard"),
      label: t("app.newName"),
      initialValue: board.name,
      confirmButtonText: t("app.rename"),
      requiredMessage: t("app.fieldRequired"),
    });

    if (!nextName || nextName === board.name) {
      return;
    }

    try {
      await SharedBoardsStore.rename(board.id, nextName);
      const now = Date.now();
      setSharedBoards((prev) =>
        prev.map((item) =>
          item.id === board.id
            ? { ...item, name: nextName, updatedAt: now }
            : item,
        ),
      );
      void appDialog.toast({ title: t("app.boardRenamedSuccessfully") });
    } catch (error: unknown) {
      await appDialog.alert({
        title: getErrorMessage(error),
        icon: "error",
      });
    }
  };

  const handleLeaveSharedBoard = async (board: SharedBoard) => {
    const isOwner = board.createdBy === user.id;
    // owners always keep a copy; deleting is the board's own delete action
    const choice = isOwner
      ? (await appDialog.confirm({
          title: t("roomDialog.button_stopSession"),
          text: t("alerts.collabStopChoicePrompt"),
          confirmButtonText: t("app.stopAndSave"),
          icon: "warning",
        }))
        ? "confirm"
        : "cancel"
      : await appDialog.choose({
          title: t("app.leaveSharedBoard"),
          text: t("app.leaveSharedSaveDraftText"),
          confirmButtonText: t("app.saveDraft"),
          denyButtonText: t("app.leaveWithoutSaving"),
          cancelButtonText: t("app.cancel"),
          icon: "question",
          confirmButtonVariant: "primary",
          denyButtonVariant: "default",
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
    const primaryLinkedBoard =
      linkedBoards.length > 0
        ? [...linkedBoards].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null;
    const duplicateLinkedBoardIds = primaryLinkedBoard
      ? linkedBoards
          .filter((ownBoard) => ownBoard.id !== primaryLinkedBoard.id)
          .map((ownBoard) => ownBoard.id)
      : [];

    let persistedBoards: DrawingRecord[] = [];
    let deletedDuplicateLinkedBoardIds: string[] = [];
    if (shouldSaveDraft) {
      try {
        const remoteElements = await loadFromFirebase(
          board.roomId,
          board.roomKey,
          null,
        );
        const draftElements = remoteElements ?? [];
        const draftFiles = await loadSharedBoardFiles(board, draftElements);
        let draftThumbnail: string | null = null;

        try {
          draftThumbnail = await createDashboardThumbnail(
            draftElements,
            draftFiles,
            primaryLinkedBoard?.appState.viewBackgroundColor ?? "#ffffff",
          );
        } catch (error) {
          console.error(
            "Failed to generate shared board draft preview:",
            error,
          );
          draftThumbnail = primaryLinkedBoard?.thumbnail ?? null;
        }

        if (isOwner) {
          const persistedBoard = await DrawingsStore.save(
            {
              name: primaryLinkedBoard?.name ?? board.name,
              elements: draftElements,
              files: draftFiles,
              appState: primaryLinkedBoard?.appState ?? {
                viewBackgroundColor: "#ffffff",
              },
              thumbnail: draftThumbnail,
              collabLink: null,
              userId: primaryLinkedBoard?.userId ?? user.id,
            },
            primaryLinkedBoard?.id,
          );
          persistedBoards = [persistedBoard];

          setBoards((prev) =>
            primaryLinkedBoard
              ? prev.map((ownBoard) =>
                  ownBoard.id === persistedBoard.id ? persistedBoard : ownBoard,
                )
              : [persistedBoard, ...prev],
          );
        }

        if (!isOwner) {
          const draftBoard = await DrawingsStore.save({
            name: `${board.name} (${t("app.draft")})`,
            elements: draftElements,
            files: draftFiles,
            appState: { viewBackgroundColor: "#ffffff" },
            thumbnail: draftThumbnail,
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
      await SharedBoardsStore.closeByRoom(board.roomId, board.roomKey);
    } else {
      await SharedBoardsStore.leaveByRoom(board.roomId, board.roomKey);
    }

    if (isOwner) {
      if (shouldSaveDraft) {
        const persistedBoard = persistedBoards[0] ?? primaryLinkedBoard;
        if (persistedBoard) {
          await DrawingsStore.setCollabLink(persistedBoard.id, null);
        }
        if (duplicateLinkedBoardIds.length > 0) {
          await Promise.all(
            duplicateLinkedBoardIds.map((id) => DrawingsStore.delete(id)),
          );
          deletedDuplicateLinkedBoardIds = duplicateLinkedBoardIds;
        }
        setBoards((prev) =>
          prev
            .filter(
              (ownBoard) =>
                !deletedDuplicateLinkedBoardIds.includes(ownBoard.id),
            )
            .map((ownBoard) =>
              ownBoard.id === persistedBoard?.id
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
    void appDialog.toast({
      title: t(
        isOwner
          ? "app.sharedSessionFinalizedSuccessfully"
          : "app.sharedBoardLeftSuccessfully",
      ),
    });
  };

  const handleDeleteSharedBoard = async (board: SharedBoard) => {
    const confirmed = await appDialog.confirm({
      title: t("app.deleteBoard"),
      text: t("app.deleteBoardConfirm"),
      confirmButtonText: t("app.delete"),
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const isLinked = (ownBoard: DrawingRecord) =>
      getRoomIdFromCollabLink(ownBoard.collabLink) === board.roomId;
    try {
      await appDialog.withLoading(t("app.deletingBoard"), async () => {
        await SharedBoardsStore.closeByRoom(board.roomId, board.roomKey);
        await Promise.all(
          boards
            .filter(isLinked)
            .map((ownBoard) => DrawingsStore.delete(ownBoard.id)),
        );
      });
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
      return;
    }
    setBoards((prev) => prev.filter((ownBoard) => !isLinked(ownBoard)));
    setSharedBoards((prev) => prev.filter((item) => item.id !== board.id));
    void appDialog.toast({ title: t("app.boardDeletedSuccessfully") });
  };

  const handleOpenBoard = async (board: DrawingRecord) => {
    // a board in an active room reopens the room, not a detached local copy
    const roomId = getRoomIdFromCollabLink(board.collabLink);
    const sharedBoard =
      roomId && sharedBoards.find((item) => item.roomId === roomId);
    if (sharedBoard) {
      await handleOpenSharedBoard(sharedBoard);
      return;
    }
    await onOpenBoard(board);
  };

  const handleOpenSharedBoard = async (board: SharedBoard) => {
    let stillExists: boolean;
    try {
      stillExists = await appDialog.withLoading(t("app.openingBoard"), () =>
        SharedBoardsStore.isVisibleByRoom(board.roomId, board.roomKey),
      );
    } catch (error) {
      // the backend couldn't confirm the state: keep the board in the list
      // and report the connection problem instead of "closed"
      await appDialog.error(
        t("app.collaborationUnreachableTitle"),
        getErrorMessage(error, t("serverErrors.network")),
      );
      return;
    }

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

  useEffect(() => {
    if (loading || sharedError) {
      return;
    }

    const liveRoomIds = new Set(sharedBoards.map((board) => board.roomId));
    const staleLinkedBoards = boards.filter((board) => {
      const roomId = getRoomIdFromCollabLink(board.collabLink);
      return roomId && !liveRoomIds.has(roomId);
    });

    if (!staleLinkedBoards.length) {
      return;
    }

    const staleBoardIds = new Set(staleLinkedBoards.map((board) => board.id));
    setBoards((prev) =>
      prev.map((board) =>
        staleBoardIds.has(board.id) ? { ...board, collabLink: null } : board,
      ),
    );

    void Promise.all(
      staleLinkedBoards.map((board) =>
        DrawingsStore.setCollabLink(board.id, null),
      ),
    ).catch((error) => {
      console.error("Failed to clear stale collaboration links:", error);
    });
  }, [boards, loading, sharedBoards, sharedError]);

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
      maxLength: AUTH_FIELD_LIMITS.username.max,
    });

    if (!nextUsername) {
      return;
    }

    const normalizedUsername = normalizeUsername(nextUsername);
    if (normalizedUsername === profile.username) {
      return;
    }

    const validationError = validateUsername(normalizedUsername);
    if (validationError) {
      await appDialog.alert({
        title: t(validationError),
        icon: "warning",
      });
      return;
    }

    try {
      const updated = await UserManagementStore.updateProfile(profile.id, {
        username: normalizedUsername,
      });
      syncManagedUser(updated);
      void appDialog.toast({ title: t("app.userUpdatedSuccessfully") });
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
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
      void appDialog.toast({ title: t("app.userUpdatedSuccessfully") });
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
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
      danger: nextStatus !== "active",
    });

    if (!confirmed) {
      return;
    }

    try {
      const updated = await UserManagementStore.updateProfile(profile.id, {
        status: nextStatus,
      });
      syncManagedUser(updated);
      void appDialog.toast({ title: t("app.userUpdatedSuccessfully") });
    } catch (error) {
      await appDialog.error(t("app.userActionFailed"), getErrorMessage(error));
    }
  };

  const selectedManagedUser =
    managedUsers.find((profile) => profile.id === selectedUserId) ??
    managedUsers[0] ??
    null;

  const searchQuery = normalizeSearchText(search);
  const matchesSearch = (name: string) =>
    normalizeSearchText(name).includes(searchQuery);
  // while searching, recents and the full list merge into one result list;
  // recents can hold others' shared boards that the full list doesn't have
  const searchResults = searchQuery
    ? [
        ...new Map(
          [...myBoardItems, ...recentItems].map((item) => [
            `${item.type}:${item.board.id}`,
            item,
          ]),
        ).values(),
      ].filter((item) => matchesSearch(item.board.name))
    : [];
  const filteredSharedBoards = sharedBoards.filter((board) =>
    matchesSearch(board.name),
  );
  const sortedMyBoardItems = [...myBoardItems].sort((a, b) => {
    if (boardSort === "az" || boardSort === "za") {
      const byName = a.board.name.localeCompare(b.board.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
      return boardSort === "az" ? byName : -byName;
    }
    return boardSort === "newest"
      ? b.updatedAt - a.updatedAt
      : a.updatedAt - b.updatedAt;
  });
  const isSortedByName = boardSort === "az" || boardSort === "za";

  const noSearchResults = (
    <div className="dashboard__empty">
      <p>{t("app.noSearchResults", { query: search.trim() })}</p>
    </div>
  );

  const renderBoardGrid = (items: RecentItem[]) => (
    <div className="dashboard__grid">
      {items.map((item) =>
        item.type === "own" ? (
          <BoardCard
            key={`own:${item.board.id}`}
            board={item.board}
            onOpen={handleOpenBoard}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ) : (
          <SharedBoardCard
            key={`shared:${item.board.id}`}
            board={item.board}
            currentUserId={user.id}
            thumbnail={
              sharedBoardPreviews[getSharedBoardPreviewKey(item.board)] ?? null
            }
            onJoin={handleOpenSharedBoard}
            onLeave={handleLeaveSharedBoard}
            onDelete={handleDeleteSharedBoard}
            onRename={handleRenameSharedBoard}
          />
        ),
      )}
    </div>
  );

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
            className={`dashboard__tab${activeTab === "all" ? " active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            {t("app.myBoards")}
          </button>
          <button
            className={`dashboard__tab${
              activeTab === "shared" ? " active" : ""
            }`}
            onClick={() => setActiveTab("shared")}
          >
            {t("app.shared")}
            {sharedBoards.length > 0 && (
              <span className="dashboard__tab-badge">
                {sharedBoards.length}
              </span>
            )}
          </button>
          {isAdmin && (
            <button
              className={`dashboard__tab${
                activeTab === "users" ? " active" : ""
              }`}
              onClick={() => setActiveTab("users")}
            >
              {t("app.userManagement")}
              {managedUsers.length > 0 && (
                <span className="dashboard__tab-badge">
                  {managedUsers.length}
                </span>
              )}
            </button>
          )}
        </nav>

        <div className="dashboard__user">
          <span className="dashboard__username">{user.username}</span>
          <button
            className="dashboard__username-edit"
            onClick={handleEditCurrentUsername}
            title={t("app.editUsername")}
            aria-label={t("app.editUsername")}
          >
            <FontAwesomeIcon icon={faPenToSquare} />
          </button>
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
        {activeTab !== "users" && (
          <label className="dashboard__search">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="dashboard__search-icon"
            />
            <input
              type="search"
              placeholder={t("app.searchBoards")}
              aria-label={t("app.searchBoards")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={MAX_FIELD_LENGTH}
            />
          </label>
        )}
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
                    usersLoading
                      ? " dashboard__shared-refresh-icon--spinning"
                      : ""
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
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
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
                    const statusPalette = getStatusPalette(
                      profile.status,
                      isDark,
                    );
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
                          border: `1.5px solid ${
                            selected ? "#6965db" : panelBorder
                          }`,
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
                      <div
                        style={{
                          display: "flex",
                          gap: "0.45rem",
                          flexWrap: "wrap",
                        }}
                      >
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
                            ...getStatusPalette(
                              selectedManagedUser.status,
                              isDark,
                            ),
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
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "0.85rem",
                      }}
                    >
                      {[
                        [
                          t("auth.fields.username"),
                          selectedManagedUser.username,
                        ],
                        [t("app.userEmail"), selectedManagedUser.email],
                        [
                          t("app.userRole"),
                          getUserRoleLabel(selectedManagedUser.role),
                        ],
                        [
                          t("app.userStatus"),
                          getUserStatusLabel(selectedManagedUser.status),
                        ],
                        [
                          t("app.userJoined"),
                          formatDate(selectedManagedUser.createdAt),
                        ],
                        [
                          t("app.userLastUpdate"),
                          formatDate(selectedManagedUser.updatedAt),
                        ],
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
                            void handleManagedRoleChange(
                              selectedManagedUser,
                              "user",
                            );
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
                            void handleManagedRoleChange(
                              selectedManagedUser,
                              "admin",
                            );
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
                            void handleManagedStatusChange(
                              selectedManagedUser,
                              "active",
                            );
                          }}
                          title={t("app.activateUser")}
                          aria-label={t("app.activateUser")}
                          style={{
                            ...getActionIconButtonStyle("success", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      )}

                      {selectedManagedUser.status !== "disabled" && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleManagedStatusChange(
                              selectedManagedUser,
                              "disabled",
                            );
                          }}
                          title={t("app.disableUser")}
                          aria-label={t("app.disableUser")}
                          style={{
                            ...getActionIconButtonStyle("danger", isDark),
                          }}
                        >
                          <FontAwesomeIcon icon={faUserSlash} />
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
                {!loading && filteredSharedBoards.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 400,
                      color: mutedColor,
                      marginLeft: "0.5rem",
                    }}
                  >
                    ({filteredSharedBoards.length})
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
                <strong>{t("app.errorLoadingSharedBoards")}</strong>{" "}
                {sharedError}
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
            ) : filteredSharedBoards.length === 0 ? (
              noSearchResults
            ) : (
              <div className="dashboard__shared-grid">
                {filteredSharedBoards.map((board) => (
                  <SharedBoardCard
                    key={board.id}
                    board={board}
                    currentUserId={user.id}
                    thumbnail={
                      sharedBoardPreviews[getSharedBoardPreviewKey(board)] ??
                      null
                    }
                    onJoin={handleOpenSharedBoard}
                    onLeave={handleLeaveSharedBoard}
                    onDelete={handleDeleteSharedBoard}
                    onRename={handleRenameSharedBoard}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="dashboard__section-header">
              <h2>
                {searchQuery ? t("app.searchResults") : t("app.recent")}
                {!loading && (searchQuery || recentItems.length > 0) && (
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 400,
                      color: mutedColor,
                      marginLeft: "0.5rem",
                    }}
                  >
                    ({searchQuery ? searchResults.length : recentItems.length})
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
            ) : recentItems.length === 0 ? (
              <div className="dashboard__empty">
                <PencilIcon />
                <p>{t("app.noBoards")}</p>
                <button className="dashboard__new-btn" onClick={onNewBoard}>
                  {t("app.createFirstBoard")}
                </button>
              </div>
            ) : searchQuery ? (
              searchResults.length > 0 ? (
                renderBoardGrid(searchResults)
              ) : (
                noSearchResults
              )
            ) : (
              <>
                {renderBoardGrid(recentItems)}
                <div className="dashboard__section-header dashboard__section-header--spaced">
                  <h2>
                    {t("app.myBoards")}
                    <span
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 400,
                        color: mutedColor,
                        marginLeft: "0.5rem",
                      }}
                    >
                      ({myBoardItems.length})
                    </span>
                  </h2>
                  <div className="dashboard__sort">
                    <button
                      type="button"
                      className={`dashboard__shared-refresh dashboard__sort-btn${
                        isSortedByName ? " active" : ""
                      }`}
                      onClick={() =>
                        setBoardSort(boardSort === "az" ? "za" : "az")
                      }
                      title={t("app.sortByName")}
                      aria-label={t("app.sortByName")}
                      aria-pressed={isSortedByName}
                    >
                      <FontAwesomeIcon
                        icon={
                          boardSort === "za" ? faArrowDownZA : faArrowDownAZ
                        }
                      />
                      <span>
                        {boardSort === "za" ? t("app.sortZA") : t("app.sortAZ")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`dashboard__shared-refresh dashboard__sort-btn${
                        isSortedByName ? "" : " active"
                      }`}
                      onClick={() =>
                        setBoardSort(
                          boardSort === "newest" ? "oldest" : "newest",
                        )
                      }
                      title={t("app.sortByDate")}
                      aria-label={t("app.sortByDate")}
                      aria-pressed={!isSortedByName}
                    >
                      <FontAwesomeIcon
                        icon={
                          boardSort === "oldest"
                            ? faArrowUpWideShort
                            : faArrowDownWideShort
                        }
                      />
                      <span>
                        {boardSort === "oldest"
                          ? t("app.sortOldest")
                          : t("app.sortNewest")}
                      </span>
                    </button>
                  </div>
                </div>
                {myBoardItems.length > 0 ? (
                  renderBoardGrid(sortedMyBoardItems)
                ) : (
                  <div className="dashboard__empty">
                    <p>{t("app.noSavedBoards")}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};
