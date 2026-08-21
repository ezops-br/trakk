import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { CommandPaletteProvider } from "@/components/layout/CommandPaletteProvider";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { SearchTrigger } from "@/components/layout/SearchTrigger";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:4000/api/v1";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get("trakk_session");

  if (!session?.value) {
    redirect("/login");
  }

  let themePreference: "light" | "dark" | undefined;
  let displayName = "";
  let avatarUrl: string | null = null;

  try {
    const res = await fetch(`${INTERNAL_API_URL}/auth/me`, {
      headers: { Cookie: `trakk_session=${session.value}` },
      cache: "no-store",
    });
    if (!res.ok) redirect("/login");
    const data = (await res.json()) as {
      themePreference?: string;
      displayName?: string;
      avatarUrl?: string | null;
    };
    const pref = data?.themePreference;
    if (pref === "dark" || pref === "light") {
      themePreference = pref;
    }
    displayName = data?.displayName ?? "";
    avatarUrl = data?.avatarUrl ?? null;
  } catch {
    redirect("/login");
  }

  return (
    <CommandPaletteProvider>
      <div className="flex h-screen bg-trakk-bg overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[260px] shrink-0 bg-trakk-surface border-r border-trakk-border flex flex-col">
          <Sidebar />
        </aside>

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-14 shrink-0 bg-trakk-surface border-b border-trakk-border flex items-center justify-between px-6 gap-2">
            <SearchTrigger />
            <div className="flex items-center gap-2">
              <ThemeToggle initialTheme={themePreference} />
              <ProfileMenu
                displayName={displayName}
                avatarUrl={avatarUrl}
                initialTheme={themePreference ?? "light"}
              />
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto bg-trakk-bg p-6">
            {children}
          </main>
        </div>

        {/* Global command palette — mounted once */}
        <CommandPalette />

        {/* Toast notifications — mounted once in the layout */}
        <Toaster richColors position="bottom-right" />
      </div>
    </CommandPaletteProvider>
  );
}
