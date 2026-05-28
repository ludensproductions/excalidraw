import { supabase } from "./supabase";

export interface SharedBoardMember {
  userId: string;
  username: string;
  joinedAt: number;
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
    })),
  };
}

export const SharedBoardsStore = {
  async getAll(): Promise<SharedBoard[]> {
    const { data, error } = await supabase
      .from("shared_boards")
      .select(
        "id, room_id, room_key, name, created_by, created_at, updated_at, shared_board_members (user_id, username, joined_at)",
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
  }): Promise<void> {
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
    }
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("shared_boards")
      .update({ name })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async leave(boardId: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    const { error } = await supabase
      .from("shared_board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  },
};
