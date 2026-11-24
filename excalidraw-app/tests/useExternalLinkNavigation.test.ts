import { renderHook } from "@testing-library/react";

import { useExternalLinkNavigation } from "../hooks/useExternalLinkNavigation";

const goToHash = (hash: string) => {
  window.history.replaceState({}, "", `/${hash}`);
  window.dispatchEvent(new Event("hashchange"));
};

describe("useExternalLinkNavigation (RD-551)", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it.each(["#room=abc123,key_-1", "#room=abc123,key_-1,ro", "#json=abc,key"])(
    "opens %s pasted in the address bar",
    (hash) => {
      const onExternalLink = vi.fn();
      renderHook(() => useExternalLinkNavigation(true, onExternalLink));
      goToHash(hash);
      expect(onExternalLink).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["", "#other", "#room=abc123", "#json=", "#room=a,b,rw"])(
    "ignores %j, which isn't a board link",
    (hash) => {
      const onExternalLink = vi.fn();
      renderHook(() => useExternalLinkNavigation(true, onExternalLink));
      goToHash(hash);
      expect(onExternalLink).not.toHaveBeenCalled();
    },
  );

  it("only listens while enabled and mounted", () => {
    const onExternalLink = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useExternalLinkNavigation(enabled, onExternalLink),
      { initialProps: { enabled: false } },
    );
    goToHash("#room=a,b");
    expect(onExternalLink).not.toHaveBeenCalled();

    rerender({ enabled: true });
    goToHash("#room=a,b");
    expect(onExternalLink).toHaveBeenCalledTimes(1);

    unmount();
    goToHash("#room=c,d");
    expect(onExternalLink).toHaveBeenCalledTimes(1);
  });
});
