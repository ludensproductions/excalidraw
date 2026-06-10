import React, { useCallback, useEffect, useRef, useState } from "react";

import { activeBoardAtom, useAtomValue } from "../app-jotai";
import { appDialog } from "../appDialog";
import { getCurrentUser } from "../auth/authStore";
import { activeRoomLinkAtom } from "../collab/Collab";
import { CommentsStore } from "../data/CommentsStore";
import { SharedBoardsStore } from "../data/SharedBoardsStore";
import { getCollaborationLinkData } from "../data";

import "./CommentsPanel.scss";

import type { BoardComment, CommentTarget } from "../data/CommentsStore";

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const areCommentsEqual = (
  prev: readonly BoardComment[],
  next: readonly BoardComment[],
) => {
  if (prev.length !== next.length) {
    return false;
  }

  return prev.every((comment, index) => {
    const nextComment = next[index];
    return (
      comment.id === nextComment.id &&
      comment.body === nextComment.body &&
      comment.updatedAt === nextComment.updatedAt
    );
  });
};

export const CommentsPanel: React.FC = () => {
  const activeBoard = useAtomValue(activeBoardAtom);
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);
  const currentUser = getCurrentUser();
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [isResolvingTarget, setIsResolvingTarget] = useState(false);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let isCancelled = false;

    const resolveTarget = async () => {
      const collabLinkData = getCollaborationLinkData(
        activeRoomLink || window.location.href,
      );

      if (collabLinkData?.roomId) {
        setIsResolvingTarget(true);
        try {
          const sharedBoard = await SharedBoardsStore.getByRoom(
            collabLinkData.roomId,
            collabLinkData.roomKey,
          );

          if (!isCancelled) {
            setTarget(
              sharedBoard
                ? {
                    kind: "shared",
                    id: sharedBoard.id,
                    name: sharedBoard.name || activeBoard.name,
                  }
                : null,
            );
          }
        } finally {
          if (!isCancelled) {
            setIsResolvingTarget(false);
          }
        }
        return;
      }

      setIsResolvingTarget(false);
      setTarget(
        activeBoard.id
          ? { kind: "board", id: activeBoard.id, name: activeBoard.name }
          : null,
      );
    };

    void resolveTarget();

    return () => {
      isCancelled = true;
    };
  }, [activeBoard.id, activeBoard.name, activeRoomLink]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!target) {
        setComments([]);
        return;
      }

      if (!opts?.silent) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const nextComments = await CommentsStore.getAll(target);
        setComments((prev) =>
          areCommentsEqual(prev, nextComments) ? prev : nextComments,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar.");
      } finally {
        if (!opts?.silent) {
          setIsLoading(false);
        }
      }
    },
    [target],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!target || target.kind !== "shared") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh, target]);

  const addComment = async () => {
    const trimmed = body.trim();
    if (!target || !trimmed || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const comment = await CommentsStore.add({
        target,
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
    if (!target || !editingId || !trimmed) {
      return;
    }

    setError(null);
    try {
      const updated = await CommentsStore.update(target, editingId, trimmed);
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
    if (!target) {
      return;
    }

    const confirmed = await appDialog.confirm({
      title: "Eliminar comentario",
      text: "Esta accion no se puede deshacer.",
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await CommentsStore.delete(target, id);
      setComments((prev) => prev.filter((comment) => comment.id !== id));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el comentario.",
      );
    }
  };

  if (isResolvingTarget) {
    return (
      <div className="comments-panel comments-panel--empty-state">
        <div className="comments-panel__empty">Preparando comentarios...</div>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="comments-panel comments-panel--empty-state">
        <div className="comments-panel__empty">
          Guarda este board o abre un board compartido para poder comentar.
        </div>
      </div>
    );
  }

  return (
    <div className="comments-panel">
      <div className="comments-panel__header">
        <div>
          <div className="comments-panel__title">Comentarios</div>
          {target.name && (
            <div className="comments-panel__subtitle">{target.name}</div>
          )}
        </div>
        <button className="comments-panel__refresh" onClick={() => void refresh()}>
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
              void addComment();
            }
          }}
        />
        <button
          className="comments-panel__send"
          disabled={!body.trim() || isSaving}
          onClick={() => void addComment()}
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
                        onClick={() => void commitEdit()}
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
                          onClick={() => void deleteComment(comment.id)}
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
