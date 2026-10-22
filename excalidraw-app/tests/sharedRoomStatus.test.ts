// vi.mock calls below are hoisted above this import by vitest
import {
  SharedBoardsStore,
  SharedRoomStatusUnknownError,
} from "../data/SharedBoardsStore";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("../data/supabase", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: mocks.maybeSingle,
  };
  return {
    supabase: {
      rpc: mocks.rpc,
      auth: { refreshSession: mocks.refreshSession },
      from: vi.fn(() => builder),
    },
  };
});

vi.mock("../errorMessages", () => ({
  translateErrorMessage: (message: string) => message,
}));

describe("SharedBoardsStore.getRoomStatus (RD-528)", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.refreshSession.mockReset().mockResolvedValue({ error: null });
    mocks.maybeSingle.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each(["active", "no_access", "closed"] as const)(
    "returns %s from the RPC",
    async (status) => {
      mocks.rpc.mockResolvedValue({ data: status, error: null });
      await expect(SharedBoardsStore.getRoomStatus("r", "k")).resolves.toBe(
        status,
      );
      expect(mocks.refreshSession).not.toHaveBeenCalled();
    },
  );

  it("refreshes the session and retries once after a transient error", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST301", message: "JWT expired" },
      })
      .mockResolvedValueOnce({ data: "active", error: null });

    await expect(SharedBoardsStore.getRoomStatus("r", "k")).resolves.toBe(
      "active",
    );
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("never reports a persistent error as a closed room", async () => {
    mocks.rpc.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      SharedBoardsStore.getRoomStatus("r", "k"),
    ).rejects.toBeInstanceOf(SharedRoomStatusUnknownError);
    await expect(
      SharedBoardsStore.isVisibleByRoom("r", "k"),
    ).rejects.toBeInstanceOf(SharedRoomStatusUnknownError);
  });

  it("falls back to the shared_boards select when the RPC is missing", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { id: "b1" },
      error: null,
    });
    await expect(SharedBoardsStore.getRoomStatus("r", "k")).resolves.toBe(
      "active",
    );

    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(SharedBoardsStore.getRoomStatus("r", "k")).resolves.toBe(
      "closed",
    );
  });
});
