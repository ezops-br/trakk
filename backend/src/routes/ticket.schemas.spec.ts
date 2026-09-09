import { createTicketSchema, updateTicketSchema } from './ticket.schemas';

const VALID_TITLE = 'Fix login bug';
const VALID_STATUS_COLUMN_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';

describe('createTicketSchema', () => {
  it('accepts null for the nullable optional fields (description, assigneeId, dueDate)', () => {
    // Arrange — the frontend CreateTicketDialog always sends every key and uses
    // `null` for the optional inputs the user left empty.
    const input = {
      title: VALID_TITLE,
      statusColumnId: VALID_STATUS_COLUMN_ID,
      description: null,
      assigneeId: null,
      dueDate: null,
    };

    // Act
    const result = createTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('accepts the minimal payload (only title and statusColumnId)', () => {
    // Arrange
    const input = {
      title: VALID_TITLE,
      statusColumnId: VALID_STATUS_COLUMN_ID,
    };

    // Act
    const result = createTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('still rejects when title is empty (title stays required)', () => {
    // Arrange
    const input = {
      title: '',
      statusColumnId: VALID_STATUS_COLUMN_ID,
    };

    // Act
    const result = createTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleIssue = result.error.issues.find((i) => i.path[0] === 'title');
      expect(titleIssue).toBeDefined();
    }
  });

  it('still rejects when statusColumnId is not a uuid (statusColumnId stays required)', () => {
    // Arrange
    const input = {
      title: VALID_TITLE,
      statusColumnId: 'not-a-uuid',
    };

    // Act
    const result = createTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const columnIssue = result.error.issues.find((i) => i.path[0] === 'statusColumnId');
      expect(columnIssue).toBeDefined();
    }
  });
});

describe('updateTicketSchema', () => {
  it('accepts { description: null }', () => {
    // Act
    const result = updateTicketSchema.safeParse({ description: null });

    // Assert
    expect(result.success).toBe(true);
  });

  it('accepts { assigneeId: null }', () => {
    // Act
    const result = updateTicketSchema.safeParse({ assigneeId: null });

    // Assert
    expect(result.success).toBe(true);
  });

  it('rejects a payload that includes reporterId', () => {
    // Arrange — reporterId is server-set from req.user.id and must never be
    // accepted from the client (see ticket.schemas.ts .strict() guard).
    const input = { reporterId: '11111111-2222-3333-4444-555555555555' };

    // Act
    const result = updateTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const reporterIssue = result.error.issues.find(
        (i) => i.code === 'unrecognized_keys' && Array.isArray(i.keys) && i.keys.includes('reporterId'),
      );
      expect(reporterIssue).toBeDefined();
    }
  });

  it('still accepts a clean payload with only allowed fields', () => {
    // Arrange — guards against an over-tight .strict() regression that would
    // block legitimate update payloads.
    const input = { title: 'still works' };

    // Act
    const result = updateTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });
});

describe('createTicketSchema reporterId rejection', () => {
  it('rejects a payload that includes reporterId alongside valid fields', () => {
    // Arrange — reporterId is server-set from req.user.id and must never be
    // accepted from the client (see ticket.schemas.ts .strict() guard).
    const input = {
      title: VALID_TITLE,
      statusColumnId: VALID_STATUS_COLUMN_ID,
      reporterId: '11111111-2222-3333-4444-555555555555',
    };

    // Act
    const result = createTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const reporterIssue = result.error.issues.find(
        (i) => i.code === 'unrecognized_keys' && Array.isArray(i.keys) && i.keys.includes('reporterId'),
      );
      expect(reporterIssue).toBeDefined();
    }
  });
});
