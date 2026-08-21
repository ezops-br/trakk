import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { encrypt, decrypt } from '../utils/crypto';
import { AppError } from '../lib/app-error';
import { revokeToken } from './google-oauth.service';
import { avatarStorage } from '../lib/avatar-storage';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function upsertUser(
  googleProfile: { sub: string; email: string; name: string; picture?: string | null },
  tokens: { access_token: string; refresh_token?: string },
): Promise<{ id: string; email: string; displayName: string; avatarUrl: string | null; themePreference: string }> {
  const { sub, email, name, picture } = googleProfile;

  // Check if an OAuthAccount already exists for this Google sub
  const existingOAuthAccount = await prisma.oAuthAccount.findFirst({
    where: { provider: 'google', providerId: sub },
    include: { user: true },
  });

  if (existingOAuthAccount) {
    // Returning user — update profile fields
    // Never overwrite a manually-uploaded avatar; only update avatarUrl from Google
    // when the user still has the Google-sourced one (no custom upload on record).
    const hasCustomAvatar = !!existingOAuthAccount.user.avatarStoragePath;
    const updatedUser = await prisma.user.update({
      where: { id: existingOAuthAccount.userId },
      data: {
        email,
        displayName: name,
        googleAvatarUrl: picture ?? null,
        ...(!hasCustomAvatar ? { avatarUrl: picture ?? null } : {}),
      },
      select: { id: true, email: true, displayName: true, avatarUrl: true, themePreference: true },
    });

    // Update OAuthAccount tokens
    await prisma.oAuthAccount.update({
      where: { id: existingOAuthAccount.id },
      data: {
        providerId: sub,
        accessTokenEnc: encrypt(tokens.access_token),
        ...(tokens.refresh_token !== undefined
          ? { refreshTokenEnc: encrypt(tokens.refresh_token) }
          : {}),
      },
    });

    return updatedUser;
  }

  // New user — check if email is already taken by a different account
  const emailConflict = await prisma.user.findFirst({
    where: { email },
  });

  if (emailConflict) {
    throw new AppError(409, 'This email is already registered with a different Google account');
  }

  // Create new user with nested OAuthAccount
  try {
    const createdUser = await prisma.user.create({
      data: {
        email,
        googleId: sub,
        displayName: name,
        avatarUrl: picture ?? null,
        googleAvatarUrl: picture ?? null,
        oauthAccounts: {
          create: {
            provider: 'google',
            providerId: sub,
            accessTokenEnc: encrypt(tokens.access_token),
            refreshTokenEnc: tokens.refresh_token !== undefined
              ? encrypt(tokens.refresh_token)
              : null,
          },
        },
      },
      select: { id: true, email: true, displayName: true, avatarUrl: true, themePreference: true },
    });

    return createdUser;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'This email is already registered with a different Google account');
    }
    throw err;
  }
}

export async function findUserById(userId: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  themePreference: string;
  avatarStoragePath?: string | null;
  googleAvatarUrl?: string | null;
  googleConnected: boolean;
  googleEmail: string | null;
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
      googleAvatarUrl: true,
    },
  });
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: 'google' },
    select: { id: true, providerId: true },
  });

  return {
    ...user,
    googleConnected: oauthAccount !== null,
    googleEmail: oauthAccount ? user.email : null,
  };
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
  // Fetch OAuthAccount before deletion for token revocation
  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: 'google' },
  });

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

  // Delete user (OAuthAccount cascades)
  await prisma.user.delete({ where: { id: userId } });

  // Best-effort token revocation
  if (oauthAccount?.refreshTokenEnc) {
    try {
      await revokeToken(decrypt(oauthAccount.refreshTokenEnc));
    } catch {
      // swallow errors silently
    }
  }
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
  googleAvatarUrl: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarStoragePath: true, googleAvatarUrl: true },
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

  // Revert avatarUrl to googleAvatarUrl or null
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      avatarStoragePath: null,
      avatarUrl: user.googleAvatarUrl ?? null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      themePreference: true,
      avatarStoragePath: true,
      googleAvatarUrl: true,
    },
  });

  return updatedUser;
}

export async function softDisconnectGoogle(userId: string): Promise<void> {
  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!oauthAccount) {
    throw new AppError(404, 'No Google account connected.');
  }

  // Best-effort token revocation
  try {
    if (oauthAccount.refreshTokenEnc) {
      await revokeToken(decrypt(oauthAccount.refreshTokenEnc));
    }
  } catch {
    // swallow revocation errors
  }

  await prisma.oAuthAccount.delete({ where: { id: oauthAccount.id } });
}
