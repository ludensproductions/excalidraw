import { supabase } from "./supabase";

export type CommentTarget =
  | {
      kind: "board";
      id: string;
      name?: string | null;
    }
  | {
      kind: "shared";
      id: string;
      name?: string | null;
    };

export interface BoardComment {
  id: string;
  threadId: string;
  threadType: CommentTarget["kind"];
  userId: string;
  authorName: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToComment = (row: any, threadType: CommentTarget["kind"]): BoardComment => ({
  id: row.id as string,
  threadId:
    threadType === "shared"
      ? (row.shared_board_id as string)
      : (row.board_id as string),
  threadType,
  userId: row.owner_id as string,
  authorName: (row.author_name ?? "Usuario") as string,
  body: row.body as string,
  createdAt: new Date(row.created_at as string).getTime(),
  updatedAt: new Date(row.updated_at as string).getTime(),
});

const getTableForTarget = (target: CommentTarget) => {
  return target.kind === "shared" ? "shared_board_comments" : "board_comments";
};

const getColumnForTarget = (target: CommentTarget) => {
  return target.kind === "shared" ? "shared_board_id" : "board_id";
};

export const CommentsStore = {
  async getAll(target: CommentTarget): Promise<BoardComment[]> {
    const { data, error } = await supabase
      .from(getTableForTarget(target))
      .select("*")
      .eq(getColumnForTarget(target), target.id)
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => rowToComment(row, target.kind));
  },

  async add(params: {
    target: CommentTarget;
    body: string;
    authorName: string;
  }): Promise<BoardComment> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("No autenticado");
    }

    const payload = {
      [getColumnForTarget(params.target)]: params.target.id,
      owner_id: user.id,
      author_name: params.authorName,
      body: params.body,
    };

    const { data, error } = await supabase
      .from(getTableForTarget(params.target))
      .insert(payload)
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToComment(data, params.target.kind);
  },

  async update(
    target: CommentTarget,
    id: string,
    body: string,
  ): Promise<BoardComment> {
    const { data, error } = await supabase
      .from(getTableForTarget(target))
      .update({ body })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToComment(data, target.kind);
  },

  async delete(target: CommentTarget, id: string): Promise<void> {
    const { error } = await supabase
      .from(getTableForTarget(target))
      .delete()
      .eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  },
};
