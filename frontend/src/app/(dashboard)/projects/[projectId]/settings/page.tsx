'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { AlertTriangle, Archive, ArchiveRestore, Lock } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { ProjectWithRole, UpdateProjectInput } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useLabels } from '@/hooks/use-labels';
import { MembersSection } from '@/components/projects/MembersSection';
import { LabelsSection } from '@/components/projects/LabelsSection';
import { TemplatesSection } from '@/components/projects/TemplatesSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const updateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  key: z
    .string()
    .regex(/^[A-Z0-9]{2,10}$/, 'Key must be 2-10 uppercase letters and digits'),
  description: z.string().max(500).optional().nullable(),
  dueDate: z.string().nullable().optional(),
});

const LABEL_CLASS =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

interface SettingsPageProps {
  params: { projectId: string };
}

export default function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = params;
  const router = useRouter();
  const { user } = useAuth();

  const [project, setProject] = React.useState<ProjectWithRole | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const { labels } = useLabels(projectId);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    apiClient
      .get<{ project: ProjectWithRole }>(`/api/v1/projects/${projectId}`)
      .then((data) => {
        if (active) setProject(data.project);
      })
      .catch((err) => {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load project',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="mx-auto max-w-[640px]">
        <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-6 py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-status-error"
            />
            <p className="font-body text-[15px] text-trakk-text-strong">
              Couldn&apos;t load project — {loadError ?? 'not found'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-8">
      <h1 className="font-display font-bold text-3xl tracking-tight text-trakk-text">
        Project settings
      </h1>

      {project.role !== 'OWNER' ? (
        <>
          <ReadOnlyView project={project} />

          <LabelsSection
            projectId={project.id}
            isOwner={false}
          />

          <MembersSection
            projectId={project.id}
            projectName={project.name}
            currentUserId={user?.id ?? ''}
            currentUserRole={project.role}
          />
        </>
      ) : (
        <OwnerSettings
          project={project}
          onProjectChange={setProject}
          router={router}
          currentUserId={user?.id ?? ''}
          labels={labels}
        />
      )}
    </div>
  );
}

function ReadOnlyView({ project }: { project: ProjectWithRole }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-callout border border-[var(--trakk-teal-border)] bg-[var(--trakk-teal-bg)] border-l-[3px] border-l-trakk-teal px-6 py-5">
        <div className="flex items-start gap-3">
          <Lock
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-trakk-teal"
          />
          <p className="font-body text-[15px] text-trakk-text-strong">
            Owner access required to edit this project. You can view its details
            below.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-trakk-border p-6">
        <Field label="Name" value={project.name} />
        <Field label="Key" value={project.key} mono />
        <Field
          label="Description"
          value={project.description || 'No description'}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      <span
        className={
          mono
            ? 'font-mono text-[13px] tracking-wider text-trakk-text'
            : 'font-body text-[15px] text-trakk-text leading-relaxed'
        }
      >
        {value}
      </span>
    </div>
  );
}

