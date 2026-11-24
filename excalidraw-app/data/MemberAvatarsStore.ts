import { supabase } from "./supabase";

// how long before asking again, so a changed photo shows up without a reload
export const MEMBER_AVATAR_TTL_MS = 60_000;

type AvatarRow = { user_id: string; avatar: string };

const cache = new Map<string, { avatar: string | null; requestedAt: number }>();
const listeners = new Set<() => void>();

/** Profile photos of the people the current user shares boards with. */
export const MemberAvatarsStore = {
  get(userId: string): string | null {
    return cache.get(userId)?.avatar ?? null;
  },

  /** The listener runs whenever a photo changes. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Cheap when the photos are fresh: it's called on every pointer update. */
  async load(userIds: readonly string[]): Promise<void> {
    const now = Date.now();
    const staleIds = [...new Set(userIds)].filter((id) => {
      const entry = cache.get(id);
      return !entry || now - entry.requestedAt >= MEMBER_AVATAR_TTL_MS;
    });
    if (!staleIds.length) {
      return;
    }
    // before the request, so neither concurrent calls nor a failure repeat it
    for (const id of staleIds) {
      cache.set(id, { avatar: this.get(id), requestedAt: now });
    }

    const { data, error } = await supabase.rpc("shared_member_avatars", {
      p_user_ids: staleIds,
    });
    if (error) {
      console.warn("Failed to load member avatars:", error.message);
      return;
    }

    const avatars = new Map(
      ((data ?? []) as AvatarRow[]).map((row) => [row.user_id, row.avatar]),
    );
    let changed = false;
    for (const id of staleIds) {
      const avatar = avatars.get(id) ?? null;
      if (avatar !== this.get(id)) {
        cache.set(id, { avatar, requestedAt: now });
        changed = true;
      }
    }
    if (changed) {
      listeners.forEach((listener) => listener());
    }
  },
};
