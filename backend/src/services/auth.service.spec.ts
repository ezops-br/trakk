import { upsertUser, findUserById, disconnectUser, updateMe, uploadAvatar, deleteAvatar, softDisconnectGoogle } from './auth.service';
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
    oAuthAccount: {
      findFirst: jest.fn(),
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

// Mock crypto utilities
jest.mock('../utils/crypto', () => ({
  encrypt: jest.fn((input: string) => `encrypted:${input}`),
  decrypt: jest.fn((input: string) => input.replace(/^encrypted:/, '')),
}));

// Mock google-oauth service
jest.mock('../services/google-oauth.service', () => ({
  revokeToken: jest.fn().mockResolvedValue(undefined),
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
import { encrypt, decrypt } from '../utils/crypto';
import { revokeToken } from '../services/google-oauth.service';
import { avatarStorage } from '../lib/avatar-storage';
import * as fileType from 'file-type';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;
const mockRevokeToken = revokeToken as jest.MockedFunction<typeof revokeToken>;
const mockAvatarStorage = avatarStorage as jest.Mocked<typeof avatarStorage>;
const mockFileTypeFromBuffer = fileType.fileTypeFromBuffer as jest.MockedFunction<typeof fileType.fileTypeFromBuffer>;

const GOOGLE_PROFILE = {
  sub: 'google-sub-123',
  email: 'alice@example.com',
  name: 'Alice Smith',
  picture: 'https://example.com/avatar.jpg',
};

const TOKENS = {
  access_token: 'access-token-abc',
  refresh_token: 'refresh-token-xyz',
  id_token: 'id-token-123',
  expiry_date: Date.now() + 3600 * 1000,
};

const TOKENS_NO_REFRESH = {
  access_token: 'access-token-abc',
  id_token: 'id-token-123',
  expiry_date: Date.now() + 3600 * 1000,
};

const EXISTING_USER = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  googleId: 'google-sub-123',
  displayName: 'Alice Smith',
  avatarUrl: 'https://example.com/avatar.jpg',
  themePreference: 'light',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const USER_ID = 'user-uuid-1';

const EXISTING_OAUTH_ACCOUNT = {
  id: 'oauth-uuid-1',
  userId: USER_ID,
  provider: 'google',
  providerId: 'google-sub-123',
  accessTokenEnc: 'encrypted:old-access-token',
  refreshTokenEnc: 'encrypted:old-refresh-token',
  user: {
    id: USER_ID,
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatarUrl: 'https://example.com/avatar.jpg',
    avatarStoragePath: null,
    googleAvatarUrl: 'https://example.com/avatar.jpg',
  },
};

describe('upsertUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new User and OAuthAccount for a first-time login (googleId not found, email not found)', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    const createdUser = { ...EXISTING_USER };
    (mockPrisma.user.create as jest.Mock).mockResolvedValue(createdUser);

    // Act
    const result = await upsertUser(GOOGLE_PROFILE, TOKENS);

    // Assert
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const createCall = (mockPrisma.user.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.email).toBe(GOOGLE_PROFILE.email);
    expect(createCall.data.googleId).toBe(GOOGLE_PROFILE.sub);
    expect(result.id).toBe(createdUser.id);
  });

  it('updates profile fields and access token for a returning user (googleId found)', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(EXISTING_USER);
    (mockPrisma.oAuthAccount.update as jest.Mock).mockResolvedValue({ ...EXISTING_OAUTH_ACCOUNT });

    // Act
    const result = await upsertUser(GOOGLE_PROFILE, TOKENS);

    // Assert
    expect(mockPrisma.oAuthAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'google', providerId: GOOGLE_PROFILE.sub }),
      }),
    );
    expect(mockPrisma.oAuthAccount.update).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it('updates email on the existing user when the returning user changed their Google email', async () => {
    // Arrange
    const accountWithOldEmail = { ...EXISTING_OAUTH_ACCOUNT };
    const userWithOldEmail = { ...EXISTING_USER, email: 'old@example.com' };
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(accountWithOldEmail);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ ...userWithOldEmail, email: GOOGLE_PROFILE.email });
    (mockPrisma.oAuthAccount.update as jest.Mock).mockResolvedValue(accountWithOldEmail);

    const newProfile = { ...GOOGLE_PROFILE, email: 'newemail@example.com' };

    // Act
    await upsertUser(newProfile, TOKENS);

    // Assert
    const updateCall = (mockPrisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.email).toBe(newProfile.email);
  });

  it('preserves existing refreshTokenEnc when Google omits refresh_token', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(EXISTING_USER);
    (mockPrisma.oAuthAccount.update as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);

    // Act
    await upsertUser(GOOGLE_PROFILE, TOKENS_NO_REFRESH);

    // Assert
    const updateCall = (mockPrisma.oAuthAccount.update as jest.Mock).mock.calls[0][0];
    // Should not overwrite refreshTokenEnc when refresh_token is absent
    expect(updateCall.data.refreshTokenEnc).toBeUndefined();
  });

  it('overwrites refreshTokenEnc when Google provides a new refresh_token', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);
    (mockPrisma.user.update as jest.Mock).mockResolvedValue(EXISTING_USER);
    (mockPrisma.oAuthAccount.update as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);

    // Act
    await upsertUser(GOOGLE_PROFILE, TOKENS);

    // Assert
    const updateCall = (mockPrisma.oAuthAccount.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.refreshTokenEnc).toBe(`encrypted:${TOKENS.refresh_token}`);
  });

  it('encrypts both access_token and refresh_token before storage', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await upsertUser(GOOGLE_PROFILE, TOKENS);

    // Assert
    expect(mockEncrypt).toHaveBeenCalledWith(TOKENS.access_token);
    expect(mockEncrypt).toHaveBeenCalledWith(TOKENS.refresh_token);
    const createCall = (mockPrisma.user.create as jest.Mock).mock.calls[0][0];
    const oauthData = createCall.data.oauthAccounts?.create ?? createCall.data.oauthAccounts;
    if (oauthData) {
      expect(oauthData.accessTokenEnc).toBe(`encrypted:${TOKENS.access_token}`);
      expect(oauthData.refreshTokenEnc).toBe(`encrypted:${TOKENS.refresh_token}`);
    }
  });

  it('throws a 409 conflict when a new googleId attempts to register with an email already in use by a different account', async () => {
    // Arrange — no oauth account for this googleId, but email is taken by a different user
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
    const differentUser = { ...EXISTING_USER, googleId: 'different-google-id' };
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(differentUser);

    // Act & Assert
    await expect(upsertUser(GOOGLE_PROFILE, TOKENS)).rejects.toThrow(AppError);
    await expect(upsertUser(GOOGLE_PROFILE, TOKENS)).rejects.toMatchObject({ statusCode: 409 });
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
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
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
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
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
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
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
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);
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

  it('calls revokeToken with the decrypted refresh token after user deletion', async () => {
    // Arrange
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_OAUTH_ACCOUNT,
      refreshTokenEnc: 'encrypted:real-refresh-token',
    });
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);

    // Act
    await disconnectUser(userId);

    // Assert
    expect(mockDecrypt).toHaveBeenCalledWith('encrypted:real-refresh-token');
    expect(mockRevokeToken).toHaveBeenCalledWith('real-refresh-token');
  });

  it('completes deletion even when revokeToken throws', async () => {
    // Arrange
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_OAUTH_ACCOUNT,
      refreshTokenEnc: 'encrypted:real-refresh-token',
    });
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue(EXISTING_USER);
    mockRevokeToken.mockRejectedValueOnce(new Error('Google revoke failed'));

    // Act & Assert — should not throw
    await expect(disconnectUser(userId)).resolves.not.toThrow();
    expect(mockPrisma.user.delete).toHaveBeenCalled();
  });
});

