import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

import "./appDialog.scss";

import { t } from "@excalidraw/excalidraw/i18n";

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
    input: "app-swal__input",
    confirmButton: "app-swal__button app-swal__button--primary",
    cancelButton: "app-swal__button",
    validationMessage: "app-swal__validation",
  },
});

export const appDialog = {
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
      confirmButtonText: options.confirmButtonText ?? t("app.gotIt"),
    });
  },

  async error(title: string, text?: string): Promise<void> {
    await this.alert({ title, text, icon: "error" });
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
