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

  async isVisibleByRoom(roomId: string, roomKey: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("shared_boards")
      .select("id")
      .eq("room_id", roomId)
      .eq("room_key", roomKey)
      .maybeSingle();

    if (error) {
      logQueryError("isVisibleByRoom", error);
      return false;
    }
    return !!data?.id;
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
