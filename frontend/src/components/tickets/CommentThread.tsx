'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { User as UserIcon } from 'lucide-react';
import type { CommentWithAuthor, MemberWithUser, Role } from '@/lib/types';
import { useMembers } from '@/hooks/use-members';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatRelativeTime } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mention picker hook
// ---------------------------------------------------------------------------

interface MentionPickerState {
  query: string | null;       // null = closed; '' or typed string = open
  index: number;              // keyboard-highlighted index
  anchor: number;             // textarea cursor position where @ was typed
}

const MENTION_CLOSED: MentionPickerState = { query: null, index: 0, anchor: 0 };

interface UseMentionPickerReturn {
  mentionState: MentionPickerState;
  filteredMembers: MemberWithUser[];
  handleTextChange: (
    value: string,
    cursorPos: number,
    setValue: (v: string) => void,
    setMention: (s: MentionPickerState) => void,
  ) => void;
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    cursorPos: number,
    setValue: (v: string) => void,
    setMention: (s: MentionPickerState) => void,
    onSubmit?: () => void,
  ) => void;
  insertMention: (
    member: MemberWithUser,
    value: string,
    cursorPos: number,
    setValue: (v: string) => void,
    setMention: (s: MentionPickerState) => void,
    textareaRef: React.RefObject<HTMLTextAreaElement>,
  ) => void;
}

function useMentionPicker(
  members: MemberWithUser[],
  mentionState: MentionPickerState,
): UseMentionPickerReturn {
  const filteredMembers = React.useMemo(() => {
    if (mentionState.query === null) return [];
    const q = mentionState.query.toLowerCase();
    return members
      .filter((m) => m.user.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName))
      .slice(0, 5);
  }, [members, mentionState.query]);

  const handleTextChange = React.useCallback(
    (
      value: string,
      cursorPos: number,
      setValue: (v: string) => void,
      setMention: (s: MentionPickerState) => void,
    ) => {
      setValue(value);

      // Scan backwards from cursor to find an open @ mention
      const textBefore = value.slice(0, cursorPos);
      const atIndex = textBefore.lastIndexOf('@');

      if (atIndex === -1) {
        setMention(MENTION_CLOSED);
        return;
      }

      const fragment = textBefore.slice(atIndex + 1);

      // If the fragment after @ contains a space or newline, close the picker
      if (/[\s\n]/.test(fragment)) {
        setMention(MENTION_CLOSED);
        return;
      }

      // Verify the @ is at the start of the text or preceded by a space / newline
      const charBefore = atIndex > 0 ? value[atIndex - 1] : null;
      if (charBefore !== null && !/[\s\n]/.test(charBefore)) {
        setMention(MENTION_CLOSED);
        return;
      }

      setMention({ query: fragment, index: 0, anchor: atIndex });
    },
    [],
  );

  const handleKeyDown = React.useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      value: string,
      cursorPos: number,
      setValue: (v: string) => void,
      setMention: (s: MentionPickerState) => void,
      onSubmit?: () => void,
    ) => {
      if (mentionState.query === null || filteredMembers.length === 0) {
        // Picker is closed — allow normal Enter to submit
        if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMention({
          ...mentionState,
          index: (mentionState.index + 1) % filteredMembers.length,
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention({
          ...mentionState,
          index:
            (mentionState.index - 1 + filteredMembers.length) %
            filteredMembers.length,
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Will be handled by the caller via filteredMembers[mentionState.index]
        // We just signal via a separate path — use a synthetic insertMention call
        // The component handles this directly in onKeyDown
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMention(MENTION_CLOSED);
      }
    },
    [mentionState, filteredMembers],
  );

  const insertMention = React.useCallback(
    (
      member: MemberWithUser,
      value: string,
      cursorPos: number,
      setValue: (v: string) => void,
      setMention: (s: MentionPickerState) => void,
      textareaRef: React.RefObject<HTMLTextAreaElement>,
    ) => {
      const before = value.slice(0, mentionState.anchor);
      const after = value.slice(cursorPos);
      const inserted = `@${member.user.displayName} `;
      const newValue = before + inserted + after;
      setValue(newValue);
      setMention(MENTION_CLOSED);

      // Restore focus and set cursor position after the inserted mention
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const newCursor = mentionState.anchor + inserted.length;
        el.setSelectionRange(newCursor, newCursor);
      });
    },
    [mentionState.anchor],
  );

  return {
    mentionState,
    filteredMembers,
    handleTextChange,
    handleKeyDown,
    insertMention,
  };
}

