import type { Metadata } from "next"
import AvailableCredits from "./available-credits"
import CreditPackages from "./credit-packages"
import CreditHistory from "./credit-history"
import AuthenticatedLayout from "@/components/authenticated-layout"

export const metadata: Metadata = {
  title: "Credits | Voisa",
  description: "Manage your credits for calls and SMS",
}

export default function CreditsPage() {
  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Credits</h1>
        <AvailableCredits />
        <h2 className="text-2xl font-bold tracking-tight">Purchase Credits</h2>
        <CreditPackages />
        <h2 className="text-2xl font-bold tracking-tight">Credit History</h2>
        <CreditHistory />
      </div>
    </AuthenticatedLayout>
  )
}

