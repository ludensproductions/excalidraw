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

const throwStoreError = (message: string): never => {
  throw new Error(translateErrorMessage(message));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBoard(row: any): SharedBoard {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    roomKey: row.room_key as string,
    name: row.name as string,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    members: ((row.shared_board_members ?? []) as any[]).map((m) => ({
      userId: m.user_id as string,
      username: m.username as string,
      joinedAt: new Date(m.joined_at as string).getTime(),
      readOnly: (m.read_only as boolean) ?? false,
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
      .select(
        "id, room_id, room_key, name, created_by, created_at, updated_at, shared_board_members (user_id, username, joined_at, read_only)",
      )
      .eq("room_id", roomId);

    if (roomKey) {
      query = query.eq("room_key", roomKey);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("SharedBoardsStore.getByRoom:", error);
      return null;
    }

    return data ? rowToBoard(data) : null;
  },

  async isVisibleByRoom(roomId: string, roomKey: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("shared_boards")
      .select("id")
      .eq("room_id", roomId)
      .eq("room_key", roomKey)
      .maybeSingle();

    if (error) {
      console.error("SharedBoardsStore.isVisibleByRoom:", error);
      return false;
    }
    return !!data?.id;
  },

  async getAll(): Promise<SharedBoard[]> {
    const { data, error } = await supabase
      .from("shared_boards")
      .select(
        "id, room_id, room_key, name, created_by, created_at, updated_at, shared_board_members (user_id, username, joined_at, read_only)",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("SharedBoardsStore.getAll:", error);
      return [];
    }

    return (data ?? []).map(rowToBoard);
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
      console.error(
        `SharedBoardsStore.joinOrCreate failed (code: ${error.code}): ${error.message}`,
        "\nHint: verify that the join_shared_board RPC exists in your Supabase project.",
        error,
      );
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
      console.error(
        `SharedBoardsStore.joinExisting failed (code: ${error.code}): ${error.message}`,
        "\nHint: verify that the join_existing_shared_board RPC exists in your Supabase project.",
        error,
      );
      return false;
    }

    const joined = await this.isVisibleByRoom(params.roomId, params.roomKey);
    if (joined) {
      return true;
    }

    return false;
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
      console.error("SharedBoardsStore.leaveByRoom:", boardError);
      return;
    }

    if (!board?.id) {
      return;
    }

    if (board.created_by === user.id) {
      const { error } = await supabase
        .from("shared_boards")
        .delete()
        .eq("id", board.id);
      if (error) {
        throwStoreError(error.message);
      }
      return;
    }

    const { error } = await supabase
      .from("shared_board_members")
      .delete()
      .eq("board_id", board.id)
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
