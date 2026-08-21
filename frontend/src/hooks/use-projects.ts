'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  ProjectWithRole,
  CreateProjectInput,
  UpdateProjectInput,
} from '@/lib/types';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { projects: data } = await apiClient.get<{
        projects: ProjectWithRole[];
      }>('/api/v1/projects');
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<ProjectWithRole> => {
      const { project } = await apiClient.post<{ project: ProjectWithRole }>(
        '/api/v1/projects',
        input,
      );
      setProjects((prev) => [...prev, project]);
      window.dispatchEvent(new Event('project-list-changed'));
      return project;
    },
    [],
  );

  const updateProject = useCallback(
    async (id: string, input: UpdateProjectInput): Promise<ProjectWithRole> => {
      const { project } = await apiClient.patch<{ project: ProjectWithRole }>(
        `/api/v1/projects/${id}`,
        input,
      );
      setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
      return project;
    },
    [],
  );

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    await apiClient.del(`/api/v1/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    window.dispatchEvent(new Event('project-list-changed'));
  }, []);

  const toggleArchive = useCallback(
    async (id: string, archive: boolean): Promise<ProjectWithRole> => {
      const { project } = await apiClient.patch<{ project: ProjectWithRole }>(
        `/api/v1/projects/${id}/archive`,
        { archive },
      );
      if (archive) {
        // archiving: remove from active list
        setProjects((prev) => prev.filter((p) => p.id !== id));
      } else {
        // unarchiving: add back to active list
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === id);
          return exists ? prev.map((p) => (p.id === id ? project : p)) : [...prev, project];
        });
      }
      window.dispatchEvent(new Event('project-list-changed'));
      return project;
    },
    [],
  );

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    toggleArchive,
    refetch: fetchProjects,
  };
}
