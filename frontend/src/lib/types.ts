export type Role = "OWNER" | "MEMBER" | "VIEWER";
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface TicketTemplate {
  id: string;
  projectId: string;
  name: string;
  titleTemplate?: string | null;
  descriptionTemplate?: string | null;
  defaultPriority?: Priority | null;
  defaultLabels: { id: string; name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketTemplateInput {
  name: string;
  titleTemplate?: string;
  descriptionTemplate?: string;
  defaultPriority?: Priority;
  defaultLabelIds?: string[];
}

export type UpdateTicketTemplateInput = Partial<CreateTicketTemplateInput>;
export type LinkType = "BLOCKS" | "RELATES_TO" | "DUPLICATES";
export type DisplayLinkType =
  | "Blocks"
  | "Is blocked by"
  | "Relates to"
  | "Duplicates"
  | "Is duplicated by";

export interface User {
  id: string;
  googleId?: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  themePreference: string;
  createdAt: string;
  updatedAt: string;
  avatarStoragePath?: string | null;
}

export interface OAuthAccount {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  dueDate?: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithRole extends Project {
  role: Role;
  memberCount: number;
}

export interface CreateProjectInput {
  name: string;
  key: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  key?: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user?: User;
}

export interface MemberWithUser {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface StatusColumn {
  id: string;
  projectId: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface Ticket {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  statusColumnId: string;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
  reporterId: string;
  sortOrder: number;
  blockedBy: boolean;
  createdAt: string;
  updatedAt: string;
  assignee?: UserSummary | null;
  reporter?: UserSummary;
  statusColumn?: StatusColumn;
  labels?: LabelSummary[];
  _count?: { comments: number };
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface TicketLabel {
  ticketId: string;
  labelId: string;
  label?: Label;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: User;
}

export interface CommentWithAuthor {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface ActivityLog {
  id: string;
  ticketId: string;
  userId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user?: User;
}

export interface TicketLinkSummary {
  id: string;
  sourceTicketId: string;
  targetTicketId: string;
  type: LinkType;
  direction: 'outgoing' | 'incoming';
  createdAt: string;
  createdById: string;
}

export interface LinkWithTicket extends TicketLinkSummary {
  targetNumber: number;
  targetTitle: string;
  targetProjectId: string;
  targetProjectKey: string;
  targetPriority: Priority;
  targetStatusColumnName: string;
  displayType: DisplayLinkType;
}

export interface UserSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
}

export interface LabelSummary {
  id: string;
  name: string;
  color: string;
}

export interface TicketWithRelations extends Ticket {
  assignee: UserSummary | null;
  reporter: UserSummary;
  statusColumn: StatusColumn;
  labels: LabelSummary[];
}

export interface ActivityLogEntry {
  id: string;
  ticketId: string;
  userId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: UserSummary;
}

export interface TicketDetail extends TicketWithRelations {
  activityLog: ActivityLogEntry[];
}

export interface CreateTicketInput {
  title: string;
  description?: string | null;
  statusColumnId: string;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string | null;
  statusColumnId?: string;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export type DueDateFilter = 'overdue' | 'today' | 'this_week' | 'this_month';

export interface TicketFilters {
  page?: number;
  pageSize?: number;
  statusColumnId?: string;
  priority?: string;
  assigneeId?: string;
  labelId?: string;
  q?: string;
  sort?: 'sortOrder' | 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' | 'number' | 'assignee';
  order?: 'asc' | 'desc';
  dueDateFilter?: DueDateFilter;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface ReorderUpdate {
  ticketId: string;
  sortOrder: number;
  statusColumnId?: string;
}

export type BoardEventType =
  | "ticket.created"
  | "ticket.updated"
  | "ticket.deleted"
  | "ticket.reordered"
  | "ticket.overdue"
  | "column.created"
  | "column.updated"
  | "column.deleted"
  | "label.created"
  | "label.updated"
  | "label.deleted"
  | "label.assigned"
  | "label.removed"
  | "comment.created"
  | "comment.updated"
  | "comment.deleted"
  | "link.created"
  | "link.deleted";

export interface BoardEvent {
  type: BoardEventType;
  projectId: string;
  payload: unknown;
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type BulkOperation =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'addLabel'
  | 'removeLabel'
  | 'delete';

export interface BulkUpdatePayload {
  ticketNumbers: number[];
  operation: BulkOperation;
  value?: string;
}

export interface BulkUpdateResult {
  updated: number;
  tickets: TicketWithRelations[];
}

export interface BulkDeleteResult {
  deleted: number;
  ticketNumbers: number[];
}

export const UNASSIGNED_SENTINEL = 'UNASSIGNED';

export interface BoardFilters {
  assigneeIds: string[];   // empty = no filter; UNASSIGNED_SENTINEL = null assignee
  priorities: Priority[];  // empty = no filter
  labelIds: string[];      // empty = no filter
  search: string;          // empty string = no filter
  dueDateFilter?: DueDateFilter; // convenience enum: overdue / today / this_week / this_month
  dueDateFrom?: string;    // ISO date (YYYY-MM-DD); partial range allowed
  dueDateTo?: string;      // ISO date (YYYY-MM-DD); partial range allowed
}

// ─── Dashboard API Types ──────────────────────────────────────────────────────

export interface RawDashboardTicket {
  id: string;
  projectId: string;
  number: number;
  title: string;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
  updatedAt: string;
  statusColumn: { name: string };
  project: { key: string; name: string };
}

export interface RawDashboardActivity {
  id: string;
  action: string;
  userId: string;
  createdAt: string;
  user: { displayName: string };
  ticket: { id: string; number: number; projectId: string; project: { key: string } };
}

export interface RawDashboardProject {
  id: string;
  name: string;
  key: string;
  role: string;
  openCount: number;
  totalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawDashboardResponse {
  tickets: RawDashboardTicket[];
  activities: RawDashboardActivity[];
  projects: RawDashboardProject[];
}

// ─── Search API Types ──────────────────────────────────────────────────────

export interface SearchTicket {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  projectId: string;
  projectName: string;
  projectKey: string;
  statusColumnName: string;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  excerpt: string;
  updatedAt: string;
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

export interface DashboardFilters {
  ticketStatus?: string[];
  ticketPriority?: Priority[];
  ticketSort?: 'updatedAt' | 'createdAt' | 'priority';
  ticketSortDir?: 'ASC' | 'DESC';
  activityAction?: string[];
  projectRole?: Role[];
  projectSort?: 'updatedAt' | 'createdAt' | 'name';
  projectSortDir?: 'ASC' | 'DESC';
}
