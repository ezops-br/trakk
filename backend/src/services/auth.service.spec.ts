import { verifyCredentials, findUserById, disconnectUser, updateMe, uploadAvatar, deleteAvatar } from './auth.service';
import { AppError } from '../lib/app-error';

// Mock prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    project: {
      delete: jest.fn(),
    },
    ticket: {
      updateMany: jest.fn(),
    },
  },
}));

// Mock password utilities
jest.mock('../utils/password', () => ({
  comparePassword: jest.fn(),
  hashPassword: jest.fn(),
}));

// Mock avatar-storage
// save() returns Promise<string> (a URL) to match the production AvatarStorage interface
jest.mock('../lib/avatar-storage', () => ({
  avatarStorage: {
    save: jest.fn().mockResolvedValue('/api/v1/uploads/avatars/test.jpg'),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}), { virtual: true });

// Mock file-type
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}), { virtual: true });

import { prisma } from '../lib/prisma';
import { comparePassword } from '../utils/password';
import { avatarStorage } from '../lib/avatar-storage';
import * as fileType from 'file-type';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockComparePassword = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockAvatarStorage = avatarStorage as jest.Mocked<typeof avatarStorage>;
const mockFileTypeFromBuffer = fileType.fileTypeFromBuffer as jest.MockedFunction<typeof fileType.fileTypeFromBuffer>;

const EXISTING_USER = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: 'https://example.com/avatar.jpg',
  themePreference: 'light',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EXISTING_USER_WITH_PASSWORD = {
  id: EXISTING_USER.id,
  email: EXISTING_USER.email,
  displayName: EXISTING_USER.displayName,
  avatarUrl: EXISTING_USER.avatarUrl,
  themePreference: EXISTING_USER.themePreference,
  passwordHash: 'hashed-password-value',
};

describe('verifyCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the safe user object when email and password are correct', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER_WITH_PASSWORD);
    mockComparePassword.mockResolvedValue(true);

    // Act
    const result = await verifyCredentials('alice@example.com', 'correct-password');

    // Assert
    expect(result).toEqual({
      id: EXISTING_USER.id,
      email: EXISTING_USER.email,
      displayName: EXISTING_USER.displayName,
      avatarUrl: EXISTING_USER.avatarUrl,
      themePreference: EXISTING_USER.themePreference,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws a 401 "Invalid email or password" error when the password is wrong', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER_WITH_PASSWORD);
    mockComparePassword.mockResolvedValue(false);

    // Act & Assert
    await expect(verifyCredentials('alice@example.com', 'wrong-password')).rejects.toThrow(AppError);
    await expect(verifyCredentials('alice@example.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
  });

  it('throws the SAME 401 "Invalid email or password" error for an unknown email (anti-enumeration)', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(verifyCredentials('nobody@example.com', 'whatever')).rejects.toThrow(AppError);
    await expect(verifyCredentials('nobody@example.com', 'whatever')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid email or password',
    });
    // comparePassword must not be called (or if it is, does not affect the outcome) —
    // the important behavior is that unknown-email and wrong-password produce an
    // identical error, so callers cannot distinguish which case occurred.
    expect(mockComparePassword).not.toHaveBeenCalled();
  });
});

describe('findUserById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns safe user shape { id, email, displayName, avatarUrl } when user exists', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    const result = await findUserById(EXISTING_USER.id);

    // Assert
    expect(result).toMatchObject({
      id: EXISTING_USER.id,
      email: EXISTING_USER.email,
      displayName: EXISTING_USER.displayName,
      avatarUrl: EXISTING_USER.avatarUrl,
    });
  });

  it('returns themePreference field in the user object', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    const result = await findUserById(EXISTING_USER.id);

    // Assert — themePreference must be included in the select and returned
    expect(result).toHaveProperty('themePreference', 'light');
  });

  it('throws a 404 AppError when user does not exist', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(findUserById('nonexistent-id')).rejects.toThrow(AppError);
    await expect(findUserById('nonexistent-id')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateMe (legacy displayName path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns updated user profile after successful displayName update', async () => {
    // Arrange
    const updatedUser = { ...EXISTING_USER, displayName: 'Alice Updated' };
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    // Act
    const result = await updateMe(EXISTING_USER.id, { displayName: 'Alice Updated' });

    // Assert
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_USER.id },
        data: { displayName: 'Alice Updated' },
      }),
    );
    expect(result.displayName).toBe('Alice Updated');
  });
});

