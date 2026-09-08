import { redirect } from "next/navigation";

// The freelancer workspace opens on "Ontdekken" (the klussen feed).
export default function DashboardRootRedirect() {
  redirect("/dashboard/klussen");
}
