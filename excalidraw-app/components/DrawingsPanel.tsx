import { exportToBlob, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { CaptureUpdateAction } from "@excalidraw/element";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAtomValue } from "../app-jotai";
import { getCurrentUser } from "../auth/authStore";
import {
  activeRoomLinkAtom,
  isCollaboratingAtom,
} from "../collab/Collab";
import { DrawingsStore } from "../data/DrawingsStore";

import type { DrawingRecord } from "../data/DrawingsStore";

import "./DrawingsPanel.scss";

export const DRAWINGS_PANEL_TAB = "drawings";

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const DrawingsPanel: React.FC = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const isCollaborating = useAtomValue(isCollaboratingAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const userId = getCurrentUser()?.id;
    const all = userId
      ? await DrawingsStore.getAllForUser(userId)
      : await DrawingsStore.getAll();
    setDrawings(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (saveDialogOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [saveDialogOpen]);

  const generateThumbnail = async (): Promise<string | null> => {
    if (!excalidrawAPI) {
      return null;
    }
    const elements = excalidrawAPI.getSceneElements();
    if (!elements.length) {
      return null;
    }
    try {
      const blob = await exportToBlob({
        elements,
        appState: { ...excalidrawAPI.getAppState(), exportBackground: true },
        files: excalidrawAPI.getFiles(),
        maxWidthOrHeight: 200,
      });
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const buildRecordData = async (
    name: string,
    existingCollabLink: string | null = null,
  ): Promise<Omit<DrawingRecord, "id" | "createdAt" | "updatedAt">> => {
    const elements = excalidrawAPI?.getSceneElements() ?? [];
    const appState = excalidrawAPI?.getAppState();
    const thumbnail = await generateThumbnail();

    return {
      name,
      elements,
      appState: {
        viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
      },
      thumbnail,
      collabLink:
        isCollaborating && activeRoomLink
          ? activeRoomLink
          : existingCollabLink,
      userId: getCurrentUser()?.id,
    };
  };

  const handleSave = async () => {
    if (!excalidrawAPI || !saveName.trim()) {
      return;
    }
    setSavingId("__new__");
    try {
      const data = await buildRecordData(saveName.trim());
      await DrawingsStore.save(data);
      await refresh();
      setSaveDialogOpen(false);
      setSaveName("");
    } finally {
      setSavingId(null);
    }
  };

  const handleOverwrite = async (drawing: DrawingRecord) => {
    if (!excalidrawAPI) {
      return;
    }
    setSavingId(drawing.id);
    try {
      const data = await buildRecordData(drawing.name, drawing.collabLink);
      await DrawingsStore.save(data, drawing.id);
      await refresh();
    } finally {
      setSavingId(null);
    }
  };

  const handleOpen = (drawing: DrawingRecord) => {
    if (!excalidrawAPI) {
      return;
    }
    const restored = restoreElements(drawing.elements as any, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    });
    excalidrawAPI.updateScene({
      elements: restored,
      appState: {
        viewBackgroundColor:
          drawing.appState.viewBackgroundColor ?? "#ffffff",
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    excalidrawAPI.scrollToContent(restored, { animate: false });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este dibujo?")) {
      return;
    }
    await DrawingsStore.delete(id);
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  };

  const startRename = (drawing: DrawingRecord) => {
    setEditingId(drawing.id);
    setEditingName(drawing.name);
  };

  const commitRename = async () => {
    if (!editingId) {
      return;
    }
    const trimmed = editingName.trim();
    if (trimmed) {
      await DrawingsStore.rename(editingId, trimmed);
      await refresh();
    }
    setEditingId(null);
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).catch(() => {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  };

  return (
    <div className="drawings-panel">
      <div className="drawings-panel__header">
        <button
          className="drawings-panel__save-btn"
          onClick={() => {
            setSaveName("");
            setSaveDialogOpen(true);
          }}
        >
          + Guardar dibujo actual
        </button>
      </div>

      {saveDialogOpen && (
        <div className="drawings-panel__save-dialog">
          <input
            ref={nameInputRef}
            className="drawings-panel__name-input"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Nombre del dibujo..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              } else if (e.key === "Escape") {
                setSaveDialogOpen(false);
              }
            }}
          />
          <div className="drawings-panel__save-actions">
            <button
              className="drawings-panel__btn drawings-panel__btn--primary"
              onClick={handleSave}
              disabled={!saveName.trim() || savingId === "__new__"}
            >
              {savingId === "__new__" ? "Guardando…" : "Guardar"}
            </button>
            <button
              className="drawings-panel__btn"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="drawings-panel__list">
        {isLoading ? (
          <div className="drawings-panel__empty">Cargando…</div>
        ) : drawings.length === 0 ? (
          <div className="drawings-panel__empty">
            No hay dibujos guardados aún.
          </div>
        ) : (
          drawings.map((drawing) => (
            <div key={drawing.id} className="drawings-panel__item">
              <div
                className="drawings-panel__thumbnail"
                onClick={() => handleOpen(drawing)}
                title="Abrir dibujo"
              >
                {drawing.thumbnail ? (
                  <img
                    src={drawing.thumbnail}
                    alt={drawing.name}
                    className="drawings-panel__thumbnail-img"
                  />
                ) : (
                  <div className="drawings-panel__thumbnail-placeholder">
                    {drawing.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="drawings-panel__info">
                {editingId === drawing.id ? (
                  <input
                    autoFocus
                    className="drawings-panel__name-input drawings-panel__name-input--inline"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitRename();
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <div
                    className="drawings-panel__name"
                    title="Doble clic para renombrar"
                    onDoubleClick={() => startRename(drawing)}
                  >
                    {drawing.name}
                  </div>
                )}
                <div className="drawings-panel__date">
                  {formatDate(drawing.updatedAt)}
                </div>
                {drawing.collabLink && (
                  <div className="drawings-panel__collab-badge">
                    Colaborativo
                  </div>
                )}
              </div>

              <div className="drawings-panel__actions">
                <button
                  className="drawings-panel__action-btn"
                  onClick={() => handleOpen(drawing)}
                  title="Abrir"
                >
                  ↗
                </button>
                <button
                  className="drawings-panel__action-btn"
                  onClick={() => handleOverwrite(drawing)}
                  disabled={savingId === drawing.id}
                  title="Sobrescribir con el estado actual del canvas"
                >
                  {savingId === drawing.id ? "…" : "↺"}
                </button>
                {drawing.collabLink && (
                  <button
                    className="drawings-panel__action-btn"
                    onClick={() => copyLink(drawing.collabLink!, drawing.id)}
                    title="Copiar link de colaboración"
                  >
                    {copiedId === drawing.id ? "✓" : "🔗"}
                  </button>
                )}
                <button
                  className="drawings-panel__action-btn drawings-panel__action-btn--danger"
                  onClick={() => handleDelete(drawing.id)}
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isCollaborating && activeRoomLink && (
        <div className="drawings-panel__collab-info">
          <span className="drawings-panel__collab-info-text">
            Sesión activa
          </span>
          <button
            className="drawings-panel__btn drawings-panel__btn--small"
            onClick={() => copyLink(activeRoomLink, "__session__")}
            title="Copiar link de sesión colaborativa"
          >
            {copiedId === "__session__" ? "✓ Copiado" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
};
