'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { KanbanBoard } from '@/components/board/kanban-board';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProjectWithRole } from '@/lib/types';

export default function ProjectBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const { projectId } = params;
  const searchParams = useSearchParams();
  const initialTicketNumber = searchParams.get('ticket')
    ? Number(searchParams.get('ticket'))
    : null;

  const [project, setProject] = useState<ProjectWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      setLoading(true);
      setError(null);
      try {
        const { project: p } = await apiClient.get<{ project: ProjectWithRole }>(
          `/api/v1/projects/${projectId}`,
        );
        setProject(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex gap-4 p-6 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 w-64 space-y-3">
            <Skeleton className="h-8 w-40" />
            {[1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-24 w-full rounded-card" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={32} className="text-status-error" strokeWidth={1.5} />
        <p className="text-trakk-text-secondary font-body">
          {error ?? 'Project not found'}
        </p>
      </div>
    );
  }

  return (
    <KanbanBoard
      projectId={projectId}
      projectKey={project.key}
      initialRole={project.role}
      initialTicketNumber={initialTicketNumber}
      projectIsArchived={!!project.archivedAt}
    />
  );
}
