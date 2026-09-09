'use client';

import Link from 'next/link';
import { Settings, Users } from 'lucide-react';
import type { ProjectWithRole } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface ProjectCardProps {
  project: ProjectWithRole;
}

const dueDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function parseIsoDateUtc(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className="group relative rounded-card bg-trakk-surface border border-trakk-border shadow-card transition-all duration-200 ease-ace-enter hover:border-[var(--trakk-teal-border)] hover:shadow-glow-subtle">
      <Link
        href={`/projects/${project.id}`}
        className="block p-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
            {project.name}
          </h3>
          <Badge variant="teal" className="shrink-0">
            {project.key}
          </Badge>
        </div>

        <p className="mt-2 font-body text-[13px] text-trakk-text-secondary leading-relaxed line-clamp-2 min-h-[2.5em]">
          {project.description || 'No description'}
        </p>

        {project.dueDate && (() => {
          const parsed = parseIsoDateUtc(project.dueDate);
          if (!parsed) return null;
          return (
            <p className="mt-1 font-body text-[12px] text-trakk-text-secondary">
              Due {dueDateFormatter.format(parsed)}
            </p>
          );
        })()}

        <div className="mt-4 flex items-center gap-4 font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} strokeWidth={1.75} />
            {project.memberCount}{' '}
            {project.memberCount === 1 ? 'member' : 'members'}
          </span>
          <span className="text-trakk-teal">{project.role}</span>
        </div>
      </Link>

      <Link
        href={`/projects/${project.id}/settings`}
        aria-label="Project settings"
        className="absolute right-4 bottom-4 rounded-md p-1.5 text-trakk-text-secondary transition-colors duration-200 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-teal focus:outline-none focus:ring-2 focus:ring-[var(--trakk-teal)]"
      >
        <Settings size={20} strokeWidth={1.75} />
      </Link>
    </div>
  );
}
