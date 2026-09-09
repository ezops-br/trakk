'use client';

import React from 'react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import type {
  CreateTicketInput,
  TicketWithRelations,
  Priority,
  TicketTemplate,
} from '@/lib/types';
import { useColumns } from '@/hooks/use-columns';
import { useMembers } from '@/hooks/use-members';
import { useTemplates } from '@/hooks/use-templates';
import { useLabels } from '@/hooks/use-labels';
import { useAddTicketLabel } from '@/hooks/use-add-ticket-label';
import { uploadAttachment } from '@/lib/attachments';
import { AttachmentUploader } from '@/components/tickets/attachment-uploader';
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
import { Popover } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { LayoutTemplate } from 'lucide-react';

const LABEL_CLASS =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRIORITY_BADGE_VARIANT: Record<
  Priority,
  'urgent' | 'high' | 'medium' | 'low' | 'neutral'
> = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'neutral',
};

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

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
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
  const { templates } = useTemplates(projectId);
  const { labels } = useLabels(projectId);
  const { addLabel } = useAddTicketLabel(projectId);

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [statusColumnId, setStatusColumnId] = React.useState('');
  const [priority, setPriority] = React.useState<Priority>('MEDIUM');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [selectedLabelIds, setSelectedLabelIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [attachmentsToUpload, setAttachmentsToUpload] = React.useState<File[]>(
    [],
  );
  const [appliedTemplateId, setAppliedTemplateId] = React.useState<
    string | null
  >(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] =
    React.useState(false);
  const [pendingTemplate, setPendingTemplate] =
    React.useState<TicketTemplate | null>(null);
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
    setPriority('MEDIUM');
    setAssigneeId('');
    setDueDate('');
    setSelectedLabelIds(new Set());
    setAttachmentsToUpload([]);
    setAppliedTemplateId(null);
    setConfirmReplaceOpen(false);
    setPendingTemplate(null);
    setSubmitting(false);
    setTitleError(null);
    setFormError(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const isDirty = React.useCallback(() => {
    return (
      title !== '' ||
      description !== '' ||
      priority !== 'MEDIUM' ||
      selectedLabelIds.size > 0 ||
      assigneeId !== '' ||
      dueDate !== '' ||
      attachmentsToUpload.length > 0
    );
  }, [
    title,
    description,
    priority,
    selectedLabelIds,
    assigneeId,
    dueDate,
    attachmentsToUpload,
  ]);

  const applyTemplate = React.useCallback(
    (template: TicketTemplate) => {
      const currentLabelIds = new Set(labels.map((l) => l.id));
      const safeLabels = (template.defaultLabels ?? [])
        .map((l) => l.id)
        .filter((id) => currentLabelIds.has(id));

      setTitle(template.titleTemplate ?? '');
      setDescription(template.descriptionTemplate ?? '');
      setPriority(template.defaultPriority ?? 'MEDIUM');
      setSelectedLabelIds(new Set(safeLabels));
      setAppliedTemplateId(template.id);
    },
    [labels],
  );

  const handleTemplateRowClick = (template: TicketTemplate) => {
    if (isDirty()) {
      setPendingTemplate(template);
      setConfirmReplaceOpen(true);
      return;
    }
    applyTemplate(template);
  };

  const handleConfirmReplace = () => {
    if (pendingTemplate) {
      applyTemplate(pendingTemplate);
    }
    setConfirmReplaceOpen(false);
    setPendingTemplate(null);
  };

  const handleCancelReplace = () => {
    setConfirmReplaceOpen(false);
    setPendingTemplate(null);
  };

  const handleClearTemplate = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setSelectedLabelIds(new Set());
    setAppliedTemplateId(null);
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
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
        dueDate: dueDate === '' ? null : new Date(dueDate).toISOString(),
      });

      // Pre-fill labels sequentially via the per-label endpoint.
      // Skip stale ids silently; bubble non-404 errors so the dialog stays open.
      const currentLabelIds = new Set(labels.map((l) => l.id));
      const labelIdsToAdd = Array.from(selectedLabelIds).filter((id) =>
        currentLabelIds.has(id),
      );

      for (const labelId of labelIdsToAdd) {
        try {
          await addLabel(created.number, labelId);
        } catch (err) {
          if (isApiError(err) && err.status === 404) {
            continue;
          }
          throw err;
        }
      }

      // Attachments are uploaded AFTER the ticket exists (the backend
      // requires `:ticketNumber`). 415 surfaces as a user-friendly toast;
      // any other error rethrows so the dialog stays open.
      for (const file of attachmentsToUpload) {
        try {
          await uploadAttachment(projectId, created.number, file);
        } catch (err) {
          if (isApiError(err) && err.status === 415) {
            throw new Error('Unsupported file type');
          }
          throw err;
        }
      }

      onCreated?.(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.details) {
        if (/title/i.test(err.details)) {
          setTitleError(err.details);
        } else {
          setFormError(err.details);
        }
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to create ticket',
        );
      }
      setSubmitting(false);
    }
  };

  const loading = columnsLoading || membersLoading;

  const templateTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      aria-label="Use template"
    >
      <LayoutTemplate className="mr-2 h-4 w-4" />
      Use template
    </Button>
  );

  return (
    <>
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
              {/* Use template / Clear template button */}
              {appliedTemplateId === null ? (
                <Popover trigger={templateTrigger} align="start" className="w-80">
                  {templates.length === 0 ? (
                    <div className="px-3 py-2 font-body text-[13px] text-trakk-text-secondary">
                      No templates yet — ask an owner to create one.
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="button"
                          onClick={() => handleTemplateRowClick(t)}
                          className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left font-body text-[13px] hover:bg-trakk-surface"
                        >
                          <span className="truncate">{t.name}</span>
                          {t.defaultPriority && (
                            <Badge variant={PRIORITY_BADGE_VARIANT[t.defaultPriority]}>
                              {t.defaultPriority}
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearTemplate}
                  className="self-start underline"
                >
                  Clear template
                </Button>
              )}

              {/* Title */}
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

              {/* Description */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="ticket-description"
                  className={LABEL_CLASS}
                >
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

              {/* Status / Priority / Assignee */}
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
                    onChange={(e) =>
                      setPriority(e.target.value as Priority)
                    }
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

              {/* Due date */}
              <div className="flex flex-col gap-2">
                <label htmlFor="ticket-duedate" className={LABEL_CLASS}>
                  Due Date
                </label>
                <Input
                  id="ticket-duedate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-auto"
                />
              </div>

              {/* Label checkbox block */}
              {labels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className={LABEL_CLASS}>Labels</span>
                  <div className="flex flex-col gap-1">
                    {labels.map((l) => (
                      <label
                        key={l.id}
                        className="flex items-center gap-2 font-body text-[13px] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLabelIds.has(l.id)}
                          onChange={() => toggleLabel(l.id)}
                          className="accent-trakk-teal"
                        />
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-sm border border-trakk-border"
                          style={{ backgroundColor: l.color }}
                        />
                        <span>{l.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments — uploaded AFTER the ticket exists (see handleSubmit). */}
              <div className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>Attachments</span>
                <AttachmentUploader
                  files={attachmentsToUpload}
                  onChange={setAttachmentsToUpload}
                />
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

      {/* Replace-draft confirm dialog */}
      <Dialog
        open={confirmReplaceOpen}
        onOpenChange={(next) => {
          if (!next) handleCancelReplace();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace current draft?</DialogTitle>
            <DialogDescription>
              This will replace your current draft — Apply template?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancelReplace}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmReplace}
            >
              Apply template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}