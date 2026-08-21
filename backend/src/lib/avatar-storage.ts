import fs from 'fs/promises';
import path from 'path';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface AvatarStorage {
  save(filename: string, buffer: Buffer, mimeType: string): Promise<string>;
  delete(filename: string): Promise<void>;
}

export class LocalAvatarStorage implements AvatarStorage {
  private uploadDir: string;

  constructor(uploadDir?: string) {
    this.uploadDir = uploadDir ?? process.env.AVATAR_UPLOAD_DIR ?? './uploads/avatars';
  }

  async save(filename: string, buffer: Buffer, _mimeType: string): Promise<string> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.writeFile(path.join(this.uploadDir, filename), buffer);
    return `/api/v1/uploads/avatars/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.uploadDir, filename));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

export class S3AvatarStorage implements AvatarStorage {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const region = process.env.S3_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.bucket = process.env.S3_BUCKET!;
    this.publicUrl = (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');

    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  async save(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: `avatars/${filename}`,
        Body: buffer,
        ContentType: mimeType,
      },
    });
    await upload.done();
    return `${this.publicUrl}/avatars/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `avatars/${filename}`,
      }),
    );
  }
}

export const avatarStorage: AvatarStorage = process.env.S3_BUCKET
  ? new S3AvatarStorage()
  : new LocalAvatarStorage();
