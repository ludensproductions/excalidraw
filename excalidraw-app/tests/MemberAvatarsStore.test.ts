import type { MemberAvatarsStore as Store } from "../data/MemberAvatarsStore";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../data/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const PHOTO = "data:image/jpeg;base64,AAAA";
const requestedIds = () =>
  mocks.rpc.mock.calls.map(([, params]) => params.p_user_ids);

describe("MemberAvatarsStore", () => {
  let store: typeof Store;
  let ttl: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mocks.rpc.mockReset();
    const module = await import("../data/MemberAvatarsStore");
    store = module.MemberAvatarsStore;
    ttl = module.MEMBER_AVATAR_TTL_MS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks once per person and tells the listeners", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ user_id: "a", avatar: PHOTO }],
      error: null,
    });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await Promise.all([store.load(["a", "b", "a"]), store.load(["a", "b"])]);
    await store.load(["a", "b"]);

    expect(requestedIds()).toEqual([["a", "b"]]);
    expect(store.get("a")).toBe(PHOTO);
    expect(store.get("b")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("picks up changed and removed photos after the TTL", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        { user_id: "a", avatar: PHOTO },
        { user_id: "b", avatar: PHOTO },
      ],
      error: null,
    });
    await store.load(["a", "b"]);

    vi.advanceTimersByTime(ttl);
    mocks.rpc.mockResolvedValueOnce({
      data: [{ user_id: "a", avatar: `${PHOTO}BBBB` }],
      error: null,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load(["a", "b"]);

    expect(store.get("a")).toBe(`${PHOTO}BBBB`);
    expect(store.get("b")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the known photo and doesn't hammer the server on errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({
      data: [{ user_id: "a", avatar: PHOTO }],
      error: null,
    });
    await store.load(["a"]);

    vi.advanceTimersByTime(ttl);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    await store.load(["a"]);
    await store.load(["a"]);

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(store.get("a")).toBe(PHOTO);
    warn.mockRestore();
  });

  it("doesn't call the server without people to look up", async () => {
    await store.load([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
