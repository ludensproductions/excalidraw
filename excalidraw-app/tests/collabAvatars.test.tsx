import { act, render, waitFor } from "@excalidraw/excalidraw/tests/test-utils";

import type { SocketId } from "@excalidraw/excalidraw/types";

import ExcalidrawApp from "../App";

const PHOTO = "data:image/jpeg;base64,AAAA";
const OWN_PHOTO = "data:image/jpeg;base64,BBBB";

const mocks = vi.hoisted(() => ({
  user: { id: "me", username: "Sara", avatar: null as string | null } as {
    id: string;
    username: string;
    avatar: string | null;
  } | null,
  avatars: new Map<string, string>(),
  listeners: new Set<() => void>(),
  load: vi.fn(async (_userIds: string[]) => {}),
}));

vi.mock("../auth/authStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authStore")>()),
  getCurrentUser: () => mocks.user,
}));

vi.mock("../data/MemberAvatarsStore", () => ({
  MemberAvatarsStore: {
    get: (userId: string) => mocks.avatars.get(userId) ?? null,
    load: mocks.load,
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  },
}));

const MY_SOCKET = "socket-me" as SocketId;
const OTHER_SOCKET = "socket-other" as SocketId;

const avatarUrlOf = (socketId: SocketId) =>
  window.h.state.collaborators.get(socketId)?.avatarUrl;

describe("collaborators' profile photos", () => {
  beforeEach(async () => {
    mocks.user = { id: "me", username: "Sara", avatar: OWN_PHOTO };
    mocks.avatars.clear();
    mocks.load.mockClear();
    await render(<ExcalidrawApp />);
    await waitFor(() => expect(window.collab).toBeDefined());
    window.collab.portal.socket = {
      id: MY_SOCKET,
      close: () => {},
    } as any;
    act(() => window.collab.setCollaborators([MY_SOCKET, OTHER_SOCKET]));
  });

  afterEach(() => {
    window.collab.portal.socket = null;
  });

  const otherMoves = () =>
    act(() =>
      window.collab.updateCollaborator(OTHER_SOCKET, {
        id: "other",
        username: "Yahir",
      }),
    );

  it("shows the own photo", () => {
    expect(avatarUrlOf(MY_SOCKET)).toBe(OWN_PHOTO);
  });

  it("shows the others' when it arrives, and keeps it as people join", () => {
    otherMoves();
    expect(mocks.load).toHaveBeenCalledWith(["other"]);
    expect(avatarUrlOf(OTHER_SOCKET)).toBeUndefined();

    mocks.avatars.set("other", PHOTO);
    act(() => mocks.listeners.forEach((listener) => listener()));
    expect(avatarUrlOf(OTHER_SOCKET)).toBe(PHOTO);
    expect(avatarUrlOf(MY_SOCKET)).toBe(OWN_PHOTO);

    act(() =>
      window.collab.setCollaborators([
        MY_SOCKET,
        OTHER_SOCKET,
        "socket-new" as SocketId,
      ]),
    );
    expect(avatarUrlOf(OTHER_SOCKET)).toBe(PHOTO);

    mocks.avatars.delete("other");
    otherMoves();
    expect(avatarUrlOf(OTHER_SOCKET)).toBeUndefined();
  });

  it("doesn't look up photos without an account, or of guests", () => {
    act(() =>
      window.collab.updateCollaborator(OTHER_SOCKET, { username: "Invitado" }),
    );
    mocks.user = null;
    otherMoves();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
