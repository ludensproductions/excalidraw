import { translateErrorMessage } from "../errorMessages";

import { supabase } from "./supabase";

export interface SharedBoardMember {
  userId: string;
  username: string;
  joinedAt: number;
  readOnly: boolean;
}

export interface SharedBoard {
  id: string;
  roomId: string;
  roomKey: string;
  name: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  members: SharedBoardMember[];
}

type SharedBoardMemberRow = {
  user_id: string;
  username: string | null;
  joined_at: string;
  read_only: boolean | null;
};

type SharedBoardRow = {
  id: string;
  room_id: string;
  room_key: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  shared_board_members?: SharedBoardMemberRow[] | null;
};

type SharedBoardIdentityRow = {
  id: string;
  created_by: string;
};

type StoreRpcError = {
  code?: string;
  message: string;
};

/**
 * State of a shared room for the current user, as answered by the
 * `shared_room_status` RPC:
 * - active: the board exists and the user is its creator or a member
 * - no_access: the board exists but the user was removed from it
 * - closed: the owner closed/deleted it (or it never existed)
 */
export type SharedRoomStatus = "active" | "no_access" | "closed";

/**
 * Thrown when the room state can't be determined (network error, expired
 * session, 5xx). It must never be read as "the room is closed".
 */
export class SharedRoomStatusUnknownError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SharedRoomStatusUnknownError";
  }
}

const DEFAULT_MEMBER_NAME = "Usuario";
const SHARED_BOARD_SELECT =
  "id, room_id, room_key, name, created_by, created_at, updated_at, shared_board_members (user_id, username, joined_at, read_only)";

const throwStoreError = (message: string): never => {
  throw new Error(translateErrorMessage(message));
};

const logQueryError = (method: string, error: unknown): void => {
  console.error(`SharedBoardsStore.${method}:`, error);
};

const logRpcError = (
  method: string,
  rpcName: string,
  error: StoreRpcError,
): void => {
  console.error(
    `SharedBoardsStore.${method} failed (code: ${error.code}): ${error.message}`,
    `\nHint: verify that the ${rpcName} RPC exists in your Supabase project.`,
    error,
  );
};

function rowToBoard(row: SharedBoardRow): SharedBoard {
  return {
    id: row.id,
    roomId: row.room_id,
    roomKey: row.room_key,
    name: row.name,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    members: (row.shared_board_members ?? []).map((m) => ({
      userId: m.user_id,
      username: m.username ?? DEFAULT_MEMBER_NAME,
      joinedAt: new Date(m.joined_at).getTime(),
      readOnly: m.read_only ?? false,
    })),
  };
}

