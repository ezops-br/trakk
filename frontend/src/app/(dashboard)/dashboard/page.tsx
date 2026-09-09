'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDashboard } from '@/hooks/use-dashboard';
import { useDashboardEvents } from '@/hooks/use-dashboard-events';
import { DashboardMyTickets } from '@/components/dashboard/DashboardMyTickets';
import { DashboardRecentActivity } from '@/components/dashboard/DashboardRecentActivity';
import { DashboardProjects } from '@/components/dashboard/DashboardProjects';
import { TicketDetailSheet } from '@/components/tickets/ticket-detail-sheet';
import type { DashboardFilters, Role } from '@/lib/types';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    tickets,
    activities,
    projects,
    loading,
    error,
    setTickets,
    setActivities,
    setProjects,
    refetch,
  } = useDashboard();

  const [connectionDropped, setConnectionDropped] = useState(false);
  const [openTicket, setOpenTicket] = useState<{
    projectId: string;
    projectKey: string;
    ticketNumber: number;
  } | null>(null);

  // Parse filters from URL
  const ticketPriorityRaw = searchParams.get('ticketPriority');
  const ticketStatusRaw = searchParams.get('ticketStatus');
  const activityActionRaw = searchParams.get('activityAction');
  const projectRoleRaw = searchParams.get('projectRole');

  const filters: DashboardFilters = {
    ticketPriority: ticketPriorityRaw
      ? (ticketPriorityRaw.split(',').filter(Boolean) as DashboardFilters['ticketPriority'])
      : undefined,
    ticketStatus: ticketStatusRaw
      ? ticketStatusRaw.split(',').filter(Boolean)
      : undefined,
    ticketSort: (searchParams.get('ticketSort') as DashboardFilters['ticketSort']) ?? 'updatedAt',
    ticketSortDir:
      (searchParams.get('ticketSortDir') as DashboardFilters['ticketSortDir']) ?? 'DESC',
    activityAction: activityActionRaw
      ? activityActionRaw.split(',').filter(Boolean)
      : undefined,
    projectRole: projectRoleRaw
      ? (projectRoleRaw.split(',').filter(Boolean) as DashboardFilters['projectRole'])
      : undefined,
    projectSort:
      (searchParams.get('projectSort') as DashboardFilters['projectSort']) ?? 'updatedAt',
    projectSortDir:
      (searchParams.get('projectSortDir') as DashboardFilters['projectSortDir']) ?? 'DESC',
  };

  const { isConnected } = useDashboardEvents({
    // SSE ticket payloads are TicketWithRelations (board shape) — they don't include
    // project: { key, name } that the dashboard needs. For creates, refetch so we get
    // the full dashboard shape. For updates, merge to preserve the existing project field.
    onTicketCreated: () => refetch(),
    onTicketUpdated: (ticket) =>
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...ticket, project: t.project } : t)),
      ),
    onTicketDeleted: (id) => setTickets((prev) => prev.filter((t) => t.id !== id)),
    onActivityCreated: (a) =>
      setActivities((prev) =>
        prev.some((x) => x.id === a.id) ? prev : [a, ...prev].slice(0, 20),
      ),
    onProjectArchived: (id) => setProjects((prev) => prev.filter((p) => p.id !== id)),
    onProjectDeleted: (id) => setProjects((prev) => prev.filter((p) => p.id !== id)),
  });

  useEffect(() => {
    setConnectionDropped(!isConnected);
  }, [isConnected]);

  const openTicketSheet = (projectId: string, projectKey: string, ticketNumber: number) =>
    setOpenTicket({ projectId, projectKey, ticketNumber });

  // Error state: API fetch failed
  if (!loading && error) {
    return (
      <div className="flex h-[calc(100%+3rem)] -m-6 flex-col items-center justify-center p-6 gap-4">
        <p className="text-trakk-text font-body">Failed to load dashboard.</p>
        <button
          onClick={refetch}
          className="text-trakk-teal underline text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state: no projects yet
  if (!loading && !error && projects.length === 0) {
    return (
      <div className="flex h-[calc(100%+3rem)] -m-6 flex-col items-center justify-center p-6 gap-4">
        <h1 className="text-2xl font-display font-bold text-trakk-text">
          Welcome to Trakk
        </h1>
        <p className="text-trakk-text-secondary font-body">
          Create your first project to get started.
        </p>
        <a
          href="/projects"
          className="text-trakk-teal underline text-sm font-body hover:text-trakk-teal/80 transition-colors"
        >
          Create a project
        </a>
      </div>
    );
  }

  const openTicketRole: Role =
    (projects.find((p) => p.id === openTicket?.projectId)?.role as Role) ?? 'MEMBER';

  return (
    <div className="flex h-[calc(100%+3rem)] -m-6 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {connectionDropped && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
            Live updates paused. Reconnecting...
          </div>
        )}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DashboardMyTickets
              tickets={tickets}
              loading={loading}
              filters={filters}
              onNavigate={openTicketSheet}
            />
            <DashboardProjects
              projects={projects}
              loading={loading}
              filters={filters}
              onNavigate={(id) => router.push(`/projects/${id}`)}
            />
          </div>
          <DashboardRecentActivity
            activities={activities}
            loading={loading}
            filters={filters}
            onNavigate={openTicketSheet}
          />
        </div>
      </div>
      {openTicket && (
        <TicketDetailSheet
          projectId={openTicket.projectId}
          projectKey={openTicket.projectKey}
          ticketNumber={openTicket.ticketNumber}
          open={openTicket !== null}
          onOpenChange={(o) => { if (!o) setOpenTicket(null); }}
          userRole={openTicketRole}
          projectIsArchived={false}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