// --- New tests for profile feature ---

describe('findUserById (extended — googleConnected)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns googleConnected: true when OAuthAccount exists for the user', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER);
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue({
      id: 'oauth-uuid-1',
      userId: EXISTING_USER.id,
      provider: 'google',
    });

    // Act
    const result = await findUserById(EXISTING_USER.id);

    // Assert
    expect(result).toHaveProperty('googleConnected', true);
  });

  it('returns googleConnected: false when no OAuthAccount exists for the user', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(EXISTING_USER);
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);

    // Act
    const result = await findUserById(EXISTING_USER.id);

    // Assert
    expect(result).toHaveProperty('googleConnected', false);
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

  it('happy path: deletes file, updates user to revert avatarUrl to googleAvatarUrl, clears avatarStoragePath', async () => {
    // Arrange
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarStoragePath: 'custom-avatar.jpg',
      googleAvatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      ...EXISTING_USER,
      avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      avatarStoragePath: null,
    });

    // Act
    const result = await deleteAvatar(EXISTING_USER.id);

    // Assert
    expect(mockAvatarStorage.delete).toHaveBeenCalledWith('custom-avatar.jpg');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarStoragePath: null }),
      }),
    );
    expect(result).toHaveProperty('avatarUrl');
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
      googleAvatarUrl: null,
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

describe('softDisconnectGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevokeToken.mockResolvedValue(undefined);
  });

  it('happy path: revokes token, deletes OAuthAccount row', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_OAUTH_ACCOUNT,
      refreshTokenEnc: 'encrypted:google-refresh-token',
    });
    (mockPrisma.oAuthAccount.delete as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);

    // Act
    await softDisconnectGoogle(EXISTING_USER.id);

    // Assert
    expect(mockPrisma.oAuthAccount.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EXISTING_OAUTH_ACCOUNT.id } }),
    );
    expect(mockRevokeToken).toHaveBeenCalled();
  });

  it('throws AppError 404 when no OAuthAccount exists', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(softDisconnectGoogle(EXISTING_USER.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('swallows revokeToken error (best-effort) and still deletes OAuthAccount', async () => {
    // Arrange
    (mockPrisma.oAuthAccount.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_OAUTH_ACCOUNT,
      refreshTokenEnc: 'encrypted:google-refresh-token',
    });
    mockRevokeToken.mockRejectedValueOnce(new Error('revoke failed'));
    (mockPrisma.oAuthAccount.delete as jest.Mock).mockResolvedValue(EXISTING_OAUTH_ACCOUNT);

    // Act & Assert — must not throw
    await expect(softDisconnectGoogle(EXISTING_USER.id)).resolves.not.toThrow();
    expect(mockPrisma.oAuthAccount.delete).toHaveBeenCalled();
  });
});
