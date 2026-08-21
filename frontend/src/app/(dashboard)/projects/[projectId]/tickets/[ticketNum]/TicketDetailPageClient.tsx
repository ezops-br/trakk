'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TicketDetailSheet } from '@/components/tickets/ticket-detail-sheet';

interface Props {
  projectId: string;
  projectKey: string;
  ticketNumber: number;
}

export default function TicketDetailPageClient({ projectId, projectKey, ticketNumber }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) router.push(`/projects/${projectId}`);
  }

  return (
    <div className="h-full">
      <div className="p-4">
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[1.5px] uppercase text-trakk-text-secondary hover:text-trakk-teal transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Back to board
        </button>
      </div>
      <TicketDetailSheet
        projectId={projectId}
        projectKey={projectKey}
        ticketNumber={ticketNumber}
        open={open}
        onOpenChange={handleOpenChange}
      />
    </div>
  );
}
