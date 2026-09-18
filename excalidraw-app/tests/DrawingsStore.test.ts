import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";

type BoardRow = {
  id: string;
  owner_id: string;
  name: string;
  elements: unknown[];
  files?: BinaryFiles;
  app_state: Record<string, unknown>;
  thumbnail: string | null;
  collab_link: string | null;
  created_at: string;
  updated_at: string;
};

const storeMocks = vi.hoisted(() => ({
  rows: new Map<string, BoardRow>(),
  insertPayloads: [] as Array<Record<string, unknown>>,
  updatePayloads: [] as Array<Record<string, unknown>>,
  getUser: vi.fn(),
}));

const nowIso = () => new Date("2026-09-18T12:00:00.000Z").toISOString();

const createBoardBuilder = () => {
  const state: {
    action: "select" | "insert" | "update";
    payload: Record<string, unknown> | null;
    filters: Record<string, string>;
  } = {
    action: "select",
    payload: null,
    filters: {},
  };

  const resolveMaybeSingle = async () => {
    const id = state.filters.id;

    if (state.action === "insert") {
      const payload = state.payload as Record<string, unknown>;
      storeMocks.insertPayloads.push(payload);
      const row = {
        created_at: nowIso(),
        updated_at: nowIso(),
        ...payload,
      } as BoardRow;
      storeMocks.rows.set(row.id, row);
      return { data: row, error: null };
    }

    if (state.action === "update") {
      const payload = state.payload as Record<string, unknown>;
      storeMocks.updatePayloads.push(payload);
      const existing = storeMocks.rows.get(id);
      if (!existing) {
        return { data: null, error: null };
      }
      const row = {
        ...existing,
        ...payload,
        updated_at: nowIso(),
      } as BoardRow;
      storeMocks.rows.set(id, row);
      return { data: row, error: null };
    }

    return {
      data: storeMocks.rows.get(id) ?? null,
      error: null,
    };
  };

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      state.filters[column] = value;
      return builder;
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      state.action = "insert";
      state.payload = payload;
      return builder;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      state.action = "update";
      state.payload = payload;
      return builder;
    }),
    maybeSingle: vi.fn(resolveMaybeSingle),
    single: vi.fn(resolveMaybeSingle),
  };

  return builder;
};

vi.mock("../data/supabase", () => ({
  supabase: {
    auth: {
      getUser: storeMocks.getUser,
    },
    from: vi.fn(() => createBoardBuilder()),
  },
}));

vi.mock("../errorMessages", () => ({
  translateErrorMessage: (message: string) => message,
}));

const createImageElement = (fileId: FileId) =>
  ({
    id: "image-element",
    type: "image",
    fileId,
    status: "saved",
    isDeleted: false,
    version: 1,
    versionNonce: 1,
    updated: 1,
  } as any);

const createFile = (id: FileId): BinaryFileData =>
  ({
    id,
    mimeType: "image/png",
    dataURL: `data:image/png;base64,${id}`,
    created: 1,
  } as BinaryFileData);

describe("DrawingsStore", () => {
  beforeEach(() => {
    storeMocks.rows.clear();
    storeMocks.insertPayloads.length = 0;
    storeMocks.updatePayloads.length = 0;
    storeMocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
  });

  it("persists only files referenced by image elements", async () => {
    const { DrawingsStore } = await import("../data/DrawingsStore");
    const fileId = "file-a" as FileId;
    const orphanFileId = "file-b" as FileId;
    const referencedFile = createFile(fileId);
    const orphanFile = createFile(orphanFileId);

    const record = await DrawingsStore.save({
      name: "Tablero con imagen",
      elements: [createImageElement(fileId)],
      files: {
        [fileId]: referencedFile,
        [orphanFileId]: orphanFile,
      },
      appState: { viewBackgroundColor: "#ffffff" },
      thumbnail: null,
      collabLink: null,
      userId: "user-1",
    });

    expect(storeMocks.insertPayloads[0].files).toEqual({
      [fileId]: referencedFile,
    });
    expect(record.files).toEqual({
      [fileId]: referencedFile,
    });
  });

  it("preserves existing files when a legacy save omits files", async () => {
    const { DrawingsStore } = await import("../data/DrawingsStore");
    const fileId = "file-a" as FileId;
    const existingFile = createFile(fileId);
    storeMocks.rows.set("board-1", {
      id: "board-1",
      owner_id: "user-1",
      name: "Original",
      elements: [createImageElement(fileId)],
      files: { [fileId]: existingFile },
      app_state: { viewBackgroundColor: "#ffffff" },
      thumbnail: null,
      collab_link: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    const record = await DrawingsStore.save(
      {
        name: "Actualizado",
        elements: [createImageElement(fileId)],
        appState: { viewBackgroundColor: "#ffffff" },
        thumbnail: null,
        collabLink: null,
        userId: "user-1",
      },
      "board-1",
    );

    expect(storeMocks.updatePayloads[0]).not.toHaveProperty("files");
    expect(record.files).toEqual({ [fileId]: existingFile });
  });
});
