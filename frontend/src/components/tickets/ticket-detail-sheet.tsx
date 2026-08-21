'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  AlertTriangle,
  ChevronDown,
  History,
  MoreVertical,
  Plus,
  Trash2,
  X,
  User as UserIcon,
} from 'lucide-react';
import type { BoardEvent, MeetingWithOrganizer, Priority, Role, UpdateTicketInput } from '@/lib/types';
import { useTicketDetail } from '@/hooks/use-ticket-detail';
import { useColumns } from '@/hooks/use-columns';
import { useMembers } from '@/hooks/use-members';
import { useLabels } from '@/hooks/use-labels';
import { useComments } from '@/hooks/use-comments';
import { useMeetings } from '@/hooks/use-meetings';
import { useAuth } from '@/hooks/use-auth';
import { useProjectEvents } from '@/hooks/use-project-events';
import { CommentThread } from '@/components/tickets/CommentThread';
import { MeetingCard } from '@/components/meetings/MeetingCard';
import { ScheduleMeetingDialog } from '@/components/meetings/ScheduleMeetingDialog';
import { QuickMeetButton } from '@/components/meetings/QuickMeetButton';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover } from '@/components/ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn, formatRelativeTime } from '@/lib/utils';

const SECTION_LABEL =
  'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

function describeAction(action: string): string {
  switch (action) {
    case 'created':
      return 'created this ticket';
    case 'status_changed':
      return 'changed the status';
    case 'priority_changed':
      return 'changed the priority';
    case 'assigned':
      return 'assigned this ticket';
    case 'unassigned':
      return 'unassigned this ticket';
    case 'title_updated':
      return 'edited the title';
    case 'description_updated':
      return 'edited the description';
    case 'label_added':
      return 'added a label';
    case 'label_removed':
      return 'removed a label';
    default:
      return action.replace(/_/g, ' ');
  }
}

interface TicketDetailSheetProps {
  projectId: string;
  projectKey: string;
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: Role;
  projectIsArchived?: boolean;
}

