import type { ExcalidrawElement } from "@excalidraw/element/types";

import { supabase } from "./supabase";

const INSERT_DEDUP_WINDOW_MS = 10_000;
const pendingInsertByKey = new Map<string, Promise<DrawingRecord>>();
const recentInsertByKey = new Map<string, { id: string; ts: number }>();

export interface DrawingRecord {
  id: string;
  name: string;
  userId?: string;
  elements: readonly ExcalidrawElement[];
  appState: {
    viewBackgroundColor?: string;
  };
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
  collabLink: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): DrawingRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    userId: row.owner_id as string,
    elements: (row.elements ?? []) as readonly ExcalidrawElement[],
    appState: (row.app_state ?? {}) as { viewBackgroundColor?: string },
    thumbnail: (row.thumbnail ?? null) as string | null,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    collabLink: (row.collab_link ?? null) as string | null,
  };
}

const toInsertDedupKey = (
  userId: string,
  data: Omit<DrawingRecord, "id" | "createdAt" | "updatedAt">,
): string => {
  const elementsFingerprint = data.elements
    .map(
      (el) =>
        `${el.id}:${el.version}:${el.versionNonce}:${el.updated}:${
          el.isDeleted ? 1 : 0
        }`,
    )
    .join("|");
  return [
    userId,
    data.name,
    data.appState.viewBackgroundColor ?? "",
    data.collabLink ?? "",
    elementsFingerprint,
  ].join("::");
};

export const DrawingsStore = {
  async getAll(): Promise<DrawingRecord[]> {
    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).map(rowToRecord);
  },

  async getAllForUser(_userId: string): Promise<DrawingRecord[]> {
    // RLS guarantees only the authenticated user's rows are returned.
    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).map(rowToRecord);
  },

  async get(id: string): Promise<DrawingRecord | undefined> {
    const { data, error } = await supabase
      .from("boards")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data ? rowToRecord(data) : undefined;
  },

  async save(
    data: Omit<DrawingRecord, "id" | "createdAt" | "updatedAt">,
    existingId?: string,
  ): Promise<DrawingRecord> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("No autenticado");
    }

    const payload = {
      name: data.name,
      elements: data.elements,
      app_state: data.appState,
      thumbnail: data.thumbnail,
    };

    const upsertById = async (id: string): Promise<DrawingRecord> => {
      const existing = await this.get(id);
      const collabLink = data.collabLink ?? existing?.collabLink ?? null;

      const { data: updatedRow, error: updateError } = await supabase
        .from("boards")
        .update({
          ...payload,
          collab_link: collabLink,
        })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (updatedRow) {
        return rowToRecord(updatedRow);
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from("boards")
        .insert({
          id,
          owner_id: user.id,
          ...payload,
          collab_link: collabLink,
          files: {},
        })
        .select()
        .maybeSingle();

      if (insertError) {
        // Another concurrent writer may have inserted the same id.
        if (insertError.code === "23505") {
          const { data: retryRow, error: retryError } = await supabase
            .from("boards")
            .update({
              ...payload,
              collab_link: collabLink,
            })
            .eq("id", id)
            .select()
            .single();
          if (retryError) {
            throw new Error(retryError.message);
          }
          return rowToRecord(retryRow);
        }
        throw new Error(insertError.message);
      }
      if (!insertedRow) {
        throw new Error("No se pudo guardar el tablero");
      }
      return rowToRecord(insertedRow);
    };

    if (existingId) {
      return upsertById(existingId);
    }

    const dedupKey = toInsertDedupKey(user.id, data);
    const now = Date.now();

    const pendingInsert = pendingInsertByKey.get(dedupKey);
    if (pendingInsert) {
      const created = await pendingInsert;
      return upsertById(created.id);
    }

    const recentInsert = recentInsertByKey.get(dedupKey);
    if (recentInsert && now - recentInsert.ts < INSERT_DEDUP_WINDOW_MS) {
      return upsertById(recentInsert.id);
    }

    const insertPromise = upsertById(crypto.randomUUID());

    pendingInsertByKey.set(dedupKey, insertPromise);
    try {
      const record = await insertPromise;
      recentInsertByKey.set(dedupKey, { id: record.id, ts: Date.now() });
      return record;
    } finally {
      pendingInsertByKey.delete(dedupKey);
    }
  },

  async setCollabLink(id: string, link: string | null): Promise<void> {
    const { error } = await supabase
      .from("boards")
      .update({ collab_link: link })
      .eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async normalizeAfterStoppingRoom(
    roomId: string,
    preferredBoardId?: string | null,
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from("boards")
      .select("id, updated_at")
      .like("collab_link", `%#room=${roomId},%`)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<{ id: string; updated_at: string }>;
    if (rows.length === 0) {
      return null;
    }

    const keepId =
      preferredBoardId && rows.some((row) => row.id === preferredBoardId)
        ? preferredBoardId
        : rows[0].id;

    const duplicateIds = rows
      .map((row) => row.id)
      .filter((id) => id !== keepId);

    if (duplicateIds.length) {
      const { error: deleteError } = await supabase
        .from("boards")
        .delete()
        .in("id", duplicateIds);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    const { error: clearError } = await supabase
      .from("boards")
      .update({ collab_link: null })
      .eq("id", keepId);
    if (clearError) {
      throw new Error(clearError.message);
    }

    return keepId;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("boards")
      .update({ name })
      .eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async isNameTaken(name: string, excludeId?: string): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    const trimmed = name.trim();
    const { data, error } = await supabase
      .from("boards")
      .select("id")
      .ilike("name", trimmed)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return false;
    }

    if (excludeId && data[0].id === excludeId) {
      return false;
    }

    return true;
  },
};
