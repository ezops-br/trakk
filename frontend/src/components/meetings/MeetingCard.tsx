'use client';

import React, { useState } from 'react';
import { Video, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MeetingWithOrganizer, UpdateMeetingInput, ScheduleMeetingInput } from '@/lib/types';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';

interface MeetingCardProps {
  meeting: MeetingWithOrganizer;
  currentUserId: string;
  projectRole: 'OWNER' | 'MEMBER' | 'VIEWER';
  projectId: string;
  ticketNumber: number;
  onUpdate: (meetingId: string, input: UpdateMeetingInput) => Promise<{ meeting: MeetingWithOrganizer; warning?: string }>;
  onCancel: (meetingId: string) => Promise<void>;
}

export function MeetingCard({
  meeting,
  currentUserId,
  projectRole,
  projectId,
  ticketNumber,
  onUpdate,
  onCancel,
}: MeetingCardProps) {
  const canMutate = projectRole === 'OWNER' || meeting.organizerId === currentUserId;
  const [warning, setWarning] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const handleCancel = async () => {
    if (!confirm(`Cancel "${meeting.title}"?`)) return;
    setCancelling(true);
    try {
      await onCancel(meeting.id);
    } catch {
      setCancelling(false);
    }
  };

  const handleReschedule = async (input: ScheduleMeetingInput) => {
    const result = await onUpdate(meeting.id, {
      title: input.title,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    if (result.warning) {
      setWarning(result.warning);
    }
  };

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-card border border-trakk-border bg-trakk-surface p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-[14px] font-medium text-trakk-text leading-snug">
          {meeting.title}
        </span>
        {canMutate && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRescheduleOpen(true)}
            >
              Reschedule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-status-error hover:text-status-error"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 font-mono text-[12px] text-trakk-text-secondary">
        <Clock className="h-3 w-3" />
        <span>
          {formatDateTime(meeting.startTime)} &ndash; {formatDateTime(meeting.endTime)}
        </span>
      </div>
      <div className="flex items-center gap-1 font-body text-[12px] text-trakk-text-secondary">
        <User className="h-3 w-3" />
        <span>{meeting.organizer.displayName}</span>
      </div>
      <a
        href={meeting.meetLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-trakk-teal font-body text-[13px] hover:underline w-fit"
      >
        <Video className="h-4 w-4" />
        Join Meet
      </a>
      {warning && (
        <p className="text-[12px] text-status-warning">{warning}</p>
      )}
      {canMutate && (
        <ScheduleMeetingDialog
          open={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          scheduleMeeting={handleReschedule}
          projectId={projectId}
          ticketNumber={ticketNumber}
          existingMeeting={{
            title: meeting.title,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
          }}
        />
      )}
    </div>
  );
}