export const SharedBoardsStore = {
  async getByRoom(
    roomId: string,
    roomKey?: string,
  ): Promise<SharedBoard | null> {
    let query = supabase
      .from("shared_boards")
      .select(SHARED_BOARD_SELECT)
      .eq("room_id", roomId);

    if (roomKey) {
      query = query.eq("room_key", roomKey);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logQueryError("getByRoom", error);
      return null;
    }

    return data ? rowToBoard(data as SharedBoardRow) : null;
  },

  /**
   * Asks the backend whether the room is still open for the current user.
   * A failed request is retried once after refreshing the session (the most
   * common cause is a JWT that expired while the tab was in background); if
   * it still fails it throws SharedRoomStatusUnknownError instead of
   * reporting the room as closed.
   */
  async getRoomStatus(
    roomId: string,
    roomKey: string,
  ): Promise<SharedRoomStatus> {
    const fetchStatus = async (): Promise<SharedRoomStatus> => {
      const { data, error } = await supabase.rpc("shared_room_status", {
        p_room_id: roomId,
        p_room_key: roomKey,
      });

      if (!error) {
        if (data === "active" || data === "no_access" || data === "closed") {
          return data;
        }
        throw new SharedRoomStatusUnknownError(
          `Unexpected shared_room_status: ${String(data)}`,
        );
      }

      // backend without migration 0018 yet: fall back to the RLS-filtered
      // select, but still treat errors as unknown, never as closed
      if (error.code === "PGRST202") {
        const { data: row, error: selectError } = await supabase
          .from("shared_boards")
          .select("id")
          .eq("room_id", roomId)
          .eq("room_key", roomKey)
          .maybeSingle();
        if (selectError) {
          throw new SharedRoomStatusUnknownError(
            selectError.message,
            selectError,
          );
        }
        return row?.id ? "active" : "closed";
      }

      throw new SharedRoomStatusUnknownError(error.message, error);
    };

    const runSafely = () =>
      fetchStatus().catch((error: unknown) => {
        throw error instanceof SharedRoomStatusUnknownError
          ? error
          : new SharedRoomStatusUnknownError(
              error instanceof Error ? error.message : String(error),
              error,
            );
      });

    try {
      return await runSafely();
    } catch (firstError) {
      logQueryError("getRoomStatus", firstError);
      await supabase.auth.refreshSession().catch(() => undefined);
      return runSafely();
    }
  },

  /**
   * True when the room is open for the current user. Throws
   * SharedRoomStatusUnknownError when that can't be determined.
   */
  async isVisibleByRoom(roomId: string, roomKey: string): Promise<boolean> {
    return (await this.getRoomStatus(roomId, roomKey)) === "active";
  },

  async getAll(): Promise<SharedBoard[]> {
    const { data, error } = await supabase
      .from("shared_boards")
      .select(SHARED_BOARD_SELECT)
      .order("updated_at", { ascending: false });

    if (error) {
      logQueryError("getAll", error);
      return [];
    }

    return ((data ?? []) as SharedBoardRow[]).map(rowToBoard);
  },

  async getCurrentMemberUsernameByRoom(
    roomId: string,
    roomKey: string,
  ): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const board = await this.getByRoom(roomId, roomKey);
    return (
      board?.members.find((member) => member.userId === user.id)?.username ??
      null
    );
  },

  /** Creates the shared_board record if needed and registers the caller as a member. */
  async joinOrCreate(params: {
    roomId: string;
    roomKey: string;
    name: string;
    username: string;
  }): Promise<boolean> {
    const { error } = await supabase.rpc("join_shared_board", {
      p_room_id: params.roomId,
      p_room_key: params.roomKey,
      p_name: params.name,
      p_username: params.username || "Usuario",
    });

    if (error) {
      logRpcError("joinOrCreate", "join_shared_board", error);
      return false;
    }
    return this.isVisibleByRoom(params.roomId, params.roomKey);
  },

  /** Registers the caller only if the shared board was already published. */
  async joinExisting(params: {
    roomId: string;
    roomKey: string;
    username: string;
    readOnly?: boolean;
  }): Promise<boolean> {
    const { error } = await supabase.rpc("join_existing_shared_board", {
      p_room_id: params.roomId,
      p_room_key: params.roomKey,
      p_username: params.username || "Usuario",
      p_read_only: params.readOnly ?? false,
    });

    if (error) {
      logRpcError("joinExisting", "join_existing_shared_board", error);
      return false;
    }

    return this.isVisibleByRoom(params.roomId, params.roomKey);
  },

  async closeByRoom(roomId: string, roomKey: string): Promise<void> {
    const { error } = await supabase.rpc("close_shared_board", {
      p_room_id: roomId,
      p_room_key: roomKey,
    });

    if (error) {
      throwStoreError(error.message);
    }
  },

  async updateCurrentMemberUsernameByRoom(
    roomId: string,
    roomKey: string,
    username: string,
  ): Promise<void> {
    const { error } = await supabase.rpc(
      "update_shared_board_member_username",
      {
        p_room_id: roomId,
        p_room_key: roomKey,
        p_username: username,
      },
    );

    if (error) {
      throwStoreError(error.message);
    }
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("shared_boards")
      .update({ name })
      .eq("id", id);
    if (error) {
      throwStoreError(error.message);
    }
  },

  async renameByRoom(
    roomId: string,
    roomKey: string,
    name: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("shared_boards")
      .update({ name })
      .eq("room_id", roomId)
      .eq("room_key", roomKey);
    if (error) {
      throwStoreError(error.message);
    }
  },

  async leave(boardId: string, isOwner = false): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    if (isOwner) {
      const { error } = await supabase
        .from("shared_boards")
        .delete()
        .eq("id", boardId);
      if (error) {
        throwStoreError(error.message);
      }
      return;
    }
    const { error } = await supabase
      .from("shared_board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", user.id);
    if (error) {
      throwStoreError(error.message);
    }
  },

  async leaveByRoom(roomId: string, roomKey: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const { data: board, error: boardError } = await supabase
      .from("shared_boards")
      .select("id, created_by")
      .eq("room_id", roomId)
      .eq("room_key", roomKey)
      .maybeSingle();

    if (boardError) {
      logQueryError("leaveByRoom", boardError);
      return;
    }

    const sharedBoard = board as SharedBoardIdentityRow | null;

    if (!sharedBoard?.id) {
      return;
    }

    if (sharedBoard.created_by === user.id) {
      const { error } = await supabase
        .from("shared_boards")
        .delete()
        .eq("id", sharedBoard.id);
      if (error) {
        throwStoreError(error.message);
      }
      return;
    }

    const { error } = await supabase
      .from("shared_board_members")
      .delete()
      .eq("board_id", sharedBoard.id)
      .eq("user_id", user.id);
    if (error) {
      throwStoreError(error.message);
    }
  },

  async isOwnedByCurrentUser(
    roomId: string,
    roomKey: string,
  ): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }
    const { data } = await supabase
      .from("shared_boards")
      .select("created_by")
      .eq("room_id", roomId)
      .eq("room_key", roomKey)
      .maybeSingle();
    return !!(data && data.created_by === user.id);
  },
};
