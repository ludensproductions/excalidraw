import type { ExcalidrawElement } from "@excalidraw/element/types";

import { supabase } from "./supabase";

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

    if (existingId) {
      const existing = await this.get(existingId);
      const collabLink = data.collabLink ?? existing?.collabLink ?? null;

      const { data: row, error } = await supabase
        .from("boards")
        .update({
          name: data.name,
          elements: data.elements,
          app_state: data.appState,
          thumbnail: data.thumbnail,
          collab_link: collabLink,
        })
        .eq("id", existingId)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return rowToRecord(row);
    }

    const { data: row, error } = await supabase
      .from("boards")
      .insert({
        owner_id: user.id,
        name: data.name,
        elements: data.elements,
        app_state: data.appState,
        thumbnail: data.thumbnail,
        collab_link: data.collabLink ?? null,
        files: {},
      })
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return rowToRecord(row);
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
};
