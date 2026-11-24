import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AVATAR_MAX_BYTES, fileToAvatar } from "../auth/avatar";
import { ProfileDialog } from "../components/ProfileDialog";

import type { AuthUser } from "../auth/authStore";

const mocks = vi.hoisted(() => ({
  updateCurrentProfile: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("../auth/authStore", () => mocks);

const user: AuthUser = {
  id: "user-1",
  username: "Sara",
  email: "sara@example.com",
  createdAt: 1,
  updatedAt: 1,
  role: "user",
  status: "active",
  avatar: "data:image/jpeg;base64,AAAA",
  hasPassword: true,
};

const setup = (overrides: Partial<AuthUser> = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ProfileDialog
      user={{ ...user, ...overrides }}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { onClose, onSaved };
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

const fillPasswords = (current: string, next: string, confirm = next) => {
  click("Change password");
  type("Current password", current);
  type("New password", next);
  type("Confirm password", confirm);
};

describe("ProfileDialog", () => {
  beforeAll(() => {
    // jsdom doesn't implement modal dialogs
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  });

  beforeEach(() => {
    mocks.updateCurrentProfile.mockReset().mockResolvedValue(user);
    mocks.changePassword.mockReset().mockResolvedValue(user);
  });

  it("saves name and removed photo without touching the password", async () => {
    const { onSaved } = setup();
    type("Username", " Sarita ");
    click("Remove photo");
    click("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(user));
    expect(mocks.updateCurrentProfile).toHaveBeenCalledWith({
      username: "Sarita",
      avatar: null,
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("just closes when nothing changed", () => {
    const { onClose } = setup();
    click("Save");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.updateCurrentProfile).not.toHaveBeenCalled();
  });

  it("doesn't block other changes on an external name that breaks the rules", async () => {
    const { onSaved } = setup({ username: "Sara 🎨" });
    click("Remove photo");
    click("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("changes the password", async () => {
    const { onSaved } = setup();
    fillPasswords("Actual1!", "Nueva123!");
    click("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.changePassword).toHaveBeenCalledWith("Actual1!", "Nueva123!");
  });

  it.each([
    ["", "Nueva123!", "Nueva123!", "Enter your current password."],
    ["Actual1!", "corta", "corta", "at least 8 characters"],
    ["Actual1!", "Nueva123!", "Otra1234!", "do not match"],
    ["Actual1!", "Actual1!", "Actual1!", "must be different"],
  ])(
    "rejects passwords %j / %j / %j before saving anything",
    (current, next, confirm, message) => {
      const { onSaved } = setup();
      type("Username", "Sarita");
      fillPasswords(current, next, confirm);
      click("Save");
      expect(screen.getByRole("alert").textContent).toContain(message);
      expect(mocks.updateCurrentProfile).not.toHaveBeenCalled();
      expect(mocks.changePassword).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );

  it("stays open with the error when saving fails, and can retry", async () => {
    mocks.changePassword.mockRejectedValueOnce(
      new Error("The current password is incorrect."),
    );
    const { onSaved, onClose } = setup();
    fillPasswords("Mala1234!", "Nueva123!");
    click("Save");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The current password is incorrect.",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    type("Current password", "Actual1!");
    click("Save");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows the email read-only and hides the password for external accounts", () => {
    setup({ hasPassword: false });
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Change password" }),
    ).toBeNull();
  });

  it("rejects files that aren't a supported photo", async () => {
    await expect(
      fileToAvatar(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow("Choose a valid");

    const big = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: AVATAR_MAX_BYTES + 1 });
    await expect(fileToAvatar(big)).rejects.toThrow("10 MB or smaller");

    // right extension, not an image
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error()));
    await expect(
      fileToAvatar(new File(["x"], "a.png", { type: "image/png" })),
    ).rejects.toThrow("Choose a valid");
    vi.unstubAllGlobals();
  });
});
