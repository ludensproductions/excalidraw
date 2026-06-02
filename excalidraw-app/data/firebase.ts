import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";

import { getSyncableElements } from ".";
import { supabase } from "./supabase";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

// private
// -----------------------------------------------------------------------------

const STORAGE_BUCKET = "excalidraw-files";

// Supabase stores collab_rooms.iv / ciphertext and share_links.payload as
// TEXT columns containing base64-encoded bytes (see migration 0004).
const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToUint8 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);
  return { ciphertext: encryptedBuffer, iv };
};

const decryptElements = async (
  data: { iv: string; ciphertext: string },
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const iv = base64ToUint8(data.iv) as Uint8Array<ArrayBuffer>;
  const ciphertext = base64ToUint8(data.ciphertext) as Uint8Array<ArrayBuffer>;
  const decrypted = await decryptData(iv, ciphertext, roomKey);
  return JSON.parse(
    new TextDecoder("utf-8").decode(new Uint8Array(decrypted)),
  );
};

class SceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => SceneVersionCache.cache.get(socket);
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    SceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

// -----------------------------------------------------------------------------

/** Returns the Supabase storage bucket name (replaces Firebase Storage ref). */
export const loadFirebaseStorage = async (): Promise<string> => {
  return STORAGE_BUCKET;
};

export const isSavedToFirebase = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    return SceneVersionCache.get(portal.socket) === getSceneVersion(elements);
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToFirebase = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const path = prefix.replace(/^\//, "") + "/" + id;
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, buffer, {
            upsert: true,
            cacheControl: String(FILE_CACHE_MAX_AGE_SEC),
          });
        if (error) {
          throw error;
        }
        savedFiles.push(id);
      } catch (error: any) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const saveToFirebase = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToFirebase(portal, elements)
  ) {
    return null;
  }

  // Read the current scene for client-side reconciliation
  const { data: existing } = await supabase
    .from("collab_rooms")
    .select("scene_version, iv, ciphertext")
    .eq("room_id", roomId)
    .maybeSingle();

  let finalElements: readonly SyncableExcalidrawElement[];

  if (existing) {
    const prevElements = getSyncableElements(
      restoreElements(
        await decryptElements(
          {
            iv: existing.iv as string,
            ciphertext: existing.ciphertext as string,
          },
          roomKey,
        ),
        null,
      ),
    );
    finalElements = getSyncableElements(
      reconcileElements(
        elements,
        prevElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
        appState,
      ),
    );
  } else {
    finalElements = elements;
  }

  const sceneVersion = getSceneVersion(finalElements);
  const { ciphertext, iv } = await encryptElements(roomKey, finalElements);

  const { error } = await supabase.from("collab_rooms").upsert(
    {
      room_id: roomId,
      scene_version: sceneVersion,
      iv: uint8ToBase64(iv),
      ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" },
  );

  if (error) {
    console.error("saveToFirebase (Supabase) error:", error);
    return null;
  }

  SceneVersionCache.set(socket, finalElements);
  return toBrandedType<RemoteExcalidrawElement[]>([...finalElements]);
};

export const loadFromFirebase = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const { data, error } = await supabase
    .from("collab_rooms")
    .select("scene_version, iv, ciphertext")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const elements = getSyncableElements(
    restoreElements(
      await decryptElements(
        { iv: data.iv as string, ciphertext: data.ciphertext as string },
        roomKey,
      ),
      null,
      { deleteInvisibleElements: true },
    ),
  );

  if (socket) {
    SceneVersionCache.set(socket, elements);
  }

  return elements;
};

export const loadFilesFromFirebase = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const path = prefix.replace(/^\//, "") + "/" + id;
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(path);

        if (error || !data) {
          throw error ?? new Error("No data");
        }

        const arrayBuffer = await data.arrayBuffer();

        const { data: fileData, metadata } =
          await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            { decryptionKey },
          );

        const dataURL = new TextDecoder().decode(fileData) as DataURL;

        loadedFiles.push({
          mimeType: metadata.mimeType || MIME_TYPES.binary,
          id,
          dataURL,
          created: metadata?.created || Date.now(),
          lastRetrieved: metadata?.created || Date.now(),
        });
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};

// -----------------------------------------------------------------------------
// Shareable read-only links (replaces Firebase Storage share links)
// Stored in Supabase table: share_links (id TEXT, payload TEXT/base64)
// -----------------------------------------------------------------------------

const generateShareLinkId = (): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
};

export const saveShareLinkToFirebase = async (
  payload: Uint8Array,
): Promise<
  | { id: string }
  | { error: "TOO_BIG" }
  | { error: "FAILED"; message?: string }
> => {
  if (payload.byteLength > 25_000_000) {
    return { error: "TOO_BIG" };
  }
  try {
    const id = generateShareLinkId();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("share_links").insert({
      id,
      payload: uint8ToBase64(
        new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength),
      ),
      created_by: userData.user?.id ?? null,
    });
    if (error) {
      throw error;
    }
    return { id };
  } catch (error: any) {
    console.error("saveShareLinkToFirebase failed", error);
    return { error: "FAILED", message: error?.message ?? String(error) };
  }
};

export const loadShareLinkFromFirebase = async (
  id: string,
): Promise<ArrayBuffer | null> => {
  try {
    const { data, error } = await supabase
      .from("share_links")
      .select("payload")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const bytes = base64ToUint8(data.payload as string);
    const buf = bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer
      : (bytes.buffer as unknown as ArrayBuffer);
    return buf.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  } catch (error: any) {
    console.error("loadShareLinkFromFirebase failed", error);
    return null;
  }
};