describe('updateMe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates themePreference only — calls prisma.user.update with { themePreference: "dark" } and returns user with themePreference "dark"', async () => {
    // Arrange
    const updatedUser = { ...EXISTING_USER, themePreference: 'dark' };
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    // Act
    const result = await updateMe(EXISTING_USER.id, { themePreference: 'dark' });

    // Assert
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_USER.id },
        data: { themePreference: 'dark' },
      }),
    );
    expect(result.themePreference).toBe('dark');
  });

  it('updates displayName only — calls prisma.user.update with { displayName: "New Name" } and returns user with updated displayName', async () => {
    // Arrange
    const updatedUser = { ...EXISTING_USER, displayName: 'New Name' };
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    // Act
    const result = await updateMe(EXISTING_USER.id, { displayName: 'New Name' });

    // Assert
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_USER.id },
        data: { displayName: 'New Name' },
      }),
    );
    expect(result.displayName).toBe('New Name');
  });

  it('updates both displayName and themePreference simultaneously', async () => {
    // Arrange
    const updatedUser = { ...EXISTING_USER, displayName: 'Updated Name', themePreference: 'dark' };
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    // Act
    const result = await updateMe(EXISTING_USER.id, { displayName: 'Updated Name', themePreference: 'dark' });

    // Assert
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_USER.id },
        data: { displayName: 'Updated Name', themePreference: 'dark' },
      }),
    );
    expect(result.displayName).toBe('Updated Name');
    expect(result.themePreference).toBe('dark');
  });
});

describe('disconnectUser', () => {
  const userId = 'user-uuid-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nullifies assigneeId on all tickets assigned to the user before deletion', async () => {
    // Arrange — user is member of no projects
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await disconnectUser(userId);

    // Assert
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      }),
    );
  });

  it('deletes a project when the user is the sole member', async () => {
    // Arrange
    const memberships = [
      { id: 'pm-1', projectId: 'proj-1', userId, role: 'OWNER' },
    ];
    (mockPrisma.projectMember.findMany as jest.Mock)
      .mockResolvedValueOnce(memberships) // user's memberships
      .mockResolvedValueOnce([{ id: 'pm-1', userId, role: 'OWNER' }]); // all members of proj-1 => only this user
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.project.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await disconnectUser(userId);

    // Assert
    expect(mockPrisma.project.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'proj-1' } }),
    );
  });

  it('promotes another member to OWNER when user is sole OWNER but other members exist', async () => {
    // Arrange
    const memberships = [
      { id: 'pm-1', projectId: 'proj-1', userId, role: 'OWNER' },
    ];
    const allProjectMembers = [
      { id: 'pm-1', userId, role: 'OWNER' },
      { id: 'pm-2', userId: 'other-user', role: 'MEMBER' },
    ];
    (mockPrisma.projectMember.findMany as jest.Mock)
      .mockResolvedValueOnce(memberships)
      .mockResolvedValueOnce(allProjectMembers);
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null); // no other owner
    (mockPrisma.projectMember.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await disconnectUser(userId);

    // Assert
    expect(mockPrisma.projectMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: 'OWNER' },
      }),
    );
  });

  it('removes membership only when another OWNER already exists', async () => {
    // Arrange
    const memberships = [
      { id: 'pm-1', projectId: 'proj-1', userId, role: 'OWNER' },
    ];
    const allProjectMembers = [
      { id: 'pm-1', userId, role: 'OWNER' },
      { id: 'pm-2', userId: 'other-owner', role: 'OWNER' },
    ];
    (mockPrisma.projectMember.findMany as jest.Mock)
      .mockResolvedValueOnce(memberships)
      .mockResolvedValueOnce(allProjectMembers);
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({ id: 'pm-2', userId: 'other-owner', role: 'OWNER' });
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await disconnectUser(userId);

    // Assert — should not delete the project and should not call update to promote
    expect(mockPrisma.project.delete).not.toHaveBeenCalled();
    expect(mockPrisma.projectMember.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId } }),
    );
  });
});

