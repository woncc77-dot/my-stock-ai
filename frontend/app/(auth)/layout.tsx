import { SupabaseConnectionBanner } from "@/components/supabase-connection-banner";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SupabaseConnectionBanner />
      {children}
    </>
  );
}
