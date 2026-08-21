'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderKanban, Plus, AlertTriangle } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function ProjectsPage() {
  const { projects, loading, error, createProject, refetch } = useProjects();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createTicketDialogOpen, setCreateTicketDialogOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handler = () => setDialogOpen(true);
    window.addEventListener('open-create-project-dialog', handler);
    return () => window.removeEventListener('open-create-project-dialog', handler);
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setDialogOpen(true);
      router.replace('/projects', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (searchParams.get('createTicket') === 'true') {
      setCreateTicketDialogOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('createTicket');
      const newUrl = params.toString()
        ? `/projects?${params.toString()}`
        : '/projects';
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, router]);

  // Only OWNER/MEMBER can create tickets — VIEWER is read-only.
  const ticketableProjects = projects.filter((p) => p.role !== 'VIEWER');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-3xl tracking-tight text-trakk-text">
          Projects
        </h1>
        <Button
          variant="primary"
          onClick={() => setDialogOpen(true)}
          className="gap-2"
        >
          <Plus size={16} strokeWidth={2} />
          New Project
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-card bg-trakk-surface border border-trakk-border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
              <Skeleton className="mt-4 h-4 w-24" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-6 py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-status-error"
            />
            <div className="flex flex-col gap-2">
              <p className="font-body text-[15px] text-trakk-text-strong">
                Couldn&apos;t load projects — {error}
              </p>
              <div>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-card bg-trakk-surface border border-trakk-border py-16 px-6 text-center">
          <FolderKanban
            size={48}
            strokeWidth={1.5}
            className="text-trakk-text-secondary"
          />
          <div className="flex flex-col gap-1">
            <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
              No projects yet
            </h2>
            <p className="font-body text-[15px] text-trakk-text-secondary leading-relaxed">
              Create your first project to get started.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setDialogOpen(true)}
            className="gap-2"
          >
            <Plus size={16} strokeWidth={2} />
            New Project
          </Button>
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={createProject}
      />

      <Dialog
        open={createTicketDialogOpen}
        onOpenChange={setCreateTicketDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a ticket</DialogTitle>
            <DialogDescription>
              Select a project to create a ticket in.
            </DialogDescription>
          </DialogHeader>

          {ticketableProjects.length === 0 ? (
            <p className="font-body text-[15px] text-trakk-text-secondary">
              You don&apos;t have a project where you can create tickets yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto -mx-1 px-1">
              {ticketableProjects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateTicketDialogOpen(false);
                      router.push(
                        `/projects/${project.id}?newTicket=true`,
                      );
                    }}
                    className="flex w-full items-center gap-3 rounded-panel border border-trakk-border bg-trakk-surface-alt px-4 py-3 text-left transition-colors hover:bg-[var(--trakk-teal-hover)]"
                  >
                    <FolderKanban
                      size={18}
                      className="shrink-0 text-trakk-teal"
                    />
                    <span className="font-mono text-xs text-trakk-text-secondary shrink-0">
                      {project.key}
                    </span>
                    <span className="truncate font-body text-[15px] text-trakk-text">
                      {project.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
