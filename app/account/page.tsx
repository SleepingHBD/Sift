import { AccountPage } from "@/components/pages/account-page";
import { AppShell } from "@/components/shell/app-shell";

export default function AccountRoute() {
  return <AppShell activeSection="account"><AccountPage /></AppShell>;
}
