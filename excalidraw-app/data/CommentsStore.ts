import { supabase } from "./supabase";

export interface BoardComment {
  id: string;
  boardId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToComment = (row: any): BoardComment => ({
  id: row.id as string,
  boardId: row.board_id as string,
  userId: row.owner_id as string,
  authorName: (row.author_name ?? "Usuario") as string,
  body: row.body as string,
  createdAt: new Date(row.created_at as string).getTime(),
  updatedAt: new Date(row.updated_at as string).getTime(),
});

export const CommentsStore = {
  async getAll(boardId: string): Promise<BoardComment[]> {
    const { data, error } = await supabase
      .from("board_comments")
      .select("*")
      .eq("board_id", boardId)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).map(rowToComment);
  },

  async add(params: {
    boardId: string;
    body: string;
    authorName: string;
  }): Promise<BoardComment> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("No autenticado");
    }

    const { data, error } = await supabase
      .from("board_comments")
      .insert({
        board_id: params.boardId,
        owner_id: user.id,
        author_name: params.authorName,
        body: params.body,
      })
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToComment(data);
  },

  async update(id: string, body: string): Promise<BoardComment> {
    const { data, error } = await supabase
      .from("board_comments")
      .update({ body })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToComment(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from("board_comments")
      .delete()
      .eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  },
};
