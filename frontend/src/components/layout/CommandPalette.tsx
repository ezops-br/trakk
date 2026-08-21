'use client';

import React, { useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  MoreHorizontal,
  Loader2,
  Plus,
  FolderPlus,
  LayoutDashboard,
  Settings,
  LogOut,
  FolderKanban,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { useCommandPalette } from '@/components/layout/CommandPaletteProvider';
import { useSearch } from '@/hooks/use-search';
import { apiClient } from '@/lib/api-client';
import type { Priority } from '@/lib/types';

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  URGENT: <AlertTriangle className="text-priority-urgent" />,
  HIGH: <ArrowUp className="text-priority-high" />,
  MEDIUM: <Minus className="text-priority-medium" />,
  LOW: <ArrowDown className="text-priority-low" />,
  NONE: <MoreHorizontal className="text-priority-none" />,
};

const ITEM_ACTIVE =
  "relative pl-4 data-[selected=true]:bg-[var(--trakk-teal-hover)] " +
  "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] " +
  "before:rounded-full before:bg-trakk-teal before:opacity-0 " +
  "data-[selected=true]:before:opacity-100";

function navigate(path: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(path);
  }
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { query, setQuery, clear, results, loading, error } = useSearch();

  // Reset search state whenever the palette closes.
  useEffect(() => {
    if (!isOpen) clear();
  }, [isOpen, clear]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // best-effort — redirect regardless
    }
    navigate('/login');
  }, []);

  const trimmed = query.trim();
  const hasTickets = !!results && results.tickets.length > 0;
  const hasProjects = !!results && results.projects.length > 0;
  const hasResults = hasTickets || hasProjects;
  const showNoResults =
    trimmed.length >= 2 && !loading && !error && results !== null && !hasResults;

  function runAndClose(fn: () => void) {
    fn();
    close();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="overflow-hidden p-0 max-w-[600px]">
        <Command shouldFilter={false} loop className="bg-trakk-surface rounded-card">
          <div className="relative">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search tickets, projects, or run a command..."
            />
            {loading && (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 animate-spin text-trakk-text-secondary"
                aria-label="Searching"
              />
            )}
          </div>

          <CommandList>
            {/* TICKETS — only when search has ticket results */}
            {hasTickets && (
              <CommandGroup heading="Tickets">
                {results!.tickets.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`ticket-${t.id}`}
                    className={ITEM_ACTIVE}
                    onSelect={() =>
                      runAndClose(() =>
                        navigate(
                          `/projects/${t.projectId}?ticket=${t.number}`,
                        ),
                      )
                    }
                  >
                    <span className="shrink-0">{PRIORITY_ICON[t.priority]}</span>
                    <span className="font-mono text-xs text-trakk-text-secondary shrink-0">
                      {t.projectKey}-{t.number}
                    </span>
                    <span className="truncate text-trakk-text">{t.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-trakk-text-secondary">
                      {t.statusColumnName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* PROJECTS — only when search has project results */}
            {hasProjects && (
              <CommandGroup heading="Projects">
                {results!.projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`project-${p.id}`}
                    className={ITEM_ACTIVE}
                    onSelect={() =>
                      runAndClose(() => navigate(`/projects/${p.id}`))
                    }
                  >
                    <FolderKanban className="shrink-0 text-trakk-teal" />
                    <span className="font-mono text-xs text-trakk-text-secondary shrink-0">
                      {p.key}
                    </span>
                    <span className="truncate text-trakk-text">{p.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-trakk-text-secondary">
                      {p.memberCount}{' '}
                      {p.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* No results message */}
            {showNoResults && (
              <div className="py-6 text-center text-sm text-trakk-text-secondary">
                No results found.
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="py-6 text-center text-sm text-status-error">
                {error}
              </div>
            )}

            {/* ACTIONS — always rendered */}
            <CommandGroup heading="Actions">
              <CommandItem
                value="action-create-ticket"
                className={ITEM_ACTIVE}
                onSelect={() =>
                  runAndClose(() => navigate('/projects?createTicket=true'))
                }
              >
                <Plus className="shrink-0 text-trakk-text-secondary" />
                <span>Create Ticket</span>
              </CommandItem>

              <CommandItem
                value="action-new-project"
                className={ITEM_ACTIVE}
                onSelect={() => {
                  close();
                  window.dispatchEvent(new Event('open-create-project-dialog'));
                }}
              >
                <FolderPlus className="shrink-0 text-trakk-text-secondary" />
                <span>New Project</span>
              </CommandItem>

              <CommandItem
                value="action-dashboard"
                className={ITEM_ACTIVE}
                onSelect={() => runAndClose(() => navigate('/dashboard'))}
              >
                <LayoutDashboard className="shrink-0 text-trakk-text-secondary" />
                <span>Go to Dashboard</span>
              </CommandItem>

              <CommandItem
                value="action-profile"
                className={ITEM_ACTIVE}
                onSelect={() => runAndClose(() => navigate('/profile'))}
              >
                <Settings className="shrink-0 text-trakk-text-secondary" />
                <span>Profile &amp; Settings</span>
              </CommandItem>

              <CommandItem
                value="action-signout"
                className={ITEM_ACTIVE}
                onSelect={() => {
                  void logout();
                }}
              >
                <LogOut className="shrink-0 text-trakk-text-secondary" />
                <span>Sign out</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
