import { translateErrorMessage } from "../errorMessages";

import { supabase } from "./supabase";

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled" | "banned";

export interface ManagedUserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

type ProfileRow = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

const USER_COLUMNS =
  "id, username, email, role, status, created_at, updated_at";

const mapRow = (row: ProfileRow): ManagedUserProfile => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

const throwStoreError = (message: string): never => {
  throw new Error(translateErrorMessage(message));
};

export const UserManagementStore = {
  async getAll(): Promise<ManagedUserProfile[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select(USER_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      throwStoreError(error.message);
    }

    return ((data ?? []) as ProfileRow[]).map(mapRow);
  },

  async updateProfile(
    id: string,
    patch: Partial<Pick<ManagedUserProfile, "username" | "role" | "status">>,
  ): Promise<ManagedUserProfile> {
    const payload: Partial<{
      username: string;
      role: UserRole;
      status: UserStatus;
    }> = {};

    if (typeof patch.username === "string") {
      payload.username = patch.username.trim();
    }
    if (patch.role) {
      payload.role = patch.role;
    }
    if (patch.status) {
      payload.status = patch.status;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", id)
      .select(USER_COLUMNS)
      .single();

    if (error) {
      throwStoreError(error.message);
    }

    return mapRow(data as ProfileRow);
  },
};