function OwnerSettings({
  project,
  onProjectChange,
  router,
  currentUserId,
  labels,
}: {
  project: ProjectWithRole;
  onProjectChange: (p: ProjectWithRole) => void;
  router: ReturnType<typeof useRouter>;
  currentUserId: string;
  labels: ReturnType<typeof useLabels>['labels'];
}) {
  const [name, setName] = React.useState(project.name);
  const [key, setKey] = React.useState(project.key);
  const [description, setDescription] = React.useState(
    project.description ?? '',
  );
  const [dueDate, setDueDate] = React.useState(
    project.dueDate ? project.dueDate.slice(0, 10) : '',
  );
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{
    name?: string;
    key?: string;
  }>({});
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const isArchived = project.archivedAt !== null;

  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSaveError(null);
    setSaveSuccess(false);

    const parsed = updateProjectSchema.safeParse({
      name,
      key,
      description: description.trim() === '' ? null : description,
      dueDate: dueDate === '' ? null : `${dueDate}T00:00:00.000Z`,
    });

    if (!parsed.success) {
      const next: { name?: string; key?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path.includes('name') && !next.name) next.name = issue.message;
        if (issue.path.includes('key') && !next.key) next.key = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setSaving(true);
    try {
      const { project: updated } = await apiClient.patch<{ project: ProjectWithRole }>(
        `/api/v1/projects/${project.id}`,
        parsed.data as UpdateProjectInput,
      );
      onProjectChange(updated);
      setSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({
          key: err.message || 'A project with this key already exists',
        });
      } else {
        setSaveError(
          err instanceof Error ? err.message : 'Failed to save changes',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setActionError(null);
    try {
      await apiClient.patch(`/api/v1/projects/${project.id}/archive`, {
        archive: !isArchived,
      });
      window.dispatchEvent(new Event('project-list-changed'));
      router.push('/projects');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to update archive state',
      );
      setArchiving(false);
      setArchiveOpen(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await apiClient.del(`/api/v1/projects/${project.id}`);
      window.dispatchEvent(new Event('project-list-changed'));
      router.push('/projects');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete project',
      );
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Edit form */}
      <form
        onSubmit={handleSave}
        className="flex flex-col gap-5 rounded-card bg-trakk-surface border border-trakk-border p-6"
      >
        <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
          Details
        </h2>

        <div className="flex flex-col gap-2">
          <label htmlFor="name" className={LABEL_CLASS}>
            Name
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {fieldErrors.name && (
            <p className="font-body text-[13px] text-status-error">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="key" className={LABEL_CLASS}>
            Key
          </label>
          <Input
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            className="font-mono tracking-wider"
            maxLength={10}
          />
          {fieldErrors.key && (
            <p className="font-body text-[13px] text-status-error">
              {fieldErrors.key}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="description" className={LABEL_CLASS}>
            Description
          </label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about? (optional)"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="due-date" className={LABEL_CLASS}>
            Due date
          </label>
          <Input
            id="due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {saveError && (
          <p className="font-body text-[13px] text-status-error">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="font-body text-[13px] text-status-success">
            Changes saved.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>

      <LabelsSection
        projectId={project.id}
        isOwner={true}
      />

      <MembersSection
        projectId={project.id}
        projectName={project.name}
        currentUserId={currentUserId}
        currentUserRole={project.role}
      />

      <TemplatesSection
        projectId={project.id}
        currentUserRole={project.role}
        labels={labels}
      />

      {/* Archive section */}
      <div className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-trakk-border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
            {isArchived ? 'Unarchive project' : 'Archive project'}
          </h2>
          <p className="font-body text-[13px] text-trakk-text-secondary leading-relaxed">
            {isArchived
              ? 'Restore this project to the active project list.'
              : 'Hide this project from the active list. You can unarchive it later.'}
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => setArchiveOpen(true)}
          >
            {isArchived ? (
              <ArchiveRestore size={16} strokeWidth={1.75} />
            ) : (
              <Archive size={16} strokeWidth={1.75} />
            )}
            {isArchived ? 'Unarchive project' : 'Archive project'}
          </Button>
        </div>
      </div>

      {/* Delete section */}
      <div className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-[rgba(255,71,87,0.25)] p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display font-bold text-xl -tracking-wide text-status-error">
            Delete this project
          </h2>
          <p className="font-body text-[13px] text-trakk-text-secondary leading-relaxed">
            This permanently deletes the project and all of its tickets and
            comments. This action cannot be undone. Type the
            project key{' '}
            <span className="font-mono text-trakk-text">{project.key}</span> to
            confirm.
          </p>
        </div>
        <Input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder={project.key}
          className="font-mono tracking-wider"
        />
        {actionError && (
          <p className="font-body text-[13px] text-status-error">
            {actionError}
          </p>
        )}
        <div>
          <Button
            variant="destructive"
            disabled={deleteConfirm !== project.key || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting…' : 'Delete this project'}
          </Button>
        </div>
      </div>

      {/* Archive confirmation */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isArchived ? 'Unarchive project?' : 'Archive project?'}
            </DialogTitle>
            <DialogDescription>
              {isArchived
                ? `"${project.name}" will return to your active project list.`
                : `"${project.name}" will be hidden from your active project list. You can unarchive it any time.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setArchiveOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleArchive} disabled={archiving}>
              {archiving
                ? 'Working…'
                : isArchived
                  ? 'Unarchive'
                  : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
