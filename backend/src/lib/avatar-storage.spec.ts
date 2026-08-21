// TDD Red Phase — S3AvatarStorage does not exist yet.
// Tests for LocalAvatarStorage (extended) and S3AvatarStorage (new).

import path from 'path';

// Mock fs/promises so we never touch the real filesystem
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

// Mock AWS SDK modules so we never call real S3
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/lib-storage', () => {
  return {
    Upload: jest.fn().mockImplementation(() => ({
      done: jest.fn().mockResolvedValue({}),
    })),
  };
});

import * as fsPromises from 'fs/promises';
import { LocalAvatarStorage } from './avatar-storage';

const mockUnlink = fsPromises.unlink as jest.MockedFunction<typeof fsPromises.unlink>;
const mockWriteFile = fsPromises.writeFile as jest.MockedFunction<typeof fsPromises.writeFile>;
const mockMkdir = fsPromises.mkdir as jest.MockedFunction<typeof fsPromises.mkdir>;

// ─── LocalAvatarStorage ───────────────────────────────────────────────────────

describe('LocalAvatarStorage', () => {
  let storage: LocalAvatarStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new LocalAvatarStorage('/tmp/avatars');
  });

  describe('save', () => {
    it('creates the upload directory and writes the file, returns the URL string', async () => {
      // Arrange
      const filename = 'avatar-abc123.jpg';
      const buffer = Buffer.from('fake-image-data');
      const mimeType = 'image/jpeg';

      // Act
      const result = await storage.save(filename, buffer, mimeType);

      // Assert — mkdir called with recursive, writeFile called with correct path
      expect(mockMkdir).toHaveBeenCalledWith('/tmp/avatars', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        path.join('/tmp/avatars', filename),
        buffer,
      );
      // Returns the local URL string
      expect(result).toBe(`/api/v1/uploads/avatars/${filename}`);
    });
  });

  describe('delete', () => {
    it('swallows ENOENT silently — resolves without throwing when file does not exist', async () => {
      // Arrange — simulate ENOENT
      const enoentErr = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      mockUnlink.mockRejectedValueOnce(enoentErr);

      // Act & Assert — must not throw
      await expect(storage.delete('missing-avatar.jpg')).resolves.not.toThrow();
    });

    it('re-throws non-ENOENT errors (e.g. EPERM) so callers can handle them', async () => {
      // Arrange — simulate a permission error
      const epermErr = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      mockUnlink.mockRejectedValueOnce(epermErr);

      // Act & Assert — must propagate
      await expect(storage.delete('restricted-avatar.jpg')).rejects.toMatchObject({ code: 'EPERM' });
    });

    it('calls fs.unlink with the correct file path', async () => {
      // Arrange
      mockUnlink.mockResolvedValueOnce(undefined);

      // Act
      await storage.delete('my-avatar.png');

      // Assert
      expect(mockUnlink).toHaveBeenCalledWith(path.join('/tmp/avatars', 'my-avatar.png'));
    });
  });
});

// ─── S3AvatarStorage ──────────────────────────────────────────────────────────

