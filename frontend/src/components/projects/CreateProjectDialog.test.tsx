import { describe, it, expect } from 'vitest';

// Import the Zod schema exported by the dialog component (does not exist yet)
import { createProjectSchema } from './CreateProjectDialog';

describe('createProjectSchema', () => {
  it('accepts valid input with a valid name and uppercase key', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project', key: 'MYPROJ' });
    expect(result.success).toBe(true);
  });

  it('rejects a lowercase key with a validation error on the key field', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project', key: 'myproj' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const keyErrors = result.error.issues.filter((issue) =>
        issue.path.includes('key'),
      );
      expect(keyErrors.length).toBeGreaterThan(0);
    }
  });

  it('rejects an empty name with a validation error', () => {
    const result = createProjectSchema.safeParse({ name: '', key: 'VALID' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameErrors = result.error.issues.filter((issue) =>
        issue.path.includes('name'),
      );
      expect(nameErrors.length).toBeGreaterThan(0);
    }
  });
});
