import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

import { t } from "@excalidraw/excalidraw/i18n";

import { translateErrorMessage } from "./errorMessages";
import "./appDialog.scss";

type DialogIcon = "success" | "error" | "warning" | "info" | "question";

const baseOptions = () => ({
  background: document.documentElement.classList.contains("dark")
    ? "#1f1f26"
    : "#ffffff",
  color: document.documentElement.classList.contains("dark")
    ? "#f4f4f5"
    : "#1f1f24",
  buttonsStyling: false,
  reverseButtons: true,
  customClass: {
    popup: "app-swal",
    title: "app-swal__title",
    htmlContainer: "app-swal__content",
    actions: "app-swal__actions",
    input: "app-swal__input",
    confirmButton: "app-swal__button app-swal__button--primary",
    cancelButton: "app-swal__button",
    denyButton: "app-swal__button",
    closeButton: "app-swal__close",
    validationMessage: "app-swal__validation",
  },
});

export const appDialog = {
  async toast(options: {
    title: string;
    icon?: Extract<DialogIcon, "success" | "error" | "warning" | "info">;
    timer?: number;
  }): Promise<void> {
    const optionsBase = baseOptions();

    await Swal.fire({
      ...optionsBase,
      title: options.title,
      icon: options.icon ?? "success",
      toast: true,
      position: "top-end",
      showCloseButton: false,
      showConfirmButton: false,
      timer: options.timer ?? 2600,
      timerProgressBar: true,
      customClass: {
        ...optionsBase.customClass,
        popup: `${optionsBase.customClass.popup} app-swal--toast`,
        title: "app-swal__toast-title",
      },
    });
  },

  async alert(options: {
    title: string;
    text?: string;
    icon?: DialogIcon;
    confirmButtonText?: string;
  }): Promise<void> {
    await Swal.fire({
      ...baseOptions(),
      title: options.title,
      text: options.text,
      icon: options.icon ?? "info",
      showCloseButton: true,
      confirmButtonText: options.confirmButtonText ?? t("app.gotIt"),
    });
  },

  async error(title: string, text?: string): Promise<void> {
    await this.alert({
      title,
      text: text ? translateErrorMessage(text) : undefined,
      icon: "error",
    });
  },

  async confirm(options: {
    title: string;
    text?: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    icon?: DialogIcon;
    danger?: boolean;
  }): Promise<boolean> {
    const result = await Swal.fire({
      ...baseOptions(),
      title: options.title,
      text: options.text,
      icon: options.icon ?? "warning",
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? t("app.confirm"),
      cancelButtonText: options.cancelButtonText ?? t("app.cancel"),
      customClass: {
        ...baseOptions().customClass,
        confirmButton: `app-swal__button ${
          options.danger
            ? "app-swal__button--danger"
            : "app-swal__button--primary"
        }`,
      },
    });

    return result.isConfirmed;
  },

  async choose(options: {
    title: string;
    text?: string;
    confirmButtonText: string;
    denyButtonText: string;
    cancelButtonText?: string;
    icon?: DialogIcon;
    danger?: boolean;
    confirmButtonVariant?: "primary" | "danger";
    denyButtonVariant?: "default" | "primary" | "danger";
  }): Promise<"confirm" | "deny" | "cancel"> {
    const confirmButtonVariant =
      options.confirmButtonVariant ?? (options.danger ? "danger" : "primary");
    const denyButtonVariant = options.denyButtonVariant ?? "default";
    const result = await Swal.fire({
      ...baseOptions(),
      title: options.title,
      text: options.text,
      icon: options.icon ?? "question",
      showCloseButton: true,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText,
      denyButtonText: options.denyButtonText,
      cancelButtonText: options.cancelButtonText ?? t("app.cancel"),
      customClass: {
        ...baseOptions().customClass,
        confirmButton: `app-swal__button ${
          confirmButtonVariant === "danger"
            ? "app-swal__button--danger"
            : "app-swal__button--primary"
        }`,
        denyButton: `app-swal__button ${
          denyButtonVariant === "danger"
            ? "app-swal__button--danger"
            : denyButtonVariant === "primary"
            ? "app-swal__button--primary"
            : ""
        }`.trim(),
      },
    });

    if (result.isConfirmed) {
      return "confirm";
    }
    if (result.isDenied) {
      return "deny";
    }
    return "cancel";
  },
  async promptText(options: {
    title: string;
    label?: string;
    placeholder?: string;
    initialValue?: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    requiredMessage?: string;
    maxLength?: number;
  }): Promise<string | null> {
    const result = await Swal.fire({
      ...baseOptions(),
      title: options.title,
      input: "text",
      inputLabel: options.label,
      inputPlaceholder: options.placeholder,
      inputValue: options.initialValue ?? "",
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? t("app.save"),
      cancelButtonText: options.cancelButtonText ?? t("app.cancel"),
      inputAttributes: {
        maxlength: String(options.maxLength ?? 120),
        autocapitalize: "sentences",
      },
      inputValidator: (value) => {
        if (!value.trim()) {
          return options.requiredMessage ?? t("app.fieldRequired");
        }
        return undefined;
      },
    });

    return result.isConfirmed && typeof result.value === "string"
      ? result.value.trim()
      : null;
  },
};
