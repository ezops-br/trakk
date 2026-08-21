import { prisma } from '../lib/prisma';

export interface SearchTicket {
  id: string;
  number: number;
  title: string;
  priority: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  statusColumnName: string;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  excerpt: string;
  updatedAt: Date;
}

export interface SearchProject {
  id: string;
  name: string;
  key: string;
  memberCount: number;
}

export interface SearchResults {
  tickets: SearchTicket[];
  projects: SearchProject[];
}

export interface SearchOptions {
  projectId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const PROJECT_RESULT_LIMIT = 5;
const TICKET_ID_PATTERN = /^([A-Z]+)-(\d+)$/;

// Raw row shapes returned by $queryRaw. Column aliases are a mix of camelCase
// (the FTS query aliases them explicitly) and snake_case (Postgres default).
// We accept both to keep the mapping resilient.
interface RawTicketRow {
  id: string;
  number: number;
  title: string;
  priority: string;
  projectId?: string;
  project_id?: string;
  projectName?: string;
  project_name?: string;
  projectKey?: string;
  project_key?: string;
  statusName?: string;
  status_column_name?: string;
  assigneeName?: string | null;
  assignee_name?: string | null;
  assigneeAvatar?: string | null;
  assignee_avatar?: string | null;
  excerpt?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  updated_at?: Date;
}

interface RawProjectRow {
  id: string;
  name: string;
  key: string;
  memberCount?: bigint | number;
  member_count?: bigint | number;
}

function mapTicketRow(row: RawTicketRow): SearchTicket {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    priority: row.priority,
    projectId: row.projectId ?? row.project_id ?? '',
    projectName: row.projectName ?? row.project_name ?? '',
    projectKey: row.projectKey ?? row.project_key ?? '',
    statusColumnName: row.statusName ?? row.status_column_name ?? '',
    assigneeName: row.assigneeName ?? row.assignee_name ?? null,
    assigneeAvatar: row.assigneeAvatar ?? row.assignee_avatar ?? null,
    excerpt: row.excerpt ?? '',
    updatedAt: (row.updatedAt ?? row.updated_at ?? row.createdAt) as Date,
  };
}

function mapProjectRow(row: RawProjectRow): SearchProject {
  const count = row.memberCount ?? row.member_count ?? 0;
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    memberCount: Number(count),
  };
}

export async function searchTickets(
  q: string,
  scopedProjectIds: string[],
  limit: number,
): Promise<SearchTicket[]> {
  const trimmed = q.trim();

  // Exact ticket ID lookup (PROJECT_KEY-N), prepended ahead of FTS results.
  let exactTicket: SearchTicket | null = null;
  const match = TICKET_ID_PATTERN.exec(trimmed.toUpperCase());
  if (match) {
    const projectKey = match[1];
    const ticketNumber = parseInt(match[2], 10);
    const exactRows = await prisma.$queryRaw<RawTicketRow[]>`
      SELECT t.id, t.number, t.title, t.priority, t.updated_at,
             p.id AS "projectId", p.name AS "projectName", p.key AS "projectKey",
             sc.name AS "statusName",
             u.display_name AS "assigneeName", u.avatar_url AS "assigneeAvatar",
             t.title AS excerpt
      FROM tickets t
      JOIN projects p ON t.project_id = p.id
      JOIN status_columns sc ON t.status_column_id = sc.id
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.project_id = ANY(${scopedProjectIds})
        AND p.archived_at IS NULL
        AND t.archived_at IS NULL
        AND p.key = ${projectKey}
        AND t.number = ${ticketNumber}
      LIMIT 1
    `;
    if (exactRows.length > 0) {
      exactTicket = mapTicketRow(exactRows[0]);
    }
  }

  // Full-text search across title + description.
  const ftsRows = await prisma.$queryRaw<RawTicketRow[]>`
    SELECT t.id, t.number, t.title, t.priority, t.updated_at,
           p.id AS "projectId", p.name AS "projectName", p.key AS "projectKey",
           sc.name AS "statusName",
           u.display_name AS "assigneeName", u.avatar_url AS "assigneeAvatar",
           ts_headline('english', t.title || ' ' || COALESCE(t.description, ''),
             plainto_tsquery('english', ${q}), 'MaxWords=10,MinWords=5') AS excerpt
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    JOIN status_columns sc ON t.status_column_id = sc.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.project_id = ANY(${scopedProjectIds})
      AND p.archived_at IS NULL
      AND t.archived_at IS NULL
      AND to_tsvector('english', t.title || ' ' || COALESCE(t.description, ''))
          @@ plainto_tsquery('english', ${q})
    ORDER BY ts_rank(
      to_tsvector('english', t.title || ' ' || COALESCE(t.description, '')),
      plainto_tsquery('english', ${q})
    ) DESC
    LIMIT ${limit}
  `;

  const ftsTickets = ftsRows.map(mapTicketRow);

  if (!exactTicket) {
    return ftsTickets.slice(0, limit);
  }

  // Prepend the exact match, dedup it from the FTS list, then cap to limit.
  const exactId = exactTicket.id;
  const deduped = ftsTickets.filter((t) => t.id !== exactId);
  return [exactTicket, ...deduped].slice(0, limit);
}

export async function searchProjects(
  q: string,
  scopedProjectIds: string[],
): Promise<SearchProject[]> {
  const like = `%${q}%`;
  const rows = await prisma.$queryRaw<RawProjectRow[]>`
    SELECT p.id, p.name, p.key, COUNT(pm.user_id) AS "memberCount"
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE p.id = ANY(${scopedProjectIds})
      AND p.archived_at IS NULL
      AND (p.name ILIKE ${like} OR p.key ILIKE ${like})
    GROUP BY p.id, p.name, p.key
    ORDER BY p.name ASC
    LIMIT ${PROJECT_RESULT_LIMIT}
  `;
  return rows.map(mapProjectRow);
}

export async function search(
  userId: string,
  q: string,
  options: SearchOptions = {},
): Promise<SearchResults> {
  const projectId = options.projectId;
  const limit = options.limit ?? DEFAULT_LIMIT;

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });

  const allowedProjectIds: string[] = memberships.map((m) => m.projectId);
  if (allowedProjectIds.length === 0) {
    return { tickets: [], projects: [] };
  }

  let scopedProjectIds: string[];
  if (projectId) {
    if (!allowedProjectIds.includes(projectId)) {
      return { tickets: [], projects: [] };
    }
    scopedProjectIds = [projectId];
  } else {
    scopedProjectIds = allowedProjectIds;
  }

  // Run sequentially so the $queryRaw call order is deterministic:
  // (1) exact ticket lookup, (2) FTS, (3) project ILIKE. Unit tests rely on
  // this ordering when stubbing $queryRaw with mockResolvedValueOnce.
  const tickets = await searchTickets(q, scopedProjectIds, limit);
  const projects = await searchProjects(q, scopedProjectIds);

  return { tickets, projects };
}
