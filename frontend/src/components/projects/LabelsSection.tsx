'use client';

import React from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useLabels } from '@/hooks/use-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const LABEL_CLASS = 'font-mono text-[10px] tracking-[3px] uppercase text-trakk-teal';

const PRESET_COLORS = [
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f97316', '#eab308', '#22c55e', '#ef4444',
  '#06b6d4', '#64748b', '#a855f7', '#84cc16',
];

interface LabelsSectionProps {
  projectId: string;
  isOwner: boolean;
}

export function LabelsSection({ projectId, isOwner }: LabelsSectionProps) {
  const { labels, loading, error, createLabel, updateLabel, deleteLabel } =
    useLabels(projectId);

  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('#14b8a6');
  const [saving, setSaving] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editColor, setEditColor] = React.useState('');
  const [editSaving, setEditSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setCreateError(null);
    try {
      await createLabel(newName.trim(), newColor);
      setNewName('');
      setNewColor('#14b8a6');
      setCreating(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create label');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (label: { id: string; name: string; color: string }) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setEditError(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateLabel(editingId, { name: editName.trim(), color: editColor });
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update label');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (labelId: string) => {
    setDeletingId(labelId);
    try {
      await deleteLabel(labelId);
    } catch {
      // Error surfaced inline would require more state; silently ignore for now.
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-card bg-trakk-surface border border-trakk-border p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
          Labels
        </h2>
        {isOwner && !creating && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setCreating(true)}
          >
            <Plus size={14} strokeWidth={2} />
            New label
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ) : error ? (
        <p className="font-body text-[13px] text-status-error">{error}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {labels.length === 0 && !creating && (
            <p className="font-body text-[13px] text-trakk-text-secondary">
              No labels yet.{isOwner ? ' Create one to get started.' : ''}
            </p>
          )}

          {labels.map((label) =>
            editingId === label.id ? (
              <form
                key={label.id}
                onSubmit={handleEdit}
                className="flex flex-col gap-2 rounded-md border border-trakk-border p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-trakk-border bg-transparent"
                    title="Pick color"
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Label name"
                    className="flex-1"
                    autoFocus
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={editSaving}>
                    <Check size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingId(null)}
                    disabled={editSaving}
                  >
                    <X size={14} />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: editColor === c ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                {editError && (
                  <p className="font-body text-[13px] text-status-error">{editError}</p>
                )}
              </form>
            ) : (
              <div
                key={label.id}
                className="flex items-center justify-between rounded-md border border-trakk-border px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span
                    className="inline-flex items-center rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
                    style={{
                      color: label.color,
                      borderColor: `${label.color}40`,
                      backgroundColor: `${label.color}1A`,
                    }}
                  >
                    {label.name}
                  </span>
                </div>
                {isOwner && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(label)}
                      className="rounded p-1 text-trakk-text-secondary hover:text-trakk-text hover:bg-trakk-bg"
                      aria-label={`Edit ${label.name}`}
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(label.id)}
                      disabled={deletingId === label.id}
                      className="rounded p-1 text-trakk-text-secondary hover:text-status-error hover:bg-trakk-bg disabled:opacity-40"
                      aria-label={`Delete ${label.name}`}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}

          {creating && (
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-2 rounded-md border border-trakk-border p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-trakk-border bg-transparent"
                  title="Pick color"
                />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Label name"
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" variant="primary" size="sm" disabled={saving || !newName.trim()}>
                  <Check size={14} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setCreating(false); setNewName(''); setCreateError(null); }}
                  disabled={saving}
                >
                  <X size={14} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: newColor === c ? 'white' : 'transparent',
                    }}
                  />
                ))}
              </div>
              {createError && (
                <p className="font-body text-[13px] text-status-error">{createError}</p>
              )}
            </form>
          )}
        </div>
      )}

      {!isOwner && labels.length > 0 && (
        <p className="font-body text-[11px] text-trakk-text-secondary">
          Only project owners can create or edit labels.
        </p>
      )}

      <span className="sr-only" aria-hidden>{LABEL_CLASS}</span>
    </div>
  );
}
