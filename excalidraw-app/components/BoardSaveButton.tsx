import React from "react";
import { useI18n } from "@excalidraw/excalidraw";

import { useSaveBoard } from "../hooks/useSaveBoard";

import "./BoardSaveButton.scss";

const SaveIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export const BoardSaveButton: React.FC = () => {
  const { save, status, activeBoard } = useSaveBoard();
  const { t } = useI18n();

  const label =
    status === "saving"
      ? t("app.saving")
      : status === "saved"
        ? t("app.saved")
        : activeBoard.name ?? t("app.saveBoard");

  return (
    <button
      className={`board-save-btn${
        status === "saved" ? " board-save-btn--saved" : ""
      }`}
      onClick={save}
      disabled={status === "saving"}
      title={
        activeBoard.name
          ? t("app.saveBoard") + ` "${activeBoard.name}"`
          : t("app.saveBoard")
      }
    >
      {status !== "saved" && <SaveIcon />}
      <span className="board-save-btn__label">{label}</span>
    </button>
  );
};