export function TicketDetailSheet({
  projectId,
  projectKey,
  ticketNumber,
  open,
  onOpenChange,
  userRole = 'MEMBER',
  projectIsArchived = false,
}: TicketDetailSheetProps) {
  const {
    ticket,
    loading,
    error,
    updateTicket,
    addLabel,
    removeLabel,
    deleteTicketPermanently,
    refetch,
  } = useTicketDetail(projectId, ticketNumber, open);
  const { columns } = useColumns(projectId);
  const { members } = useMembers(projectId);
  const { labels } = useLabels(projectId);
  const { user } = useAuth();
  const {
    comments,
    loading: commentsLoading,
    createComment,
    updateComment,
    deleteComment,
    refetch: refetchComments,
  } = useComments(projectId, ticketNumber, open);

  const {
    meetings,
    loading: loadingMeetings,
    error: meetingsError,
    nextCursor,
    fetchNextPage,
    scheduleMeeting,
    updateMeeting,
    cancelMeeting,
    startInstantMeeting,
    setMeetings,
  } = useMeetings(projectId, ticketNumber, open);

  const canEdit = userRole !== 'VIEWER';

  const handleCommentEvent = React.useCallback(
    (event: BoardEvent) => {
      if (
        event.type === 'comment.created' ||
        event.type === 'comment.updated' ||
        event.type === 'comment.deleted'
      ) {
        void refetchComments();
      } else if (event.type === 'meeting.created') {
        const { meeting } = event.payload as { meeting: MeetingWithOrganizer };
        // Upsert: if the optimistic add already landed, replace it with the
        // authoritative SSE payload; if SSE arrived first, add it. This handles
        // both orderings of the optimistic add vs. SSE race.
        setMeetings((prev) =>
          prev.some((m) => m.id === meeting.id)
            ? prev.map((m) => (m.id === meeting.id ? meeting : m))
            : [...prev, meeting].sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
              ),
        );
      } else if (event.type === 'meeting.updated') {
        const { meeting } = event.payload as { meeting: MeetingWithOrganizer };
        setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? meeting : m)));
      } else if (event.type === 'meeting.deleted') {
        const { meetingId } = event.payload as { meetingId: string };
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      }
    },
    [refetchComments, setMeetings],
  );

  useProjectEvents(projectId, handleCommentEvent, open);

  const [editingDescription, setEditingDescription] = React.useState(false);
  const [descriptionDraft, setDescriptionDraft] = React.useState('');
  const [savingDescription, setSavingDescription] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [meetingsOpen, setMeetingsOpen] = React.useState(true);
  const [scheduleMeetingDialogOpen, setScheduleMeetingDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) setActivityOpen(false);
  }, [open, ticketNumber]);

  const openDeleteDialog = () => {
    setActionError(null);
    setDeleteDialogOpen(true);
  };

  const confirmPermanentDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteTicketPermanently();
      setDeleteDialogOpen(false);
      onOpenChange(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete ticket',
      );
    } finally {
      setDeleting(false);
    }
  };

  const runUpdate = async (input: UpdateTicketInput) => {
    setActionError(null);
    try {
      await updateTicket(input);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to update ticket',
      );
    }
  };

  const startEditingDescription = () => {
    setDescriptionDraft(ticket?.description ?? '');
    setEditingDescription(true);
  };

  const saveDescription = async () => {
    setSavingDescription(true);
    setActionError(null);
    try {
      await updateTicket({ description: descriptionDraft });
      setEditingDescription(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to save description',
      );
    } finally {
      setSavingDescription(false);
    }
  };

  const assignedLabelIds = new Set(ticket?.labels.map((l) => l.id) ?? []);
  const availableLabels = labels.filter((l) => !assignedLabelIds.has(l.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[690px] max-w-full p-7">
        {loading ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error || !ticket ? (
          <div className="flex flex-col gap-4">
            <SheetTitle className="sr-only">Ticket error</SheetTitle>
            <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-6 py-5">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-status-error"
                />
                <div className="flex flex-col gap-2">
                  <p className="font-body text-[15px] text-trakk-text-strong">
                    Couldn&apos;t load ticket — {error ?? 'not found'}
                  </p>
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => refetch()}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pr-10">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[13px] tracking-wider text-trakk-teal">
                  {projectKey}-{ticket.number}
                </span>
                <SheetTitle>{ticket.title}</SheetTitle>
                <SheetDescription className="sr-only">
                  Ticket {projectKey}-{ticket.number} details
                </SheetDescription>
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Ticket actions"
                      className="shrink-0"
                    >
                      <MoreVertical size={18} strokeWidth={2} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="gap-2 text-status-error focus:text-status-error"
                      onSelect={openDeleteDialog}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Permanent delete confirmation */}
            <Dialog
              open={deleteDialogOpen}
              onOpenChange={(next) => {
                if (deleting) return;
                setDeleteDialogOpen(next);
              }}
            >
              <DialogContent className="max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Delete ticket permanently?</DialogTitle>
                  <DialogDescription>
                    {projectKey}-{ticket.number} will be permanently deleted,
                    along with its comments, activity history and meetings. This
                    cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {actionError && (
                  <p className="font-body text-[13px] text-status-error">
                    {actionError}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    variant="secondary"
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmPermanentDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Meta row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Status</span>
                <Select
                  aria-label="Status"
                  value={ticket.statusColumnId}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({ statusColumnId: e.target.value })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Priority</span>
                <Select
                  aria-label="Priority"
                  value={ticket.priority}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({ priority: e.target.value as Priority })
                  }
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={SECTION_LABEL}>Assignee</span>
                <Select
                  aria-label="Assignee"
                  value={ticket.assigneeId ?? ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    runUpdate({
                      assigneeId: e.target.value === '' ? null : e.target.value,
                    })
                  }
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

            {/* Labels */}
            <div className="flex flex-col gap-2">
              <span className={SECTION_LABEL}>Labels</span>
              <div className="flex flex-wrap items-center gap-2">
                {ticket.labels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
                    style={{
                      color: label.color,
                      borderColor: `${label.color}40`,
                      backgroundColor: `${label.color}1A`,
                    }}
                  >
                    {label.name}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${label.name}`}
                        onClick={() => removeLabel(label.id)}
                        className="hover:opacity-70"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <Popover
                    trigger={
                      <button
                        type="button"
                        aria-label="Add label"
                        className="inline-flex items-center gap-1 rounded-badge border border-dashed border-trakk-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[1px] text-trakk-text-secondary hover:border-trakk-teal hover:text-trakk-teal"
                      >
                        <Plus size={12} />
                        Label
                      </button>
                    }
                  >
                    {availableLabels.length === 0 ? (
                      <p className="px-3 py-2 font-body text-[13px] text-trakk-text-secondary">
                        No more labels
                      </p>
                    ) : (
                      availableLabels.map((label) => (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => addLabel(label.id)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-body text-[13px] text-trakk-text hover:bg-[var(--trakk-teal-hover)]"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          {label.name}
                        </button>
                      ))
                    )}
                  </Popover>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={SECTION_LABEL}>Description</span>
                {canEdit && !editingDescription && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditingDescription}
                  >
                    Edit
                  </Button>
                )}
              </div>
              {editingDescription ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Describe the work. Markdown supported."
                    className="min-h-[140px]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingDescription(false)}
                      disabled={savingDescription}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={saveDescription}
                      disabled={savingDescription}
                    >
                      {savingDescription ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : ticket.description ? (
                <div className="prose-trakk font-body text-[15px] leading-relaxed text-trakk-text-strong [&_a]:text-trakk-teal [&_code]:font-mono [&_code]:text-[13px]">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                    {ticket.description}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="font-body text-[15px] text-trakk-text-secondary">
                  No description.
                </p>
              )}
            </div>

            {/* Meetings section */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setMeetingsOpen((prev) => !prev)}
                className="flex items-center justify-between w-full"
              >
                <span className={SECTION_LABEL}>Meetings</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-trakk-text-secondary transition-transform duration-200',
                    meetingsOpen ? 'rotate-0' : '-rotate-180',
                  )}
                />
              </button>
              {meetingsOpen && (
                <div className="flex flex-col gap-3">
                  {userRole !== 'VIEWER' && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setScheduleMeetingDialogOpen(true)}
                      >
                        Schedule Meeting
                      </Button>
                      <QuickMeetButton
                        projectRole={userRole}
                        onQuickMeet={startInstantMeeting}
                      />
                    </div>
                  )}
                  {loadingMeetings && (
                    <div className="flex flex-col gap-2">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-[88px] rounded-card bg-trakk-surface animate-pulse"
                        />
                      ))}
                    </div>
                  )}
                  {meetingsError && !loadingMeetings && (
                    <p className="font-body text-[13px] text-status-error">{meetingsError}</p>
                  )}
                  {!loadingMeetings && !meetingsError && (() => {
                    const now = new Date();
                    const scheduledMeetings = meetings.filter(
                      (m) => !m.title.startsWith('Quick Meet — ') && new Date(m.endTime) > now,
                    );
                    const quickMeets = meetings.filter((m) =>
                      m.title.startsWith('Quick Meet — '),
                    );
                    return (
                      <>
                        {scheduledMeetings.length === 0 && quickMeets.length === 0 && (
                          <p className="font-body text-[13px] text-trakk-text-secondary">
                            No meetings scheduled.
                          </p>
                        )}
                        {scheduledMeetings.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <p className="font-body text-[11px] uppercase tracking-wide text-trakk-text-secondary">
                              Upcoming
                            </p>
                            {scheduledMeetings.map((m) => (
                              <MeetingCard
                                key={m.id}
                                meeting={m}
                                currentUserId={user?.id ?? ''}
                                projectRole={userRole}
                                projectId={projectId}
                                ticketNumber={ticket.number}
                                onUpdate={updateMeeting}
                                onCancel={cancelMeeting}
                              />
                            ))}
                          </div>
                        )}
                        {quickMeets.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <p className="font-body text-[11px] uppercase tracking-wide text-trakk-text-secondary">
                              Quick Meets
                            </p>
                            {quickMeets.map((m) => (
                              <MeetingCard
                                key={m.id}
                                meeting={m}
                                currentUserId={user?.id ?? ''}
                                projectRole={userRole}
                                projectId={projectId}
                                ticketNumber={ticket.number}
                                onUpdate={updateMeeting}
                                onCancel={cancelMeeting}
                              />
                            ))}
                          </div>
                        )}
                        {nextCursor && (
                          <button
                            type="button"
                            className="font-body text-[13px] text-trakk-teal hover:underline text-left"
                            onClick={fetchNextPage}
                          >
                            Load more meetings
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <ScheduleMeetingDialog
              open={scheduleMeetingDialogOpen}
              onClose={() => setScheduleMeetingDialogOpen(false)}
              scheduleMeeting={scheduleMeeting}
              projectId={projectId}
              ticketNumber={ticket.number}
            />

            {/* Activity log */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setActivityOpen((prev) => !prev)}
                className="flex items-center justify-between w-full group"
              >
                <span className={SECTION_LABEL}>Activity</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-trakk-text-secondary transition-transform duration-200',
                    activityOpen ? 'rotate-0' : '-rotate-180',
                  )}
                />
              </button>
              {activityOpen && (
                <ul className="flex flex-col gap-3">
                  {ticket.activityLog.length === 0 && (
                    <li className="font-body text-[13px] text-trakk-text-secondary">
                      No activity yet.
                    </li>
                  )}
                  {ticket.activityLog.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-2.5">
                      <Avatar className="h-6 w-6">
                        {entry.user.avatarUrl && (
                          <AvatarImage
                            src={entry.user.avatarUrl}
                            alt={entry.user.displayName}
                          />
                        )}
                        <AvatarFallback>
                          {entry.user.displayName.charAt(0).toUpperCase() || (
                            <UserIcon size={12} />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <p className="font-body text-[13px] text-trakk-text-strong">
                          <span className="font-semibold">
                            {entry.user.displayName}
                          </span>{' '}
                          {describeAction(entry.action)}
                          {entry.oldValue && entry.newValue && (
                            <span className="text-trakk-text-secondary">
                              {' '}
                              ({entry.oldValue} → {entry.newValue})
                            </span>
                          )}
                        </p>
                        <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Comments */}
            <div className="flex flex-col gap-3">
              <span className={SECTION_LABEL}>Comments</span>
              {commentsLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <CommentThread
                  comments={comments}
                  currentUserId={user?.id ?? ''}
                  userRole={userRole ?? 'MEMBER'}
                  isArchived={projectIsArchived}
                  projectId={projectId}
                  onCreate={createComment}
                  onUpdate={updateComment}
                  onDelete={deleteComment}
                />
              )}
            </div>

            {actionError && (
              <p className="font-body text-[13px] text-status-error">
                {actionError}
              </p>
            )}

            {/* History footer marker (keeps History icon referenced) */}
            <span className="sr-only">
              <History size={12} />
            </span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
