'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface DeletionImpact {
  comments: number;
  linkedAsSource: number;
  linkedAsTarget: number;
  activityLogEntries: number;
  ticketLabels: number;
}

interface DeleteTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  ticketNumber: string | number;
  onDeleted: () => void;
}

interface ImpactState {
  loading: boolean;
  impact: DeletionImpact | null;
  error: string | null;
}

export function DeleteTicketDialog({
  open,
  onOpenChange,
  projectId,
  ticketNumber,
  onDeleted,
}: DeleteTicketDialogProps) {
  const [state, setState] = useState<ImpactState>({
    loading: false,
    impact: null,
    error: null,
  });
  const [deleting, setDeleting] = useState(false);

  const fetchImpact = useCallback(async () => {
    setState({ loading: true, impact: null, error: null });
    try {
      const data = await apiClient.get<DeletionImpact>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/deletion-impact`,
      );
      setState({ loading: false, impact: data, error: null });
    } catch (err) {
      setState({
        loading: false,
        impact: null,
        error: err instanceof Error ? err.message : 'Failed to load impact',
      });
    }
  }, [projectId, ticketNumber]);

  useEffect(() => {
    if (open) {
      fetchImpact();
    }
  }, [open, fetchImpact]);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await apiClient.del<void>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}`,
      );
      toast.success('Ticket deleted');
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete ticket',
      );
    } finally {
      setDeleting(false);
    }
  };

  const renderImpactList = () => {
    if (state.loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading impact summary…
        </div>
      );
    }

    if (state.error) {
      return (
        <p className="text-sm text-destructive py-2" role="alert">
          {state.error}
        </p>
      );
    }

    const impact = state.impact;
    if (!impact) return null;

    const hasAny =
      impact.comments > 0 ||
      impact.linkedAsSource > 0 ||
      impact.linkedAsTarget > 0 ||
      impact.activityLogEntries > 0 ||
      impact.ticketLabels > 0;

    if (!hasAny) {
      return (
        <p className="text-sm text-muted-foreground py-2">
          This ticket will be permanently removed.
        </p>
      );
    }

    const items: { label: string; count: number }[] = [];
    if (impact.comments > 0) {
      items.push({
        label: `${impact.comments} comment${impact.comments === 1 ? '' : 's'}`,
        count: impact.comments,
      });
    }
    const linkedTotal = impact.linkedAsSource + impact.linkedAsTarget;
    if (linkedTotal > 0) {
      items.push({
        label: `${linkedTotal} linked from/to`,
        count: linkedTotal,
      });
    }
    if (impact.activityLogEntries > 0) {
      items.push({
        label: `${impact.activityLogEntries} activity log entr${impact.activityLogEntries === 1 ? 'y' : 'ies'}`,
        count: impact.activityLogEntries,
      });
    }

    return (
      <div className="space-y-3">
        <ul
          className="text-sm space-y-1 list-disc pl-5"
          data-testid="deletion-impact-list"
        >
          {items.map((item) => (
            <li key={item.label}>{item.label}</li>
          ))}
        </ul>
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          role="alert"
        >
          <AlertTriangle
            className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm text-destructive">
            These will be permanently removed.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete ticket</DialogTitle>
          <DialogDescription>
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">{renderImpactList()}</div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting || state.loading}
            data-testid="delete-ticket-confirm"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}