describe('uploadAvatar', () => {
  const VALID_BUFFER = Buffer.from('fakeimagedata');
  const VALID_MIME = 'image/jpeg';

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply avatar-storage mock implementations
    // save() returns a URL string (Promise<string>) — matches the production AvatarStorage interface
    (mockAvatarStorage.save as jest.Mock).mockResolvedValue('/api/v1/uploads/avatars/test.jpg');
    (mockAvatarStorage.delete as jest.Mock).mockResolvedValue(undefined);
  });

  it('happy path: saves file, updates user avatarUrl and avatarStoragePath, returns { avatarUrl }', async () => {
    // Arrange
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' } as Awaited<ReturnType<typeof fileType.fileTypeFromBuffer>>);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ ...EXISTING_USER, avatarStoragePath: null });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: '/api/v1/uploads/avatars/some-uuid.jpg',
    });

    // Act
    const result = await uploadAvatar(EXISTING_USER.id, {
      buffer: VALID_BUFFER,
      mimetype: VALID_MIME,
      size: 1024,
    });

    // Assert
    expect(result).toHaveProperty('avatarUrl');
    expect(result.avatarUrl).toMatch(/\/api\/v1\/uploads\/avatars\//);
    expect(mockAvatarStorage.save).toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_USER.id },
        data: expect.objectContaining({ avatarStoragePath: expect.any(String) }),
      }),
    );
  });

  it('rejects invalid MIME type from multipart header with AppError 400', async () => {
    // Arrange — file-type check not reached; header mime type is wrong
    // Act & Assert
    await expect(
      uploadAvatar(EXISTING_USER.id, {
        buffer: VALID_BUFFER,
        mimetype: 'application/pdf',
        size: 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when magic-bytes check fails even if Content-Type header is valid', async () => {
    // Arrange — header says jpeg but magic bytes say something else
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' } as Awaited<ReturnType<typeof fileType.fileTypeFromBuffer>>);

    // Act & Assert
    await expect(
      uploadAvatar(EXISTING_USER.id, {
        buffer: VALID_BUFFER,
        mimetype: 'image/jpeg',
        size: 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects file exceeding AVATAR_MAX_SIZE_MB with AppError 400', async () => {
    // Arrange — 6 MB > default 5 MB limit
    const oversizedBytes = 6 * 1024 * 1024;

    // Act & Assert
    await expect(
      uploadAvatar(EXISTING_USER.id, {
        buffer: VALID_BUFFER,
        mimetype: VALID_MIME,
        size: oversizedBytes,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deletes old file before saving new one when avatarStoragePath is non-null', async () => {
    // Arrange
    const oldPath = 'old-avatar.jpg';
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' } as Awaited<ReturnType<typeof fileType.fileTypeFromBuffer>>);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: oldPath,
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: '/api/v1/uploads/avatars/new-uuid.jpg',
    });

    // Act
    await uploadAvatar(EXISTING_USER.id, {
      buffer: VALID_BUFFER,
      mimetype: VALID_MIME,
      size: 1024,
    });

    // Assert — old file deleted before new one saved
    const deleteCalls = (mockAvatarStorage.delete as jest.Mock).mock.invocationCallOrder;
    const saveCalls = (mockAvatarStorage.save as jest.Mock).mock.invocationCallOrder;
    expect(deleteCalls[0]).toBeLessThan(saveCalls[0]);
    expect(mockAvatarStorage.delete).toHaveBeenCalledWith(oldPath);
  });

  it('continues (logs warn) when old file deletion throws, still saves new file', async () => {
    // Arrange
    mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' } as Awaited<ReturnType<typeof fileType.fileTypeFromBuffer>>);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: 'old-avatar.jpg',
    });
    (mockAvatarStorage.delete as jest.Mock).mockRejectedValueOnce(new Error('disk error'));
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: '/api/v1/uploads/avatars/new.jpg',
    });

    // Act & Assert — must not throw
    await expect(
      uploadAvatar(EXISTING_USER.id, {
        buffer: VALID_BUFFER,
        mimetype: VALID_MIME,
        size: 1024,
      }),
    ).resolves.not.toThrow();
    expect(mockAvatarStorage.save).toHaveBeenCalled();
  });
});

describe('deleteAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockAvatarStorage.delete as jest.Mock).mockResolvedValue(undefined);
  });

  it('happy path: deletes file, updates user to clear avatarUrl and avatarStoragePath', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: 'custom-avatar.jpg',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: null,
      avatarStoragePath: null,
    });

    // Act
    const result = await deleteAvatar(EXISTING_USER.id);

    // Assert
    expect(mockAvatarStorage.delete).toHaveBeenCalledWith('custom-avatar.jpg');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { avatarStoragePath: null, avatarUrl: null },
      }),
    );
    expect(result).toHaveProperty('avatarUrl', null);
  });

  it('throws AppError 404 when avatarStoragePath is null (no custom avatar)', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: null,
    });

    // Act & Assert
    await expect(deleteAvatar(EXISTING_USER.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('continues (logs warn) when file deletion throws, still updates DB', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: 'avatar.jpg',
    });
    (mockAvatarStorage.delete as jest.Mock).mockRejectedValueOnce(new Error('disk error'));
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: null,
      avatarStoragePath: null,
    });

    // Act & Assert — must not throw
    await expect(deleteAvatar(EXISTING_USER.id)).resolves.not.toThrow();
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });
});
