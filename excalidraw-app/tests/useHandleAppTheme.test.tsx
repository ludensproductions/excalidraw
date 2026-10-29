import { act, renderHook } from "@testing-library/react";

import { THEME } from "@excalidraw/excalidraw";

import { STORAGE_KEYS } from "../app_constants";
import { useHandleAppTheme } from "../useHandleAppTheme";

// SweetAlert dialogs (confirm, spinners, toasts) take their colors from
// html.dark, so it has to follow every theme switch without a reload
describe("useHandleAppTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("applies a stored dark theme on the first render", () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_THEME, THEME.DARK);
    const { result } = renderHook(() => useHandleAppTheme());

    expect(result.current.editorTheme).toBe(THEME.DARK);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggles html.dark live when the theme changes", () => {
    const { result } = renderHook(() => useHandleAppTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.setAppTheme(THEME.DARK));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => result.current.setAppTheme(THEME.LIGHT));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
