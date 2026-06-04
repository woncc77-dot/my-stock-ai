import { ApiAuthProvider } from "@/components/api-auth-provider";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ApiAuthProvider>{children}</ApiAuthProvider>;
}
