'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  RawDashboardTicket,
  RawDashboardActivity,
  RawDashboardProject,
  RawDashboardResponse,
} from '@/lib/types';

export function useDashboard() {
  const [tickets, setTickets] = useState<RawDashboardTicket[]>([]);
  const [activities, setActivities] = useState<RawDashboardActivity[]>([]);
  const [projects, setProjects] = useState<RawDashboardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tickets: t, activities: a, projects: p } =
        await apiClient.get<RawDashboardResponse>('/api/v1/dashboard');
      setTickets(t);
      setActivities(a);
      setProjects(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setTickets([]);
      setActivities([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    tickets,
    activities,
    projects,
    loading,
    error,
    refetch: fetchDashboard,
    setTickets,
    setActivities,
    setProjects,
  };
}
