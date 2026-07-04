import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/app/sidebar";
import { MobileTabBar, MobileTopBar } from "@/components/app/mobile-nav";
import { MotionProvider } from "@/components/motion/motion-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop: persistent sidebar. Mobile: hidden (see MobileTabBar). */}
      <Sidebar email={user.email ?? null} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        {/* pb-mobilenav reserves room for the fixed bottom tab bar on mobile.
            MotionProvider lives in the layout (persists across navigations) so
            the LazyMotion feature bundle loads exactly once. */}
        <main className="pb-mobilenav flex-1 overflow-x-hidden md:pb-0">
          <MotionProvider>{children}</MotionProvider>
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
