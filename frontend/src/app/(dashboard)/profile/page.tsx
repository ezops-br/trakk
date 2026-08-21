"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sun, Moon, Upload, Trash2, Unlink, AlertTriangle } from "lucide-react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import { toast } from "sonner";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useProfile } from "@/hooks/use-profile";
import { useTheme } from "@/hooks/use-theme";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

export default function ProfilePage() {
  const { profile, loading, updateDisplayName, uploadAvatar, removeAvatar, disconnectGoogle, deleteAccount } =
    useProfile();
  const { theme, setTheme } = useTheme(
    (profile?.themePreference as "light" | "dark") ?? "light",
  );

  // Display name form
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [savingName, setSavingName] = useState(false);

  // Avatar crop
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFilename, setCropFilename] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Dialogs
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");

  // Seed display name from profile
  useEffect(() => {
    if (profile && !displayNameDirty) {
      setDisplayNameInput(profile.displayName);
    }
  }, [profile, displayNameDirty]);

  // Navigation guard for unsaved display name changes
  useEffect(() => {
    if (!displayNameDirty) return;
    // NOTE: window.onbeforeunload does not intercept Next.js soft-navigation — this is a documented v1 limitation
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [displayNameDirty]);

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayNameInput(e.target.value);
    setDisplayNameDirty(true);
  };

  const handleSaveDisplayName = async () => {
    if (!displayNameInput.trim()) return;
    setSavingName(true);
    try {
      await updateDisplayName(displayNameInput.trim());
      setDisplayNameDirty(false);
      toast.success("Display name updated");
    } catch {
      toast.error("Failed to update display name");
    } finally {
      setSavingName(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Use JPG, PNG, GIF, or WebP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large. Maximum size is 5 MB.");
      return;
    }

    setCropFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(null);
    };
    reader.readAsDataURL(file);

    // Reset input so selecting the same file again triggers onChange
    e.target.value = "";
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  };

  const getCroppedBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const image = imgRef.current;
      if (!image || !completedCrop) {
        reject(new Error("No crop completed"));
        return;
      }

      const canvas = document.createElement("canvas");
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const cropX = (completedCrop.x ?? 0) * scaleX;
      const cropY = (completedCrop.y ?? 0) * scaleY;
      const cropWidth = (completedCrop.width ?? image.naturalWidth) * scaleX;
      const cropHeight = (completedCrop.height ?? image.naturalHeight) * scaleY;

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to generate blob"));
        },
        "image/jpeg",
        0.9,
      );
    });
  };

  const handleCropConfirm = async () => {
    setUploadingAvatar(true);
    try {
      const blob = await getCroppedBlob();
      await uploadAvatar(blob, cropFilename || "avatar.jpg");
      setCropSrc(null);
      toast.success("Avatar updated");
    } catch {
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await removeAvatar();
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to remove avatar");
    }
  };

  const handleDisconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      await disconnectGoogle();
      setDisconnectDialogOpen(false);
      toast.success("Google account disconnected");
    } catch {
      toast.error("Failed to disconnect Google account");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount();
      // deleteAccount navigates to /login — no toast needed
    } catch {
      toast.error("Failed to delete account");
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto text-trakk-text-secondary text-[15px] font-body">
        Failed to load profile.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display font-bold text-2xl tracking-tight text-trakk-text">
        Profile &amp; Settings
      </h1>

      {/* Account card */}
      <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card p-6 space-y-6">
        <h2 className="font-display font-semibold text-lg text-trakk-text">Account</h2>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16">
            {profile.avatarUrl ? (
              <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
            ) : null}
            <AvatarFallback className="text-xl">{getInitials(profile.displayName)}</AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
                <Button type="button" variant="secondary" size="sm" asChild>
                  <span>
                    <Upload size={14} />
                    Upload photo
                  </span>
                </Button>
              </label>

              {profile.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAvatar}
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[12px] font-body text-trakk-text-secondary">
              JPG, PNG, GIF, or WebP. Max 5 MB.
            </p>
          </div>
        </div>

        {/* Crop dialog */}
        {cropSrc && (
          <Dialog open onOpenChange={(open) => !open && setCropSrc(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crop your photo</DialogTitle>
                <DialogDescription>
                  Drag to adjust the crop area. The result will be a square image.
                </DialogDescription>
              </DialogHeader>

              <div className="flex justify-center">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  circularCrop={false}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={cropSrc}
                    alt="Crop preview"
                    onLoad={handleImageLoad}
                    style={{ maxHeight: "400px", maxWidth: "100%" }}
                  />
                </ReactCrop>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCropConfirm}
                  disabled={uploadingAvatar || !completedCrop}
                >
                  {uploadingAvatar ? "Uploading..." : "Save photo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Display name */}
        <div className="space-y-2">
          <label
            htmlFor="display-name"
            className="block text-[13px] font-body font-medium text-trakk-text-secondary"
          >
            Display name
          </label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={displayNameInput}
              onChange={handleDisplayNameChange}
              placeholder="Your name"
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveDisplayName}
              disabled={savingName || !displayNameDirty || !displayNameInput.trim()}
            >
              {savingName ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="text-[12px] font-body text-trakk-text-secondary">
            {profile.email}
          </p>
        </div>
      </section>

      {/* Appearance card */}
      <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card p-6 space-y-4">
        <h2 className="font-display font-semibold text-lg text-trakk-text">Appearance</h2>
        <p className="text-[14px] font-body text-trakk-text-secondary">
          Choose your preferred color theme.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border font-body text-[14px] transition-all duration-200",
              theme === "light"
                ? "bg-gradient-brand text-white border-transparent shadow-glow"
                : "bg-transparent border-trakk-border text-trakk-text-secondary hover:border-trakk-teal hover:text-trakk-teal",
            ].join(" ")}
          >
            <Sun size={16} />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border font-body text-[14px] transition-all duration-200",
              theme === "dark"
                ? "bg-gradient-brand text-white border-transparent shadow-glow"
                : "bg-transparent border-trakk-border text-trakk-text-secondary hover:border-trakk-teal hover:text-trakk-teal",
            ].join(" ")}
          >
            <Moon size={16} />
            Dark
          </button>
        </div>
      </section>

      {/* Google Account card */}
      <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card p-6 space-y-4">
        <h2 className="font-display font-semibold text-lg text-trakk-text">Google Account</h2>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-body text-trakk-text truncate">
              {profile.googleEmail ?? profile.email}
            </p>
            <p className="text-[12px] font-body text-trakk-text-secondary">
              Used for Google Calendar and Google Meet integration.
            </p>
          </div>
          {profile.googleConnected ? (
            <Badge variant="teal">Connected</Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
        </div>
      </section>

      {/* Danger Zone card */}
      <section className="rounded-card bg-trakk-surface border border-[rgba(255,71,87,0.25)] shadow-card p-6 space-y-5">
        <h2 className="font-display font-semibold text-lg text-status-error">Danger Zone</h2>

        {/* Disconnect Google */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[14px] font-body font-medium text-trakk-text">
              Disconnect Google Account
            </p>
            <p className="text-[13px] font-body text-trakk-text-secondary">
              Removes Calendar and Meet access. You will need to reconnect to schedule meetings.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => setDisconnectDialogOpen(true)}
            disabled={!profile.googleConnected}
          >
            <Unlink size={14} />
            Disconnect
          </Button>
        </div>

        <div className="h-px bg-[rgba(255,71,87,0.15)]" />

        {/* Delete Account */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[14px] font-body font-medium text-trakk-text">Delete Account</p>
            <p className="text-[13px] font-body text-trakk-text-secondary">
              Permanently deletes your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <AlertTriangle size={14} />
            Delete account
          </Button>
        </div>
      </section>

      {/* Disconnect Google dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Account?</DialogTitle>
            <DialogDescription>
              This will revoke Trakk&apos;s access to your Google Calendar and Google Meet. Existing
              meetings will not be deleted. You can reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisconnectGoogle}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete account dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setTypedEmail("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all data associated with it. This action
              cannot be undone. Any projects where you are the sole owner will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-sm font-medium mb-1">
              Type your email to confirm
            </label>
            <Input
              type="email"
              placeholder={profile?.email ?? ""}
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deletingAccount || typedEmail !== profile?.email}
            >
              {deletingAccount ? "Deleting..." : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
