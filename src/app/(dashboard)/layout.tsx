import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 md:flex-row dark:bg-neutral-950">
      <Sidebar email={profile?.email ?? user.email ?? ""} role={profile?.role ?? "USER"} />
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
