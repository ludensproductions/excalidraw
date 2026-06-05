import React, { useCallback, useEffect, useRef, useState } from "react";

import { activeBoardAtom, useAtomValue } from "../app-jotai";
import { getCurrentUser } from "../auth/authStore";
import { CommentsStore } from "../data/CommentsStore";

import "./CommentsPanel.scss";

import type { BoardComment } from "../data/CommentsStore";

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const CommentsPanel: React.FC = () => {
  const activeBoard = useAtomValue(activeBoardAtom);
  const currentUser = getCurrentUser();
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    if (!activeBoard.id) {
      setComments([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setComments(await CommentsStore.getAll(activeBoard.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar.");
    } finally {
      setIsLoading(false);
    }
  }, [activeBoard.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addComment = async () => {
    const trimmed = body.trim();
    if (!activeBoard.id || !trimmed || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const comment = await CommentsStore.add({
        boardId: activeBoard.id,
        body: trimmed,
        authorName: currentUser?.username || "Usuario",
      });
      setComments((prev) => [...prev, comment]);
      setBody("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo comentar.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (comment: BoardComment) => {
    setEditingId(comment.id);
    setEditingBody(comment.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingBody("");
  };

  const commitEdit = async () => {
    const trimmed = editingBody.trim();
    if (!editingId || !trimmed) {
      return;
    }

    setError(null);
    try {
      const updated = await CommentsStore.update(editingId, trimmed);
      setComments((prev) =>
        prev.map((comment) => (comment.id === updated.id ? updated : comment)),
      );
      cancelEdit();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo editar el comentario.",
      );
    }
  };

  const deleteComment = async (id: string) => {
    if (!window.confirm("Eliminar este comentario?")) {
      return;
    }
    setError(null);
    try {
      await CommentsStore.delete(id);
      setComments((prev) => prev.filter((comment) => comment.id !== id));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el comentario.",
      );
    }
  };

  if (!activeBoard.id) {
    return (
      <div className="comments-panel comments-panel--empty-state">
        <div className="comments-panel__empty">
          Guarda este board para poder dejar comentarios.
        </div>
      </div>
    );
  }

  return (
    <div className="comments-panel">
      <div className="comments-panel__header">
        <div>
          <div className="comments-panel__title">Comentarios</div>
          {activeBoard.name && (
            <div className="comments-panel__subtitle">{activeBoard.name}</div>
          )}
        </div>
        <button className="comments-panel__refresh" onClick={refresh}>
          Actualizar
        </button>
      </div>

      <div className="comments-panel__composer">
        <textarea
          ref={inputRef}
          className="comments-panel__textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Escribe un comentario..."
          rows={3}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              addComment();
            }
          }}
        />
        <button
          className="comments-panel__send"
          disabled={!body.trim() || isSaving}
          onClick={addComment}
        >
          {isSaving ? "Enviando..." : "Comentar"}
        </button>
      </div>

      {error && <div className="comments-panel__error">{error}</div>}

      <div className="comments-panel__list">
        {isLoading ? (
          <div className="comments-panel__empty">Cargando comentarios...</div>
        ) : comments.length === 0 ? (
          <div className="comments-panel__empty">
            Todavia no hay comentarios.
          </div>
        ) : (
          comments.map((comment) => {
            const isOwn = comment.userId === currentUser?.id;
            const isEditing = editingId === comment.id;

            return (
              <div key={comment.id} className="comments-panel__item">
                <div className="comments-panel__meta">
                  <span className="comments-panel__author">
                    {comment.authorName}
                  </span>
                  <span className="comments-panel__date">
                    {formatDate(comment.updatedAt)}
                  </span>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      className="comments-panel__textarea comments-panel__textarea--edit"
                      value={editingBody}
                      rows={3}
                      onChange={(event) => setEditingBody(event.target.value)}
                    />
                    <div className="comments-panel__actions">
                      <button
                        className="comments-panel__action"
                        disabled={!editingBody.trim()}
                        onClick={commitEdit}
                      >
                        Guardar
                      </button>
                      <button
                        className="comments-panel__action"
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="comments-panel__body">{comment.body}</div>
                    {isOwn && (
                      <div className="comments-panel__actions">
                        <button
                          className="comments-panel__action"
                          onClick={() => startEdit(comment)}
                        >
                          Editar
                        </button>
                        <button
                          className="comments-panel__action comments-panel__action--danger"
                          onClick={() => deleteComment(comment.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
