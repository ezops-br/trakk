import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MemberWithUser, Role } from '@/lib/types';

export interface UseMembersReturn {
  members: MemberWithUser[];
  loading: boolean;
  error: string | null;
  inviteMember: (email: string, role: 'MEMBER' | 'VIEWER') => Promise<void>;
  changeMemberRole: (memberId: string, role: Role) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  refetch?: () => Promise<void>;
}

export function useMembers(projectId: string): UseMembersReturn {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { members: data } = await apiClient.get<{ members: MemberWithUser[] }>(
        `/api/v1/projects/${projectId}/members`,
      );
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const inviteMember = useCallback(
    async (email: string, role: 'MEMBER' | 'VIEWER') => {
      const { member } = await apiClient.post<{ member: MemberWithUser }>(
        `/api/v1/projects/${projectId}/members`,
        { email, role },
      );
      setMembers((prev) => [...prev, member]);
    },
    [projectId],
  );

  const changeMemberRole = useCallback(
    async (memberId: string, role: Role) => {
      const { member } = await apiClient.patch<{ member: MemberWithUser }>(
        `/api/v1/projects/${projectId}/members/${memberId}`,
        { role },
      );
      setMembers((prev) => prev.map((m) => (m.id === memberId ? member : m)));
    },
    [projectId],
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      await apiClient.del(`/api/v1/projects/${projectId}/members/${memberId}`);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    },
    [projectId],
  );

  return {
    members,
    loading,
    error,
    inviteMember,
    changeMemberRole,
    removeMember,
    refetch: fetchMembers,
  };
}
