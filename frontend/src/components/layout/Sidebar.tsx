'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Plus, Folder, FolderOpen } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { ProjectWithRole } from '@/lib/types';
import { cn } from '@/lib/utils';

function NavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-200',
        'after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:transition-opacity after:duration-200',
        'after:bg-[linear-gradient(90deg,var(--trakk-teal),var(--trakk-blue))]',
        active
          ? 'bg-[var(--trakk-teal-hover)] text-trakk-text after:opacity-100'
          : 'text-trakk-text-secondary after:opacity-0 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-text',
      )}
    >
      {icon}
      <span className={cn(
        'font-display text-[18px] transition-all duration-200',
        active
          ? 'bg-gradient-brand bg-clip-text [-webkit-text-fill-color:transparent]'
          : '',
      )}>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = React.useState<ProjectWithRole[]>([]);
  const [projectsOpen, setProjectsOpen] = React.useState(true);

  React.useEffect(() => {
    const stored = localStorage.getItem('trakk-sidebar-projects-open');
    if (stored !== null) setProjectsOpen(stored !== 'false');
  }, []);

  const fetchProjects = React.useCallback(async () => {
    try {
      const { projects: data } = await apiClient.get<{
        projects: ProjectWithRole[];
      }>('/api/v1/projects');
      setProjects(data);
    } catch {
      // sidebar is best-effort; keep last known list
    }
  }, []);

  React.useEffect(() => {
    fetchProjects();
    const handler = () => fetchProjects();
    window.addEventListener('project-list-changed', handler);
    return () => window.removeEventListener('project-list-changed', handler);
  }, [fetchProjects]);

  const handleNewProjectClick = () => {
    if (pathname === '/projects') {
      window.dispatchEvent(new Event('open-create-project-dialog'));
    } else {
      router.push('/projects?new=true');
    }
  };

  return (
    <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center px-5">
          <Link
            href="/"
            className="font-display font-black text-2xl tracking-tight bg-gradient-brand bg-clip-text text-transparent"
          >
            TRAKK
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          <NavItem
            href="/"
            label="Dashboard"
            active={pathname === '/' || pathname === '/dashboard'}
            icon={<LayoutDashboard size={20} strokeWidth={1.75} />}
          />

          <div className="mt-6 flex items-center gap-1">
            <div className="flex-1">
              <div
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-200',
                  'after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:transition-opacity after:duration-200',
                  'after:bg-[linear-gradient(90deg,var(--trakk-teal),var(--trakk-blue))]',
                  pathname === '/projects'
                    ? 'bg-[var(--trakk-teal-hover)] text-trakk-text after:opacity-100'
                    : 'text-trakk-text-secondary after:opacity-0 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-text',
                )}
              >
                <button
                  type="button"
                  aria-label={projectsOpen ? 'Collapse projects' : 'Expand projects'}
                  onClick={() => setProjectsOpen((o) => {
                    const next = !o;
                    localStorage.setItem('trakk-sidebar-projects-open', String(next));
                    return next;
                  })}
                  className="shrink-0 transition-colors duration-200"
                >
                  {projectsOpen
                    ? <FolderOpen size={20} strokeWidth={1.75} />
                    : <Folder size={20} strokeWidth={1.75} />}
                </button>
                <Link href="/projects" className={cn(
                  'flex-1 font-display text-[18px] transition-all duration-200',
                  pathname === '/projects'
                    ? 'bg-gradient-brand bg-clip-text [-webkit-text-fill-color:transparent]'
                    : '',
                )}>
                  Projects
                </Link>
              </div>
            </div>
            <button
              type="button"
              aria-label="New project"
              onClick={handleNewProjectClick}
              className="rounded-md p-1 text-trakk-text-secondary transition-colors duration-200 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-teal"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>

          {projectsOpen && (
            <div className="ml-4 flex flex-col gap-0.5 border-l border-trakk-border pl-2">
              {projects.length === 0 ? (
                <p className="px-3 py-2 font-body text-[13px] text-trakk-text-secondary">
                  No projects yet
                </p>
              ) : (
                projects.map((project) => {
                  const active = pathname?.startsWith(`/projects/${project.id}`);
                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className={cn(
                        'relative flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-200',
                        'after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:transition-opacity after:duration-200',
                        'after:bg-[linear-gradient(90deg,var(--trakk-teal),var(--trakk-blue))]',
                        active
                          ? 'bg-[var(--trakk-teal-hover)] text-trakk-text after:opacity-100'
                          : 'text-trakk-text-secondary after:opacity-0 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-text',
                      )}
                    >
                      <span
                        className={cn(
                          'shrink-0 h-2 w-2 rounded-full transition-colors duration-200',
                          active ? 'bg-trakk-teal' : 'bg-trakk-text-secondary',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-body text-[15px]">
                        {project.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
                        {project.key}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          )}

        </nav>
    </div>
  );
}
