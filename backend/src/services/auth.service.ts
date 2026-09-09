import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError, unauthorized } from '../lib/app-error';
import { avatarStorage } from '../lib/avatar-storage';
import { comparePassword } from '../utils/password';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  themePreference: string;
}> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      themePreference: true,
      passwordHash: true,
    },
  });

  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function findUserById(userId: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  themePreference: string;
  avatarStoragePath?: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      themePreference: true,
      avatarStoragePath: true,
    },
  });
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  return user;
}

export async function updateMe(
  userId: string,
  data: { displayName?: string; themePreference?: string },
): Promise<{ id: string; email: string; displayName: string; avatarUrl: string | null; themePreference: string }> {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, displayName: true, avatarUrl: true, themePreference: true },
  });
}

export async function disconnectUser(userId: string): Promise<void> {
  // Nullify assigneeId on all tickets assigned to this user
  await prisma.ticket.updateMany({
    where: { assigneeId: userId },
    data: { assigneeId: null },
  });

  // Fetch user's project memberships
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
  });

  // Handle ownership transfers / project deletions
  for (const membership of memberships) {
    if (membership.role !== 'OWNER') {
      continue;
    }

    // Get all members of this project
    const allProjectMembers = await prisma.projectMember.findMany({
      where: { projectId: membership.projectId },
    });

    const otherMembers = allProjectMembers.filter((m) => m.userId !== userId);

    if (otherMembers.length === 0) {
      // Sole member — delete the entire project (cascades everything)
      await prisma.project.delete({ where: { id: membership.projectId } });
      continue;
    }

    // Check if another OWNER already exists
    const anotherOwner = await prisma.projectMember.findFirst({
      where: { projectId: membership.projectId, role: 'OWNER', userId: { not: userId } },
    });

    if (!anotherOwner) {
      // Promote the oldest non-owner member
      const nextMember = otherMembers[0];
      await prisma.projectMember.update({
        where: { id: nextMember.id },
        data: { role: 'OWNER' },
      });
    }
    // If another OWNER exists, nothing to do — just remove membership below
  }

  // Remove all remaining memberships for this user
  await prisma.projectMember.deleteMany({ where: { userId } });

  // Delete user
  await prisma.user.delete({ where: { id: userId } });
}

export async function uploadAvatar(
  userId: string,
  { buffer, mimetype, size }: { buffer: Buffer; mimetype: string; size: number },
): Promise<{ avatarUrl: string }> {
  // Validate MIME type from Content-Type header
  if (!ALLOWED_IMAGE_MIMES.includes(mimetype)) {
    throw new AppError(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
  }

  // Validate file size
  if (size > AVATAR_MAX_BYTES) {
    throw new AppError(400, 'File too large. Maximum avatar size is 5 MB.');
  }

  // Validate magic bytes — dynamic import avoids ESM loading issue in Jest CJS transform
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIMES.includes(detected.mime)) {
    throw new AppError(400, 'File content does not match an allowed image type.');
  }

  // Fetch existing user to check for old avatar
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarStoragePath: true },
  });

  // Best-effort deletion of old avatar file
  if (user?.avatarStoragePath) {
    try {
      await avatarStorage.delete(user.avatarStoragePath);
    } catch (err) {
      console.warn('[uploadAvatar] Failed to delete old avatar file:', err);
    }
  }

  // Generate new filename and save
  const filename = `${uuid()}.${detected.ext}`;
  const avatarUrl = await avatarStorage.save(filename, buffer, mimetype);

  // Update user record
  await prisma.user.update({
    where: { id: userId },
    data: {
      avatarStoragePath: filename,
      avatarUrl,
    },
  });

  return { avatarUrl };
}

export async function deleteAvatar(userId: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  themePreference: string;
  avatarStoragePath: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarStoragePath: true },
  });

  if (!user?.avatarStoragePath) {
    throw new AppError(404, 'No custom avatar to delete.');
  }

  // Best-effort file deletion
  try {
    await avatarStorage.delete(user.avatarStoragePath);
  } catch (err) {
    console.warn('[deleteAvatar] Failed to delete avatar file:', err);
  }

  // Revert avatarUrl to null (no custom avatar)
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      avatarStoragePath: null,
      avatarUrl: null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      themePreference: true,
      avatarStoragePath: true,
    },
  });

  return updatedUser;
}
