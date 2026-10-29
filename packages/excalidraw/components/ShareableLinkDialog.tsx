import { useRef } from "react";

import { copyTextToSystemClipboard } from "../clipboard";
import { useI18n } from "../i18n";

import { Dialog } from "./Dialog";
import { TextField } from "./TextField";

import "./ShareableLinkDialog.scss";

export type ShareableLinkDialogProps = {
  link: string;

  onCloseRequest: () => void;
  setErrorMessage: (error: string) => void;
};

export const ShareableLinkDialog = ({
  link,
  onCloseRequest,
  setErrorMessage,
}: ShareableLinkDialogProps) => {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);

  const copyRoomLink = async () => {
    try {
      await copyTextToSystemClipboard(link);
    } catch (e) {
      setErrorMessage(t("errors.copyToSystemClipboardFailed"));
    }
    ref.current?.select();
  };
  return (
    <Dialog
      onCloseRequest={onCloseRequest}
      title={false}
      size="small"
      className="ShareableLinkDialog-modal"
    >
      <div className="ShareableLinkDialog">
        <h3>{t("exportDialog.share_link_title")}</h3>
        <TextField
          ref={ref}
          label={t("exportDialog.link_field_label")}
          readonly
          fullWidth
          value={link}
          selectOnRender
          onCopy={copyRoomLink}
        />
        <div className="ShareableLinkDialog__description">
          <strong>🔒 {t("alerts.uploadedSecurly")}</strong>
        </div>
      </div>
    </Dialog>
  );
};