// ---------------------------------------------------------------------------
// MentionDropdown component
// ---------------------------------------------------------------------------

interface MentionDropdownProps {
  members: MemberWithUser[];
  activeIndex: number;
  onSelect: (member: MemberWithUser) => void;
}

function MentionDropdown({ members, activeIndex, onSelect }: MentionDropdownProps) {
  if (members.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention suggestions"
      className="absolute left-0 z-50 mt-1 w-56 rounded-card border border-trakk-border bg-trakk-surface shadow-card overflow-hidden"
      style={{ maxHeight: '200px', overflowY: 'auto' }}
    >
      {members.map((member, i) => (
        <div
          key={member.userId}
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            // Prevent textarea blur before the click resolves
            e.preventDefault();
            onSelect(member);
          }}
          className={`flex items-center gap-2 cursor-pointer px-3 py-2 font-body text-sm text-trakk-text-strong transition-colors${
            i === activeIndex
              ? ' bg-trakk-surface-alt'
              : ' hover:bg-[var(--trakk-teal-hover)]'
          }`}
        >
          <Avatar className="h-6 w-6 shrink-0">
            {member.user.avatarUrl ? (
              <AvatarImage
                src={member.user.avatarUrl}
                alt={member.user.displayName}
              />
            ) : null}
            <AvatarFallback>
              {member.user.displayName.charAt(0).toUpperCase() || (
                <UserIcon size={10} />
              )}
            </AvatarFallback>
          </Avatar>
          <span>{member.user.displayName}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentThread
// ---------------------------------------------------------------------------

interface CommentThreadProps {
  comments: CommentWithAuthor[];
  currentUserId: string;
  userRole: Role;
  isArchived: boolean;
  projectId?: string;
  onCreate: (body: string) => Promise<void>;
  onUpdate: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}

export function CommentThread({
  comments,
  currentUserId,
  userRole,
  isArchived,
  projectId = '',
  onCreate,
  onUpdate,
  onDelete,
}: CommentThreadProps) {
  const { members } = useMembers(projectId);

  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [composeDraft, setComposeDraft] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [composeError, setComposeError] = React.useState<string | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Mention picker state — one instance per textarea
  const [composeMention, setComposeMention] = React.useState<MentionPickerState>(MENTION_CLOSED);
  const [editMention, setEditMention] = React.useState<MentionPickerState>(MENTION_CLOSED);

  const composeRef = React.useRef<HTMLTextAreaElement>(null);
  const editRef = React.useRef<HTMLTextAreaElement>(null);

  const composePicker = useMentionPicker(members, composeMention);
  const editPicker = useMentionPicker(members, editMention);

  const canInteract = userRole !== 'VIEWER' && !isArchived;

  const handleStartEdit = (comment: CommentWithAuthor) => {
    setEditingCommentId(comment.id);
    setEditDraft(comment.body);
    setEditError(null);
    setEditMention(MENTION_CLOSED);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditDraft('');
    setEditError(null);
    setEditMention(MENTION_CLOSED);
  };

  const handleSaveEdit = async (commentId: string) => {
    setEditError(null);
    try {
      await onUpdate(commentId, editDraft);
      setEditingCommentId(null);
      setEditDraft('');
      setEditMention(MENTION_CLOSED);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    setDeleteError(null);
    try {
      await onDelete(commentId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  const handleCreate = async () => {
    if (!composeDraft.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setComposeError(null);
    try {
      await onCreate(composeDraft.trim());
      setComposeDraft('');
      setComposeMention(MENTION_CLOSED);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Comment list */}
      {comments.length === 0 && !canInteract && (
        <p className="font-body text-[13px] text-trakk-text-secondary">
          No comments yet.
        </p>
      )}
      {comments.length > 0 && (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const isOwnComment = comment.authorId === currentUserId;
            const canEdit = isOwnComment && canInteract;
            const canDelete =
              (isOwnComment || userRole === 'OWNER') && canInteract;
            const isEditing = editingCommentId === comment.id;

            return (
              <li key={comment.id} className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  {comment.author.avatarUrl ? (
                    <AvatarImage
                      src={comment.author.avatarUrl}
                      alt={comment.author.displayName}
                    />
                  ) : null}
                  <AvatarFallback>
                    {comment.author.displayName.charAt(0).toUpperCase() || (
                      <UserIcon size={14} />
                    )}
                  </AvatarFallback>
                </Avatar>

                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-body font-semibold text-sm text-trakk-text-strong">
                      {comment.author.displayName}
                    </span>
                    <span className="font-mono text-xs text-trakk-text-secondary">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                    {canEdit && !isEditing && (
                      <button
                        type="button"
                        aria-label="Edit"
                        onClick={() => handleStartEdit(comment)}
                        className="ml-auto font-body text-[12px] text-trakk-text-secondary hover:text-trakk-teal transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && !isEditing && (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => handleDelete(comment.id)}
                        className={`font-body text-[12px] text-trakk-text-secondary hover:text-status-error transition-colors${canEdit ? '' : ' ml-auto'}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <Textarea
                          ref={editRef}
                          value={editDraft}
                          onChange={(e) => {
                            const el = e.target;
                            editPicker.handleTextChange(
                              el.value,
                              el.selectionStart ?? el.value.length,
                              setEditDraft,
                              setEditMention,
                            );
                          }}
                          onKeyDown={(e) => {
                            const el = e.currentTarget;
                            const cursorPos = el.selectionStart ?? el.value.length;

                            if (
                              editMention.query !== null &&
                              editPicker.filteredMembers.length > 0 &&
                              e.key === 'Enter'
                            ) {
                              e.preventDefault();
                              editPicker.insertMention(
                                editPicker.filteredMembers[editMention.index],
                                editDraft,
                                cursorPos,
                                setEditDraft,
                                setEditMention,
                                editRef,
                              );
                              return;
                            }

                            editPicker.handleKeyDown(
                              e,
                              editDraft,
                              cursorPos,
                              setEditDraft,
                              setEditMention,
                            );
                          }}
                          className="min-h-[80px]"
                          aria-label="Edit comment"
                          aria-autocomplete="list"
                          aria-expanded={editMention.query !== null && editPicker.filteredMembers.length > 0}
                        />
                        {editMention.query !== null && editPicker.filteredMembers.length > 0 && (
                          <MentionDropdown
                            members={editPicker.filteredMembers}
                            activeIndex={editMention.index}
                            onSelect={(member) => {
                              const el = editRef.current;
                              editPicker.insertMention(
                                member,
                                editDraft,
                                el?.selectionStart ?? editDraft.length,
                                setEditDraft,
                                setEditMention,
                                editRef,
                              );
                            }}
                          />
                        )}
                      </div>
                      {editError && (
                        <p className="font-body text-[12px] text-status-error">
                          {editError}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={!editDraft.trim()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="font-body text-[15px] leading-relaxed text-trakk-text-strong [&_a]:text-trakk-teal [&_code]:font-mono [&_code]:text-[13px]">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                        {comment.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {deleteError && (
        <p className="font-body text-[12px] text-status-error">
          {deleteError}
        </p>
      )}

      {/* Compose area — only for non-viewers on non-archived projects */}
      {canInteract && (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Textarea
              ref={composeRef}
              value={composeDraft}
              onChange={(e) => {
                const el = e.target;
                composePicker.handleTextChange(
                  el.value,
                  el.selectionStart ?? el.value.length,
                  setComposeDraft,
                  setComposeMention,
                );
              }}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                const cursorPos = el.selectionStart ?? el.value.length;

                if (
                  composeMention.query !== null &&
                  composePicker.filteredMembers.length > 0 &&
                  e.key === 'Enter'
                ) {
                  e.preventDefault();
                  composePicker.insertMention(
                    composePicker.filteredMembers[composeMention.index],
                    composeDraft,
                    cursorPos,
                    setComposeDraft,
                    setComposeMention,
                    composeRef,
                  );
                  return;
                }

                composePicker.handleKeyDown(
                  e,
                  composeDraft,
                  cursorPos,
                  setComposeDraft,
                  setComposeMention,
                  handleCreate,
                );
              }}
              placeholder="Add a comment. Markdown supported."
              className="min-h-[80px]"
              aria-autocomplete="list"
              aria-expanded={composeMention.query !== null && composePicker.filteredMembers.length > 0}
            />
            {composeMention.query !== null && composePicker.filteredMembers.length > 0 && (
              <MentionDropdown
                members={composePicker.filteredMembers}
                activeIndex={composeMention.index}
                onSelect={(member) => {
                  const el = composeRef.current;
                  composePicker.insertMention(
                    member,
                    composeDraft,
                    el?.selectionStart ?? composeDraft.length,
                    setComposeDraft,
                    setComposeMention,
                    composeRef,
                  );
                }}
              />
            )}
          </div>
          {composeError && (
            <p className="font-body text-[12px] text-status-error">
              {composeError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={!composeDraft.trim() || isSubmitting}
            >
              {isSubmitting ? 'Posting…' : 'Comment'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
