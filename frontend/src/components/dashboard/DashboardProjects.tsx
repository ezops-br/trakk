'use client';

import React from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DashboardEmpty } from './DashboardEmpty';
import { applyProjectFilters, sortProjects } from '@/lib/dashboard-filter-utils';
import type { RawDashboardProject, DashboardFilters } from '@/lib/types';

interface Props {
  projects: RawDashboardProject[];
  loading: boolean;
  filters: DashboardFilters;
  onNavigate: (projectId: string) => void;
}

const ROLE_BADGE_VARIANT: Record<string, 'teal' | 'blue' | 'neutral'> = {
  OWNER: 'teal',
  MEMBER: 'blue',
  VIEWER: 'neutral',
};

export function DashboardProjects({ projects, loading, filters, onNavigate }: Props) {
  const filtered = applyProjectFilters(projects, filters);
  const sorted = sortProjects(
    filtered,
    filters.projectSort ?? 'createdAt',
    filters.projectSortDir ?? 'DESC',
  );
  const displayed = sorted.slice(0, 5);

  return (
    <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card">
      <div className="px-5 py-4 border-b border-trakk-border flex items-center justify-between">
        <h2 className="font-display font-bold text-base text-trakk-text tracking-wide">
          Projects
        </h2>
        {!loading && projects.length > 0 && (
          <span className="font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
            {projects.length} total
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : displayed.length === 0 ? (
        <DashboardEmpty
          title="No projects found"
          description="Projects you are a member of will appear here."
        />
      ) : (
        <ul className="divide-y divide-trakk-border">
          {displayed.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onNavigate(project.id)}
                className="w-full text-left px-5 py-3.5 hover:bg-[var(--trakk-teal-hover)] transition-colors duration-150 flex items-center gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display font-bold text-sm text-trakk-text truncate">
                      {project.name}
                    </span>
                    <Badge variant="teal" className="shrink-0 text-[9px] px-2 py-0">
                      {project.key}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary">
                      {project.openCount} open / {project.totalCount} total
                    </span>
                  </div>
                </div>
                {project.role && (
                  <Badge
                    variant={ROLE_BADGE_VARIANT[project.role] ?? 'neutral'}
                    className="shrink-0 text-[9px] px-2 py-0"
                  >
                    {project.role}
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
