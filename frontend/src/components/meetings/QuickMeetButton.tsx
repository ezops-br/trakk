'use client';

import React, { useState } from 'react';
import { Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MeetingWithOrganizer } from '@/lib/types';

interface QuickMeetButtonProps {
  projectRole: 'OWNER' | 'MEMBER' | 'VIEWER';
  onQuickMeet: () => Promise<MeetingWithOrganizer>;
}

export function QuickMeetButton({ projectRole, onQuickMeet }: QuickMeetButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (projectRole === 'VIEWER') return null;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const meeting = await onQuickMeet();
      window.open(meeting.meetLink, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start Quick Meet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" size="sm" onClick={handleClick} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Video className="h-4 w-4 mr-2" />
        )}
        Quick Meet
      </Button>
      {error && <p className="text-[12px] text-status-error">{error}</p>}
    </div>
  );
}
