'use client';

import * as React from 'react';
import { MoreHorizontal, Plus, Trash2, Pencil } from 'lucide-react';
import type {
  CreateTicketTemplateInput,
  LabelSummary,
  Priority,
  TicketTemplate,
  UpdateTicketTemplateInput,
} from '@/lib/types';
import { ApiError } from '@/lib/api-client';
import { useTemplates } from '@/hooks/use-templates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LABEL_CLASS =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'NONE', label: 'None' },
];

type BadgeVariant =
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'neutral';

const PRIORITY_BADGE_VARIANT: Record<Priority, BadgeVariant> = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'neutral',
};

const NO_PRIORITY = '';

interface TemplatesSectionProps {
  projectId: string;
  currentUserRole: string;
  labels: LabelSummary[];
}

interface TemplateFormState {
  name: string;
  titleTemplate: string;
  descriptionTemplate: string;
  defaultPriority: Priority | null;
  defaultLabelIds: Set<string>;
}

function emptyFormState(): TemplateFormState {
  return {
    name: '',
    titleTemplate: '',
    descriptionTemplate: '',
    defaultPriority: null,
    defaultLabelIds: new Set<string>(),
  };
}

function templateToFormState(template: TicketTemplate): TemplateFormState {
  return {
    name: template.name,
    titleTemplate: template.titleTemplate ?? '',
    descriptionTemplate: template.descriptionTemplate ?? '',
    defaultPriority: template.defaultPriority ?? null,
    defaultLabelIds: new Set(template.defaultLabels.map((l) => l.id)),
  };
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TemplateFormState;
  labels: LabelSummary[];
  onSubmit: (input: CreateTicketTemplateInput) => Promise<void>;
}

function TemplateDialog({
  open,
  onOpenChange,
  initial,
  labels,
  onSubmit,
}: TemplateDialogProps) {
  const [form, setForm] = React.useState<TemplateFormState>(initial);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm({
        ...initial,
        defaultLabelIds: new Set(initial.defaultLabelIds),
      });
      setFormError(null);
    }
  }, [open, initial]);

  const toggleLabel = (id: string, checked: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.defaultLabelIds);
      if (checked) next.add(id);
      else next.delete(id);
      return { ...prev, defaultLabelIds: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length === 0) {
      setFormError('Name is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: CreateTicketTemplateInput = {
        name: form.name.trim(),
        titleTemplate: form.titleTemplate.trim() || undefined,
        descriptionTemplate: form.descriptionTemplate.trim() || undefined,
        defaultPriority: form.defaultPriority ?? undefined,
        defaultLabelIds:
          form.defaultLabelIds.size > 0
            ? Array.from(form.defaultLabelIds)
            : undefined,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(err.message || 'A template with this name already exists');
      } else if (err instanceof ApiError && err.status === 403) {
        setFormError(err.message || 'Only owners can manage templates');
      } else {
        setFormError(
          err instanceof Error ? err.message : 'Failed to save template',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Template</DialogTitle>
          <DialogDescription>
            Reusable preset for creating tickets quickly.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          id="template-form"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="template-name" className={LABEL_CLASS}>
              Name
            </label>
            <Input
              id="template-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="Bug fix"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="template-title" className={LABEL_CLASS}>
              Title template
            </label>
            <Input
              id="template-title"
              value={form.titleTemplate}
              onChange={(e) =>
                setForm({ ...form, titleTemplate: e.target.value })
              }
              maxLength={200}
              placeholder="[Bug] {{summary}}"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="template-description" className={LABEL_CLASS}>
              Description template
            </label>
            <Textarea
              id="template-description"
              value={form.descriptionTemplate}
              onChange={(e) =>
                setForm({ ...form, descriptionTemplate: e.target.value })
              }
              maxLength={10000}
              placeholder="Steps to reproduce, expected vs. actual…"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="template-priority" className={LABEL_CLASS}>
              Default priority
            </label>
            <Select
              id="template-priority"
              value={form.defaultPriority ?? NO_PRIORITY}
              onChange={(e) => {
                const value = e.target.value;
                setForm({
                  ...form,
                  defaultPriority: value === '' ? null : (value as Priority),
                });
              }}
            >
              <option value="">No default</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className={LABEL_CLASS}>Default labels</span>
            {labels.length === 0 ? (
              <p className="font-body text-[13px] text-trakk-text-secondary">
                Create labels first to use them as defaults.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-trakk-border p-3 max-h-48 overflow-y-auto">
                {labels.map((label) => {
                  const checked = form.defaultLabelIds.has(label.id);
                  return (
                    <label
                      key={label.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          toggleLabel(label.id, e.target.checked)
                        }
                        className="h-4 w-4 cursor-pointer accent-trakk-teal"
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: label.color }}
                        aria-hidden="true"
                      />
                      <span className="font-body text-[13px] text-trakk-text">
                        {label.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
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
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesSection({
  projectId,
  currentUserRole,
  labels,
}: TemplatesSectionProps) {
  const isOwner = currentUserRole === 'OWNER';
  const {
    templates,
    loading,
    error,
    refetch,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useTemplates(projectId);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] =
    React.useState<TicketTemplate | null>(null);
  const [dialogInitial, setDialogInitial] =
    React.useState<TemplateFormState>(emptyFormState);

  if (!isOwner) {
    return null;
  }

  const openCreate = () => {
    setEditingTemplate(null);
    setDialogInitial(emptyFormState());
    setDialogOpen(true);
  };

  const openEdit = (template: TicketTemplate) => {
    setEditingTemplate(template);
    setDialogInitial(templateToFormState(template));
    setDialogOpen(true);
  };

  const handleDelete = (template: TicketTemplate) => {
    const confirmed = window.confirm(
      `Delete template "${template.name}"? Tickets created from it are unaffected.`,
    );
    if (!confirmed) return;
    deleteTemplate(template.id).catch((err) => {
      window.alert(
        err instanceof Error ? err.message : 'Failed to delete template',
      );
    });
  };

  const handleSubmit = async (payload: CreateTicketTemplateInput) => {
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, payload);
    } else {
      await createTemplate(payload);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-trakk-border p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
          Templates
        </h2>
        {isOwner && (
          <Button
            variant="primary"
            className="gap-2"
            onClick={openCreate}
          >
            <Plus size={16} strokeWidth={1.75} />
            New template
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col gap-2">
          <p className="font-body text-[13px] text-status-error">{error}</p>
          <div>
            <Button variant="secondary" onClick={refetch}>
              Retry
            </Button>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <p className="font-body text-[13px] text-trakk-text-secondary">
          No templates yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between gap-4 rounded-md border border-trakk-border p-4"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-body text-[14px] font-medium text-trakk-text truncate">
                  {template.name}
                </span>
                <span className="font-body text-[12px] text-trakk-text-secondary">
                  Title:{' '}
                  {template.titleTemplate ? template.titleTemplate : '—'}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {template.defaultPriority && (
                  <Badge
                    variant={PRIORITY_BADGE_VARIANT[template.defaultPriority]}
                  >
                    {template.defaultPriority}
                  </Badge>
                )}
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Template actions for ${template.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-trakk-text-secondary hover:bg-trakk-surface-alt"
                      >
                        <MoreHorizontal size={16} strokeWidth={1.75} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(template)}>
                        <Pencil size={14} strokeWidth={1.75} className="mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleDelete(template)}
                        className="text-status-error"
                      >
                        <Trash2 size={14} strokeWidth={1.75} className="mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={dialogInitial}
        labels={labels}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
