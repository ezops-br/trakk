'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CommentWithAuthor } from '@/lib/types';

export interface UseCommentsReturn {
  comments: CommentWithAuthor[];
  loading: boolean;
  error: string | null;
  createComment: (body: string) => Promise<void>;
  updateComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useComments(
  projectId: string,
  ticketNumber: number,
  enabled: boolean,
): UseCommentsReturn {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { comments: data } = await apiClient.get<{
        comments: CommentWithAuthor[];
      }>(`/api/v1/projects/${projectId}/tickets/${ticketNumber}/comments`);
      setComments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [projectId, ticketNumber, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchComments();
    }
  }, [fetchComments, enabled]);

  const createComment = useCallback(
    async (body: string) => {
      const { comment } = await apiClient.post<{ comment: CommentWithAuthor }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/comments`,
        { body },
      );
      setComments((prev) => [...prev, comment]);
    },
    [projectId, ticketNumber],
  );

  const updateComment = useCallback(
    async (commentId: string, body: string) => {
      const { comment } = await apiClient.patch<{ comment: CommentWithAuthor }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/comments/${commentId}`,
        { body },
      );
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? comment : c)),
      );
    },
    [projectId, ticketNumber],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      await apiClient.del(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/comments/${commentId}`,
      );
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    },
    [projectId, ticketNumber],
  );

  return {
    comments,
    loading,
    error,
    createComment,
    updateComment,
    deleteComment,
    refetch: fetchComments,
  };
}
