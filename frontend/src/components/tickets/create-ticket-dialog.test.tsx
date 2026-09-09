import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { ApiError, apiClient } from '@/lib/api-client';
import type {
  TicketTemplate,
  TicketWithRelations,
  StatusColumn,
  LabelSummary,
  MemberWithUser,
} from '@/lib/types';

vi.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    details: string | undefined;
    constructor(status: number, message: string, details?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  return {
    ApiError: MockApiError,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

// Mock data hooks so we can drive their return values per-test.
const useColumnsMock = vi.fn();
const useMembersMock = vi.fn();
const useTemplatesMock = vi.fn();
const useLabelsMock = vi.fn();
const useAddTicketLabelMock = vi.fn();

vi.mock('@/hooks/use-columns', () => ({
  useColumns: (projectId: string) => useColumnsMock(projectId),
}));
vi.mock('@/hooks/use-members', () => ({
  useMembers: (projectId: string) => useMembersMock(projectId),
}));
vi.mock('@/hooks/use-templates', () => ({
  useTemplates: (projectId: string) => useTemplatesMock(projectId),
}));
vi.mock('@/hooks/use-labels', () => ({
  useLabels: (projectId: string) => useLabelsMock(projectId),
}));
vi.mock('@/hooks/use-add-ticket-label', () => ({
  useAddTicketLabel: (projectId: string) => useAddTicketLabelMock(projectId),
}));

// Mock the attachment uploader's lib client so we can spy on the upload calls
// and force success / failure without hitting the network.
const uploadAttachmentMock = vi.fn();
vi.mock('@/lib/attachments', () => ({
  uploadAttachment: (...args: unknown[]) => uploadAttachmentMock(...args),
}));

// Stub lucide icons to keep the rendered DOM small and assertions stable.
vi.mock('lucide-react', async () => {
  const actual =
    await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return {
    ...actual,
    LayoutTemplate: (props: { className?: string }) =>
      React.createElement('span', {
        'data-testid': 'icon-layout-template',
        className: props.className,
      }),
  };
});

// Import after mocks so the component picks them up.
import { CreateTicketDialog } from './create-ticket-dialog';

const PROJECT_ID = 'proj-1';

const SAMPLE_COLUMNS: StatusColumn[] = [
  {
    id: 'col-1',
    projectId: PROJECT_ID,
    name: 'Backlog',
    position: 0,
    createdAt: '2026-07-27T10:00:00Z',
    updatedAt: '2026-07-27T10:00:00Z',
  },
  {
    id: 'col-2',
    projectId: PROJECT_ID,
    name: 'In Progress',
    position: 1,
    createdAt: '2026-07-27T10:00:00Z',
    updatedAt: '2026-07-27T10:00:00Z',
  },
];

const SAMPLE_MEMBERS: MemberWithUser[] = [];

const SAMPLE_LABELS: LabelSummary[] = [
  { id: 'lbl-1', name: 'Bug', color: '#ff0000' },
  { id: 'lbl-2', name: 'Feature label', color: '#00aa00' },
];

const SAMPLE_TEMPLATES: TicketTemplate[] = [
  {
    id: 'tpl-1',
    projectId: PROJECT_ID,
    name: 'Bug fix',
    titleTemplate: '[Bug] {{summary}}',
    descriptionTemplate: 'Steps to reproduce…',
    defaultPriority: 'HIGH',
    defaultLabels: [{ id: 'lbl-1', name: 'Bug', color: '#ff0000' }],
    createdAt: '2026-07-27T10:00:00Z',
    updatedAt: '2026-07-27T10:00:00Z',
  },
  {
    id: 'tpl-2',
    projectId: PROJECT_ID,
    name: 'Feature work',
    titleTemplate: null,
    descriptionTemplate: null,
    defaultPriority: 'MEDIUM',
    defaultLabels: [],
    createdAt: '2026-07-27T11:00:00Z',
    updatedAt: '2026-07-27T11:00:00Z',
  },
];

const SAMPLE_CREATED_TICKET: TicketWithRelations = {
  id: 'tkt-99',
  number: 99,
  projectId: PROJECT_ID,
  statusColumnId: 'col-1',
  title: 'New ticket',
  description: null,
  priority: 'MEDIUM',
  assigneeId: null,
  dueDate: null,
  createdById: 'user-1',
  createdAt: '2026-07-27T10:00:00Z',
  updatedAt: '2026-07-27T10:00:00Z',
  statusColumn: {
    id: 'col-1',
    projectId: PROJECT_ID,
    name: 'Backlog',
    position: 0,
    createdAt: '2026-07-27T10:00:00Z',
    updatedAt: '2026-07-27T10:00:00Z',
  },
  assignee: null,
  labels: [],
  ticketComments: [],
};

function setupHooks(opts: {
  templates?: TicketTemplate[];
  labels?: LabelSummary[];
} = {}) {
  useColumnsMock.mockReturnValue({
    columns: SAMPLE_COLUMNS,
    loading: false,
    error: null,
    createColumn: vi.fn(),
    updateColumn: vi.fn(),
    deleteColumn: vi.fn(),
    refetch: vi.fn(),
  });
  useMembersMock.mockReturnValue({
    members: SAMPLE_MEMBERS,
    loading: false,
    error: null,
    inviteMember: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
    refetch: vi.fn(),
  });
  useTemplatesMock.mockReturnValue({
    templates: opts.templates ?? [],
    loading: false,
    error: null,
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    refetch: vi.fn(),
  });
  useLabelsMock.mockReturnValue({
    labels: opts.labels ?? SAMPLE_LABELS,
    loading: false,
    error: null,
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    refetch: vi.fn(),
  });
}

describe('CreateTicketDialog — templates and labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHooks({ templates: SAMPLE_TEMPLATES, labels: SAMPLE_LABELS });
    useAddTicketLabelMock.mockReturnValue({
      addLabel: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function renderDialog(
    overrides: Partial<{
      onCreate: ReturnType<typeof vi.fn>;
      onCreated: ReturnType<typeof vi.fn>;
      onOpenChange: ReturnType<typeof vi.fn>;
    }> = {},
  ) {
    const onCreate =
      overrides.onCreate ?? vi.fn().mockResolvedValue(SAMPLE_CREATED_TICKET);
    const onCreated = overrides.onCreated ?? vi.fn();
    const onOpenChange = overrides.onOpenChange ?? vi.fn();

    const utils = render(
      <CreateTicketDialog
        projectId={PROJECT_ID}
        open={true}
        onOpenChange={onOpenChange}
        onCreate={onCreate}
        onCreated={onCreated}
      />,
    );

    return { ...utils, onCreate, onCreated, onOpenChange };
  }

  it('renders the "Use template" button when no template is applied', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: /use template/i }),
    ).toBeInTheDocument();
  });

  it('clicking "Use template" opens a popover with one row per template and a priority badge', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /use template/i }));

    // Only the popover content shows the template names. The main dialog
    // contains labels — no template names — so a plain getByText works here.
    expect(screen.getByText('Bug fix')).toBeInTheDocument();
    expect(screen.getByText('Feature work')).toBeInTheDocument();
    // Priority badges from defaultPriority.
    expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0);
  });

  it('shows the empty-state copy when the project has no templates', () => {
    useTemplatesMock.mockReturnValue({
      templates: [],
      loading: false,
      error: null,
      createTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      refetch: vi.fn(),
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /use template/i }));

    expect(
      screen.getByText(/no templates yet — ask an owner to create one\./i),
    ).toBeInTheDocument();
  });

  it('clicking a template row pre-fills title/description/priority and replaces the button with "Clear template"', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /use template/i }));
    fireEvent.click(screen.getByText('Bug fix'));

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/^title$/i) as HTMLInputElement).value,
      ).toBe('[Bug] {{summary}}');
    });
    expect(
      (screen.getByLabelText(/^description$/i) as HTMLTextAreaElement).value,
    ).toBe('Steps to reproduce…');
    expect(
      (screen.getByLabelText(/^priority$/i) as HTMLSelectElement).value,
    ).toBe('HIGH');

    // The Bug label from the template should be checked.
    const bugCheckbox = screen.getByLabelText('Bug') as HTMLInputElement;
    expect(bugCheckbox).toBeChecked();
    const featureCheckbox = screen.getByLabelText('Feature label') as HTMLInputElement;
    expect(featureCheckbox).not.toBeChecked();

    // Button should now read "Clear template".
    expect(
      screen.getByRole('button', { name: /clear template/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /use template/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking a template row with a dirty form opens a confirm dialog; Cancel keeps the draft', async () => {
    renderDialog();

    // Make the form dirty by typing a title.
    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'Existing draft' },
    });

    // Open the popover and click a template row.
    fireEvent.click(screen.getByRole('button', { name: /use template/i }));
    fireEvent.click(screen.getByText('Bug fix'));

    // Confirm dialog should be visible.
    expect(
      screen.getByText(/replace current draft/i),
    ).toBeInTheDocument();

    // Cancel.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Draft untouched.
    expect(
      (screen.getByLabelText(/^title$/i) as HTMLInputElement).value,
    ).toBe('Existing draft');
    expect(
      screen.queryByRole('button', { name: /clear template/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /use template/i }),
    ).toBeInTheDocument();
  });

  it('clicking "Clear template" resets title/description/priority and unchecks all labels', async () => {
    renderDialog();

    // Apply a template first.
    fireEvent.click(screen.getByRole('button', { name: /use template/i }));
    fireEvent.click(screen.getByText('Bug fix'));

    // Now click "Clear template".
    fireEvent.click(screen.getByRole('button', { name: /clear template/i }));

    expect(
      (screen.getByLabelText(/^title$/i) as HTMLInputElement).value,
    ).toBe('');
    expect(
      (screen.getByLabelText(/^description$/i) as HTMLTextAreaElement).value,
    ).toBe('');
    expect(
      (screen.getByLabelText(/^priority$/i) as HTMLSelectElement).value,
    ).toBe('MEDIUM');

    // All checkboxes unchecked.
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }

    // Button swapped back.
    expect(
      screen.getByRole('button', { name: /use template/i }),
    ).toBeInTheDocument();
  });

  it('renders one label row per project label with a toggleable checkbox', () => {
    renderDialog();

    // Labels block should have one row per SAMPLE_LABELS entry.
    const bugRow = screen.getByLabelText('Bug') as HTMLInputElement;
    const featureRow = screen.getByLabelText('Feature label') as HTMLInputElement;
    expect(bugRow).toBeInTheDocument();
    expect(featureRow).toBeInTheDocument();

    // Initially neither is checked.
    expect(bugRow).not.toBeChecked();
    expect(featureRow).not.toBeChecked();

    // Click toggles the Set.
    fireEvent.click(bugRow);
    expect(bugRow).toBeChecked();
    expect(featureRow).not.toBeChecked();

    fireEvent.click(featureRow);
    expect(bugRow).toBeChecked();
    expect(featureRow).toBeChecked();

    fireEvent.click(bugRow);
    expect(bugRow).not.toBeChecked();
    expect(featureRow).toBeChecked();
  });

  it('on create, sequentially calls addLabel for each selected label id and closes the dialog', async () => {
    const addLabel = vi.fn().mockResolvedValue(undefined);
    useAddTicketLabelMock.mockReturnValue({ addLabel });

    const onCreate = vi.fn().mockResolvedValue(SAMPLE_CREATED_TICKET);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog({ onCreate, onCreated, onOpenChange });

    // Select both labels.
    fireEvent.click(screen.getByLabelText('Bug'));
    fireEvent.click(screen.getByLabelText('Feature label'));

    // Fill required fields.
    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'New work' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    // addLabel called for each selected label id, in order, with the
    // ticket number returned by onCreate.
    expect(addLabel).toHaveBeenCalledTimes(2);
    expect(addLabel).toHaveBeenNthCalledWith(1, SAMPLE_CREATED_TICKET.number, 'lbl-1');
    expect(addLabel).toHaveBeenNthCalledWith(2, SAMPLE_CREATED_TICKET.number, 'lbl-2');

    // Dialog closed after successful create + label adds.
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(onCreated).toHaveBeenCalledWith(SAMPLE_CREATED_TICKET);
  });

  it('skips a stale label id (404) and continues with the remaining labels', async () => {
    const addLabel = vi.fn().mockImplementation(async (_n: number, labelId: string) => {
      if (labelId === 'lbl-1') {
        throw new ApiError(404, 'Label not found');
      }
      return undefined;
    });
    useAddTicketLabelMock.mockReturnValue({ addLabel });

    const onCreate = vi.fn().mockResolvedValue(SAMPLE_CREATED_TICKET);
    renderDialog({ onCreate });

    // Select both labels.
    fireEvent.click(screen.getByLabelText('Bug'));
    fireEvent.click(screen.getByLabelText('Feature label'));

    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'New work' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(addLabel).toHaveBeenCalledTimes(2);
    });
    // Both calls attempted despite the first 404.
    expect(addLabel).toHaveBeenNthCalledWith(1, SAMPLE_CREATED_TICKET.number, 'lbl-1');
    expect(addLabel).toHaveBeenNthCalledWith(2, SAMPLE_CREATED_TICKET.number, 'lbl-2');
  });

  it('non-404 addLabel failures bubble up and keep the dialog open', async () => {
    const addLabel = vi.fn().mockImplementation(async (_n: number, labelId: string) => {
      if (labelId === 'lbl-1') {
        throw new ApiError(401, 'Unauthorized');
      }
      return undefined;
    });
    useAddTicketLabelMock.mockReturnValue({ addLabel });

    const onCreate = vi.fn().mockResolvedValue(SAMPLE_CREATED_TICKET);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreate, onCreated, onOpenChange });

    fireEvent.click(screen.getByLabelText('Bug'));
    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'New work' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(addLabel).toHaveBeenCalledTimes(1);
    });

    // Dialog still open, error surfaced, no further label calls.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(addLabel).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
  });

  it('createTicket failure surfaces the error and keeps the dialog open', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError(500, 'Server exploded'));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreate, onCreated, onOpenChange });

    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'New work' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText(/server exploded/i)).toBeInTheDocument();
  });

  it('silently drops template defaultLabel ids that no longer exist in the project', () => {
    // Template references lbl-gone, which is not a project label.
    const staleTemplate: TicketTemplate = {
      ...SAMPLE_TEMPLATES[0],
      defaultLabels: [{ id: 'lbl-gone', name: 'Stale', color: '#000' }],
    };
    useTemplatesMock.mockReturnValue({
      templates: [staleTemplate],
      loading: false,
      error: null,
      createTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      refetch: vi.fn(),
    });

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /use template/i }));
    fireEvent.click(screen.getByText('Bug fix'));

    // Title and description still applied.
    expect(
      (screen.getByLabelText(/^title$/i) as HTMLInputElement).value,
    ).toBe('[Bug] {{summary}}');

    // No label checkboxes should be ticked — lbl-gone is not a project label.
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it('routes 400 ApiError with title-related details to the per-field title error', async () => {
    const details = 'title: String must contain at least 1 character(s)';
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError(400, 'Validation failed', details));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreate, onCreated, onOpenChange });

    // Fill a non-empty title so the client-side zod check passes and we
    // reach the catch block.
    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'Anything' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    // Dialog stays open; per-field title error carries the details string.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText(details)).toBeInTheDocument();
  });

  it('routes 400 ApiError with non-title details to the top-level form error', async () => {
    const details = 'statusColumnId: Invalid uuid';
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError(400, 'Validation failed', details));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreate, onCreated, onOpenChange });

    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'Anything' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText(details)).toBeInTheDocument();
  });

  it('falls back to the existing error copy on non-ApiError rejections', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Failed to create ticket'));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onCreate, onCreated, onOpenChange });

    fireEvent.input(screen.getByLabelText(/^title$/i), {
      target: { value: 'Anything' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    // Dialog stays open, no per-field title error is set, and the existing
    // inline formError slot shows the legacy 'Failed to create ticket' copy.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/string must contain at least 1 character/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/failed to create ticket/i)).toBeInTheDocument();
  });

  describe('image attachments', () => {
    function makeFile(name: string, sizeBytes = 1024): File {
      return new File([new Uint8Array(sizeBytes)], name, { type: 'image/png' });
    }

    function attachFile(name: string, sizeBytes = 1024) {
      const input = screen.getByTestId(
        'attachment-uploader-input',
      ) as HTMLInputElement;
      const file = makeFile(name, sizeBytes);
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      fireEvent.change(input);
      return file;
    }

    it('renders the uploader with the empty-state prompt', () => {
      renderDialog();

      expect(screen.getByTestId('attachment-uploader')).toBeInTheDocument();
      expect(screen.getByText('No images selected')).toBeInTheDocument();
    });

    it('shows one thumbnail per attached file', () => {
      renderDialog();

      attachFile('a.png');
      attachFile('b.png');

      const previews = screen.getAllByTestId('attachment-uploader-preview');
      expect(previews).toHaveLength(2);
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('submits and uploads every attached file after the ticket is created', async () => {
      const onCreated = vi.fn();
      const onOpenChange = vi.fn();
      uploadAttachmentMock.mockResolvedValue({} as never);

      renderDialog({ onCreated, onOpenChange });

      attachFile('first.png');
      attachFile('second.png');

      fireEvent.input(screen.getByLabelText(/^title$/i), {
        target: { value: 'With images' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledTimes(1);
      });

      expect(uploadAttachmentMock).toHaveBeenCalledTimes(2);
      expect(uploadAttachmentMock).toHaveBeenNthCalledWith(
        1,
        PROJECT_ID,
        SAMPLE_CREATED_TICKET.number,
        expect.objectContaining({ name: 'first.png' }),
      );
      expect(uploadAttachmentMock).toHaveBeenNthCalledWith(
        2,
        PROJECT_ID,
        SAMPLE_CREATED_TICKET.number,
        expect.objectContaining({ name: 'second.png' }),
      );
    });

    it('keeps the dialog open and shows an error when an upload fails', async () => {
      const onCreated = vi.fn();
      const onOpenChange = vi.fn();
      uploadAttachmentMock.mockRejectedValueOnce(new Error('network down'));

      renderDialog({ onCreated, onOpenChange });

      attachFile('boom.png');

      fireEvent.input(screen.getByLabelText(/^title$/i), {
        target: { value: 'With one image' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

      await waitFor(() => {
        expect(uploadAttachmentMock).toHaveBeenCalledTimes(1);
      });

      // Dialog stays open, onCreated not called, formError surfaces the cause.
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onCreated).not.toHaveBeenCalled();
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });

    it('surfaces a 415 from the upload API as "Unsupported file type"', async () => {
      const onCreated = vi.fn();
      const onOpenChange = vi.fn();
      uploadAttachmentMock.mockRejectedValueOnce(
        new ApiError(415, 'Unsupported Media Type'),
      );

      renderDialog({ onCreated, onOpenChange });

      attachFile('evil.exe');

      fireEvent.input(screen.getByLabelText(/^title$/i), {
        target: { value: 'Bad file' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create ticket/i }));

      await waitFor(() => {
        expect(uploadAttachmentMock).toHaveBeenCalledTimes(1);
      });

      expect(onCreated).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    });
  });
});
