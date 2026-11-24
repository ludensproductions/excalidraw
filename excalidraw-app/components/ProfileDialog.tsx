import { t } from "@excalidraw/excalidraw/i18n";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, useState } from "react";

import {
  changePassword,
  updateCurrentProfile,
  type AuthUser,
} from "../auth/authStore";
import {
  AUTH_FIELD_LIMITS,
  normalizeUsername,
  sanitizePasswordInput,
  sanitizeUsernameInput,
  validatePassword,
  validateUsername,
} from "../auth/authValidation";
import { AVATAR_TYPES, fileToAvatar } from "../auth/avatar";
import { getErrorMessage } from "../errorMessages";

import "../appDialog.scss";

import "./ProfileDialog.scss";

interface ProfileDialogProps {
  user: AuthUser;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
}

export const ProfileDialog: React.FC<ProfileDialogProps> = ({
  user,
  onClose,
  onSaved,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState(user.avatar);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // so choosing the same file again fires another change event
    event.target.value = "";
    if (!file) {
      return;
    }
    setError(null);
    try {
      setAvatar(await fileToAvatar(file));
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  const togglePassword = () => {
    setIsChangingPassword((changing) => !changing);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const validate = (nextUsername: string): string | null => {
    // a name given by an OAuth provider may not follow these rules; only
    // check it when the user changes it
    const usernameError =
      nextUsername !== user.username && validateUsername(nextUsername);
    if (usernameError) {
      return t(usernameError);
    }
    if (!isChangingPassword) {
      return null;
    }
    if (!currentPassword) {
      return t("profile.errors.currentPasswordRequired");
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return t(passwordError);
    }
    if (newPassword !== confirmPassword) {
      return t("auth.errors.passwordsDoNotMatch");
    }
    if (newPassword === currentPassword) {
      return t("profile.errors.samePassword");
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const nextUsername = normalizeUsername(username);
    const validationError = validate(nextUsername);
    setError(validationError);
    if (validationError) {
      return;
    }
    if (
      !isChangingPassword &&
      nextUsername === user.username &&
      avatar === user.avatar
    ) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      let updatedUser = await updateCurrentProfile({
        username: nextUsername,
        avatar,
      });
      if (isChangingPassword) {
        updatedUser = await changePassword(currentPassword, newPassword);
      }
      onSaved(updatedUser);
    } catch (error) {
      setError(getErrorMessage(error));
      setSaving(false);
    }
  };

  const passwordField = (
    id: string,
    label: string,
    value: string,
    setValue: (value: string) => void,
    isCurrent = false,
  ) => (
    <div className="profile-dialog__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        // the current password may predate today's rules: don't alter it
        onChange={(event) =>
          setValue(
            isCurrent
              ? event.target.value
              : sanitizePasswordInput(event.target.value),
          )
        }
        maxLength={isCurrent ? undefined : AUTH_FIELD_LIMITS.password.max}
        autoComplete={isCurrent ? "current-password" : "new-password"}
        disabled={saving}
      />
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className="app-swal profile-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => {
        if (saving) {
          event.preventDefault();
        }
      }}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <h2 id="profile-dialog-title" className="app-swal__title">
          {t("profile.title")}
        </h2>

        <div className="profile-dialog__photo">
          <span className="profile-dialog__avatar">
            {avatar ? (
              <img src={avatar} alt={t("profile.photo")} />
            ) : (
              <FontAwesomeIcon icon={faUser} />
            )}
          </span>
          <div className="profile-dialog__photo-actions">
            <button
              type="button"
              className="profile-dialog__link"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              {t("profile.changePhoto")}
            </button>
            {avatar && (
              <button
                type="button"
                className="profile-dialog__link profile-dialog__link--danger"
                onClick={() => setAvatar(null)}
                disabled={saving}
              >
                {t("profile.removePhoto")}
              </button>
            )}
            <p className="profile-dialog__hint">{t("profile.photoHint")}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            aria-label={t("profile.changePhoto")}
            onChange={handlePhoto}
            hidden
          />
        </div>

        <div className="profile-dialog__field">
          <label htmlFor="profile-username">{t("auth.fields.username")}</label>
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={(event) =>
              setUsername(sanitizeUsernameInput(event.target.value))
            }
            maxLength={AUTH_FIELD_LIMITS.username.max}
            autoComplete="off"
            disabled={saving}
          />
        </div>

        <div className="profile-dialog__field">
          <label htmlFor="profile-email">{t("auth.fields.email")}</label>
          <input
            id="profile-email"
            type="email"
            value={user.email}
            // lets the password manager tie the new password to this account
            autoComplete="username"
            readOnly
          />
        </div>

        {user.hasPassword ? (
          <button
            type="button"
            className="profile-dialog__link"
            onClick={togglePassword}
            aria-expanded={isChangingPassword}
            disabled={saving}
          >
            {isChangingPassword
              ? t("profile.keepPassword")
              : t("profile.changePassword")}
          </button>
        ) : (
          <p className="profile-dialog__hint">
            {t("profile.passwordManagedExternally")}
          </p>
        )}

        {isChangingPassword && (
          <>
            {passwordField(
              "profile-current-password",
              t("profile.currentPassword"),
              currentPassword,
              setCurrentPassword,
              true,
            )}
            {passwordField(
              "profile-new-password",
              t("auth.fields.newPassword"),
              newPassword,
              setNewPassword,
            )}
            <p className="profile-dialog__hint">
              {t("auth.placeholders.newPassword")}
            </p>
            {passwordField(
              "profile-confirm-password",
              t("auth.fields.confirmPassword"),
              confirmPassword,
              setConfirmPassword,
            )}
            <p className="profile-dialog__hint">
              {t("profile.passwordSessionsHint")}
            </p>
          </>
        )}

        {error && (
          <p className="profile-dialog__error" role="alert">
            {error}
          </p>
        )}

        <div className="app-swal__actions profile-dialog__actions">
          <button
            type="button"
            className="app-swal__button"
            onClick={onClose}
            disabled={saving}
          >
            {t("app.cancel")}
          </button>
          <button
            type="submit"
            className="app-swal__button app-swal__button--primary"
            disabled={saving}
          >
            {saving ? t("app.saving") : t("app.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
};
