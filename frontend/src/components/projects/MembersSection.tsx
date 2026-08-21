'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, AlertTriangle } from 'lucide-react';
import { useMembers } from '@/hooks/use-members';
import type { MemberWithUser, Role } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const LABEL_CLASS = 'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

interface MembersSectionProps {
  projectId: string;
  projectName?: string;
  currentUserId: string;
  currentUserRole: Role;
}

function roleBadgeVariant(role: Role): 'teal' | 'blue' | 'neutral' {
  if (role === 'OWNER') return 'teal';
  if (role === 'MEMBER') return 'blue';
  return 'neutral';
}

function formatJoinedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function MembersSection({
  projectId,
  projectName,
  currentUserId,
  currentUserRole,
}: MembersSectionProps) {
  const router = useRouter();
  const { members, loading, error, inviteMember, changeMemberRole, removeMember } =
    useMembers(projectId);

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'VIEWER'>('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Remove/leave dialog state
  const [memberToRemove, setMemberToRemove] = useState<MemberWithUser | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Role change error state
  const [roleError, setRoleError] = useState<string | null>(null);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await inviteMember(inviteEmail.trim(), inviteRole);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to invite member';
      setInviteError(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: MemberWithUser, newRole: Role) => {
    setRoleError(null);
    try {
      await changeMemberRole(member.id, newRole);
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemoveConfirm = async () => {
    if (!memberToRemove) return;
    setRemoveError(null);
    setRemoving(true);
    const isSelf = memberToRemove.userId === currentUserId;
    try {
      await removeMember(memberToRemove.id);
      setMemberToRemove(null);
      if (isSelf) {
        router.push('/projects');
      }
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-trakk-border p-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
          Members
        </h2>
        {currentUserRole === 'OWNER' && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => {
              setInviteError(null);
              setInviteEmail('');
              setInviteRole('MEMBER');
              setInviteOpen(true);
            }}
          >
            <UserPlus size={15} strokeWidth={1.75} />
            Invite
          </Button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              data-testid="member-skeleton"
              className="flex items-center gap-3 animate-pulse"
              aria-busy="true"
            >
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-col gap-1.5 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-status-error"
            />
            <p className="font-body text-[13px] text-trakk-text-strong">{error}</p>
          </div>
        </div>
      )}

      {/* Member list */}
      {!loading && !error && (
        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const canManage = currentUserRole === 'OWNER' && !isSelf;

            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[var(--trakk-teal-hover)] transition-colors duration-150"
              >
                {/* Avatar */}
                <Avatar>
                  {member.user.avatarUrl && (
                    <AvatarImage
                      src={member.user.avatarUrl}
                      alt={member.user.displayName}
                    />
                  )}
                  <AvatarFallback>
                    {member.user.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Identity */}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-body text-[14px] font-medium text-trakk-text truncate">
                    {member.user.displayName}
                  </span>
                  <span className="font-mono text-[12px] text-trakk-text-secondary truncate">
                    {member.user.email}
                  </span>
                </div>

                {/* Role badge or select */}
                {canManage ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                    className="font-mono text-[11px] tracking-[1px] uppercase rounded-badge border border-trakk-border bg-trakk-surface text-trakk-text-strong px-2 py-1 focus:outline-none focus:ring-2 focus:ring-trakk-teal focus:ring-offset-1 focus:ring-offset-trakk-bg cursor-pointer"
                    aria-label={`Change role for ${member.user.displayName}`}
                  >
                    <option value="OWNER">Owner</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <Badge variant={roleBadgeVariant(member.role)}>
                    {member.role}
                  </Badge>
                )}

                {/* Joined date */}
                <span className="hidden sm:block font-body text-[12px] text-trakk-text-secondary whitespace-nowrap">
                  {formatJoinedAt(member.joinedAt)}
                </span>

                {/* Actions */}
                {isSelf ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-trakk-text-secondary hover:text-status-error shrink-0"
                    onClick={() => {
                      setRemoveError(null);
                      setMemberToRemove(member);
                    }}
                  >
                    Leave
                  </Button>
                ) : canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-trakk-text-secondary hover:text-status-error shrink-0"
                    onClick={() => {
                      setRemoveError(null);
                      setMemberToRemove(member);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {roleError && (
        <p className="text-status-error text-sm mt-2">{roleError}</p>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Enter the email address of the person you want to invite
              {projectName ? ` to ${projectName}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="invite-email" className={LABEL_CLASS}>
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="invite-role" className={LABEL_CLASS}>
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'MEMBER' | 'VIEWER')}
                className="font-body text-[14px] rounded-lg border border-trakk-border bg-trakk-surface text-trakk-text px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-trakk-teal focus:ring-offset-2 focus:ring-offset-trakk-bg cursor-pointer"
              >
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>

            {inviteError && (
              <p className="font-body text-[13px] text-status-error">{inviteError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setInviteOpen(false)}
                disabled={inviting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={inviting}>
                {inviting ? 'Inviting…' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove / leave confirmation dialog */}
      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {memberToRemove?.userId === currentUserId
                ? 'Leave project?'
                : `Remove ${memberToRemove?.user.displayName ?? 'member'}?`}
            </DialogTitle>
            <DialogDescription>
              {memberToRemove?.userId === currentUserId
                ? 'You will lose access to this project immediately. This cannot be undone.'
                : `${memberToRemove?.user.displayName ?? 'This member'} will lose access to this project immediately.`}
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p className="font-body text-[13px] text-status-error px-1">{removeError}</p>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setMemberToRemove(null)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveConfirm}
              disabled={removing}
            >
              {removing
                ? 'Working…'
                : memberToRemove?.userId === currentUserId
                  ? 'Leave'
                  : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
