'use client';

import React from 'react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import type {
  CreateTicketInput,
  TicketWithRelations,
  Priority,
} from '@/lib/types';
import { useColumns } from '@/hooks/use-columns';
import { useMembers } from '@/hooks/use-members';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const LABEL_CLASS =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'NONE', label: '– None' },
  { value: 'LOW', label: '↓ Low' },
  { value: 'MEDIUM', label: '→ Medium' },
  { value: 'HIGH', label: '↑ High' },
  { value: 'URGENT', label: '⚡ Urgent' },
];

const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  statusColumnId: z.string().min(1, 'Status is required'),
});

interface CreateTicketDialogProps {
  projectId: string;
  defaultStatusColumnId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateTicketInput) => Promise<TicketWithRelations>;
  onCreated?: (ticket: TicketWithRelations) => void;
}

export function CreateTicketDialog({
  projectId,
  defaultStatusColumnId,
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: CreateTicketDialogProps) {
  const { columns, loading: columnsLoading, error: columnsError } =
    useColumns(projectId);
  const { members, loading: membersLoading } = useMembers(projectId);

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [statusColumnId, setStatusColumnId] = React.useState('');
  const [priority, setPriority] = React.useState<Priority>('NONE');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [titleError, setTitleError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Seed the status select once columns load / when a default is provided.
  React.useEffect(() => {
    if (!open) return;
    if (defaultStatusColumnId) {
      setStatusColumnId(defaultStatusColumnId);
    } else if (columns.length > 0) {
      setStatusColumnId((prev) => prev || columns[0].id);
    }
  }, [open, defaultStatusColumnId, columns]);

  const reset = React.useCallback(() => {
    setTitle('');
    setDescription('');
    setPriority('NONE');
    setAssigneeId('');
    setSubmitting(false);
    setTitleError(null);
    setFormError(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTitleError(null);
    setFormError(null);

    const parsed = createTicketSchema.safeParse({ title, statusColumnId });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path.includes('title')) setTitleError(issue.message);
        if (issue.path.includes('statusColumnId') && !titleError)
          setFormError(issue.message);
      }
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreate({
        title: title.trim(),
        description: description.trim() === '' ? null : description,
        statusColumnId,
        priority,
        assigneeId: assigneeId === '' ? null : assigneeId,
      });
      onCreated?.(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to create ticket',
      );
      setSubmitting(false);
    }
  };

  const loading = columnsLoading || membersLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create ticket</DialogTitle>
          <DialogDescription>
            Add a new ticket to this project.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : columnsError ? (
          <p className="font-body text-[13px] text-status-error">
            Couldn&apos;t load board columns — {columnsError}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="ticket-title" className={LABEL_CLASS}>
                Title
              </label>
              <Input
                id="ticket-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of the work"
                autoFocus
              />
              {titleError && (
                <p className="font-body text-[13px] text-status-error">
                  {titleError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ticket-description" className={LABEL_CLASS}>
                Description
              </label>
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the work. Markdown supported."
              />
              <p className="font-body text-[13px] text-trakk-text-secondary">
                Markdown supported.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="ticket-status" className={LABEL_CLASS}>
                  Status
                </label>
                <Select
                  id="ticket-status"
                  value={statusColumnId}
                  onChange={(e) => setStatusColumnId(e.target.value)}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="ticket-priority" className={LABEL_CLASS}>
                  Priority
                </label>
                <Select
                  id="ticket-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="ticket-assignee" className={LABEL_CLASS}>
                  Assignee
                </label>
                <Select
                  id="ticket-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.displayName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {formError && (
              <p className="font-body text-[13px] text-status-error">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create ticket'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
