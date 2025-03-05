import type { Metadata } from "next"
import DashboardOverview from "./dashboard-overview"
// import DashboardCreditUsage from "./dashboard-credit-usage"
import DashboardActivity from "./dashboard-activity"
import AuthenticatedLayout from "@/components/authenticated-layout"

export const metadata: Metadata = {
  title: "Dashboard | Voisa",
  description: "Manage your phone numbers, credits, and communication",
}

export default function DashboardPage() {
  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <DashboardOverview />
        <DashboardActivity />
      </div>
    </AuthenticatedLayout>
  )
}

