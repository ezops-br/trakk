'use client';

import * as React from 'react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import type { CreateProjectInput, ProjectWithRole } from '@/lib/types';
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

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  key: z
    .string()
    .regex(/^[A-Z0-9]{2,10}$/, 'Key must be 2-10 uppercase letters and digits'),
  description: z.string().max(500).optional().nullable(),
  dueDate: z.string().nullable().optional(),
});

const LABEL_CLASS =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

function suggestKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: CreateProjectInput) => Promise<ProjectWithRole>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateProjectDialogProps) {
  const [name, setName] = React.useState('');
  const [key, setKey] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [keyEdited, setKeyEdited] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{
    name?: string;
    key?: string;
  }>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setName('');
    setKey('');
    setDescription('');
    setDueDate('');
    setKeyEdited(false);
    setSubmitting(false);
    setFieldErrors({});
    setFormError(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyEdited) {
      setKey(suggestKey(value));
    }
  };

  const handleKeyChange = (value: string) => {
    setKeyEdited(true);
    setKey(value.toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = createProjectSchema.safeParse({
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

    setSubmitting(true);
    try {
      await onCreate(parsed.data);
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({
          key: err.message || 'A project with this key already exists',
        });
      } else {
        setFormError(
          err instanceof Error ? err.message : 'Failed to create project',
        );
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Set up a new project. The key prefixes every ticket ID.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="project-name" className={LABEL_CLASS}>
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
            {fieldErrors.name && (
              <p className="font-body text-[13px] text-status-error">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="project-key" className={LABEL_CLASS}>
              Key
            </label>
            <Input
              id="project-key"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="MYPROJ"
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
            <label htmlFor="project-description" className={LABEL_CLASS}>
              Description
            </label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about? (optional)"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="project-due-date" className={LABEL_CLASS}>
              Due date
            </label>
            <Input
              id="project-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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
              {submitting ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
