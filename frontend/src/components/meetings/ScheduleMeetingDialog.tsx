'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ScheduleMeetingInput } from '@/lib/types';

export const scheduleMeetingSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
  })
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime) return true;
      return new Date(data.endTime) > new Date(data.startTime);
    },
    {
      message: 'End time must be after start time',
      path: ['endTime'],
    },
  );

type ScheduleFormValues = z.infer<typeof scheduleMeetingSchema>;

export interface ScheduleMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  scheduleMeeting: (input: ScheduleMeetingInput) => Promise<void>;
  projectId: string;
  ticketNumber: number;
  existingMeeting?: { title: string; startTime: string; endTime: string };
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleMeetingDialog({
  open,
  onClose,
  scheduleMeeting,
  existingMeeting,
}: ScheduleMeetingDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleMeetingSchema),
  });

  React.useEffect(() => {
    if (open) {
      reset(
        existingMeeting
          ? {
              title: existingMeeting.title,
              startTime: toDatetimeLocal(existingMeeting.startTime),
              endTime: toDatetimeLocal(existingMeeting.endTime),
            }
          : { title: '', startTime: '', endTime: '' },
      );
      setServerError(null);
    }
  }, [open, existingMeeting, reset]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  const onSubmit = async (values: ScheduleFormValues) => {
    setSubmitting(true);
    setServerError(null);
    try {
      await scheduleMeeting(values);
      reset();
      onClose();
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Failed to save meeting');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent role="dialog">
        <DialogHeader>
          <DialogTitle>{existingMeeting ? 'Reschedule Meeting' : 'Schedule Meeting'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="meeting-title" className="font-mono text-[10px] uppercase tracking-[3px] text-trakk-teal">
              Title
            </label>
            <Input
              id="meeting-title"
              aria-label="Title"
              {...register('title')}
              placeholder="Meeting title"
            />
            {errors.title && (
              <p className="text-sm text-status-error">{errors.title.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="meeting-startTime" className="font-mono text-[10px] uppercase tracking-[3px] text-trakk-teal">
              Start time
            </label>
            <Input
              id="meeting-startTime"
              aria-label="Start time"
              type="datetime-local"
              {...register('startTime')}
            />
            {errors.startTime && (
              <p className="text-sm text-status-error">{errors.startTime.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="meeting-endTime" className="font-mono text-[10px] uppercase tracking-[3px] text-trakk-teal">
              End time
            </label>
            <Input
              id="meeting-endTime"
              aria-label="End time"
              type="datetime-local"
              {...register('endTime')}
            />
            {errors.endTime && (
              <p className="text-sm text-status-error">{errors.endTime.message}</p>
            )}
          </div>
          {serverError && (
            <p className="text-sm text-status-error">{serverError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : existingMeeting ? 'Save Changes' : 'Schedule Meeting'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