describe('S3AvatarStorage', () => {
  const S3_BUCKET = 'my-trakk-bucket';
  const S3_REGION = 'us-east-1';
  const S3_PUBLIC_URL = 'https://cdn.example.com';
  const S3_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
  const S3_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  let S3AvatarStorage: new () => import('./avatar-storage').AvatarStorage;
  let mockUploadDone: jest.Mock;
  let mockS3Send: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set env vars for S3 config
    process.env.S3_BUCKET = S3_BUCKET;
    process.env.S3_REGION = S3_REGION;
    process.env.S3_PUBLIC_URL = S3_PUBLIC_URL;
    process.env.S3_ACCESS_KEY_ID = S3_ACCESS_KEY_ID;
    process.env.S3_SECRET_ACCESS_KEY = S3_SECRET_ACCESS_KEY;

    // Re-wire Upload mock
    mockUploadDone = jest.fn().mockResolvedValue({});
    const { Upload } = require('@aws-sdk/lib-storage');
    (Upload as jest.Mock).mockImplementation(() => ({ done: mockUploadDone }));

    // Re-wire S3Client send mock
    mockS3Send = jest.fn().mockResolvedValue({});
    const { S3Client } = require('@aws-sdk/client-s3');
    (S3Client as jest.Mock).mockImplementation(() => ({ send: mockS3Send }));

    // Import S3AvatarStorage from the module
    S3AvatarStorage = require('./avatar-storage').S3AvatarStorage;
  });

  afterEach(() => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
  });

  describe('save', () => {
    it('calls Upload with correct Bucket, Key prefixed with avatars/, and ContentType', async () => {
      // Arrange
      const storage = new S3AvatarStorage();
      const filename = 'avatar-xyz789.png';
      const buffer = Buffer.from('fake-png');
      const mimeType = 'image/png';
      const { Upload } = require('@aws-sdk/lib-storage');

      // Act
      await storage.save(filename, buffer, mimeType);

      // Assert — Upload constructor called with correct params
      expect(Upload).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            Bucket: S3_BUCKET,
            Key: `avatars/${filename}`,
            ContentType: mimeType,
          }),
        }),
      );
      expect(mockUploadDone).toHaveBeenCalledTimes(1);
    });

    it('returns the correct public URL: {S3_PUBLIC_URL}/avatars/{filename}', async () => {
      // Arrange
      const storage = new S3AvatarStorage();
      const filename = 'avatar-xyz789.png';
      const buffer = Buffer.from('fake-png');

      // Act
      const result = await storage.save(filename, buffer, 'image/png');

      // Assert
      expect(result).toBe(`${S3_PUBLIC_URL}/avatars/${filename}`);
    });

    it('normalizes trailing slash in S3_PUBLIC_URL before building URL', async () => {
      // Arrange — S3_PUBLIC_URL has a trailing slash
      process.env.S3_PUBLIC_URL = 'https://cdn.example.com/';
      const StorageClass = require('./avatar-storage').S3AvatarStorage;
      const storage = new StorageClass();
      const filename = 'avatar-trailing.jpg';

      // Act
      const result = await storage.save(filename, Buffer.from('data'), 'image/jpeg');

      // Assert — no double slash
      expect(result).toBe(`https://cdn.example.com/avatars/${filename}`);
      expect(result).not.toContain('//avatars');
    });
  });

  describe('delete', () => {
    it('calls DeleteObjectCommand with correct Bucket and Key prefixed with avatars/', async () => {
      // Arrange
      const storage = new S3AvatarStorage();
      const filename = 'avatar-to-delete.jpg';
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

      // Act
      await storage.delete(filename);

      // Assert — DeleteObjectCommand constructed with correct params
      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: S3_BUCKET,
          Key: `avatars/${filename}`,
        }),
      );
      // S3Client.send() invoked
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('resolves without throwing when S3 delete succeeds (idempotent)', async () => {
      // Arrange
      const storage = new S3AvatarStorage();
      mockS3Send.mockResolvedValueOnce({});

      // Act & Assert — no throw
      await expect(storage.delete('any-file.jpg')).resolves.not.toThrow();
    });
  });
});

// ─── Singleton auto-selection ─────────────────────────────────────────────────

describe('avatarStorage singleton', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.S3_BUCKET;
  });

  it('exports LocalAvatarStorage when S3_BUCKET is not set', () => {
    // Arrange — ensure S3_BUCKET is absent
    delete process.env.S3_BUCKET;

    // Act — re-import module fresh
    const { avatarStorage } = require('./avatar-storage');

    // Assert
    const { LocalAvatarStorage: Local } = require('./avatar-storage');
    expect(avatarStorage).toBeInstanceOf(Local);
  });

  it('exports S3AvatarStorage when S3_BUCKET is set', () => {
    // Arrange
    process.env.S3_BUCKET = 'my-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_PUBLIC_URL = 'https://cdn.example.com';
    process.env.S3_ACCESS_KEY_ID = 'KEYID';
    process.env.S3_SECRET_ACCESS_KEY = 'SECRET';

    jest.resetModules();

    // Re-mock AWS SDK after resetModules wipes the registry
    jest.mock('@aws-sdk/client-s3', () => ({
      S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
      DeleteObjectCommand: jest.fn(),
    }));
    jest.mock('@aws-sdk/lib-storage', () => ({
      Upload: jest.fn().mockImplementation(() => ({ done: jest.fn() })),
    }));

    // Act — re-import module fresh
    const { avatarStorage } = require('./avatar-storage');
    const { S3AvatarStorage: S3 } = require('./avatar-storage');

    // Assert
    expect(avatarStorage).toBeInstanceOf(S3);
  });
});
