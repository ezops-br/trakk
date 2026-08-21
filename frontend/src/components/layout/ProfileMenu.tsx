"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sun, Moon, User, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/use-theme";
import { apiClient } from "@/lib/api-client";

interface ProfileMenuProps {
  displayName: string;
  avatarUrl: string | null;
  initialTheme: "light" | "dark";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProfileMenu({ displayName, avatarUrl, initialTheme }: ProfileMenuProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme(initialTheme);

  const handleSignOut = async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
    } catch {
      // best-effort — redirect regardless
    }
    router.push("/login");
  };

  const handleToggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open profile menu"
          className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-trakk-teal"
        >
          <Avatar className="h-8 w-8 cursor-pointer">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} />
            ) : null}
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
            <User size={14} />
            Profile &amp; Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleToggleTheme}
          className="flex items-center gap-2 cursor-pointer"
        >
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          {theme === "light" ? "Switch to Dark" : "Switch to Light"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-2 cursor-pointer text-red-500 focus:text-red-500"
        >
          <LogOut size={14} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
