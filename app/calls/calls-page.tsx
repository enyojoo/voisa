"use client"

import { useState } from "react"
import MakeCall from "./make-call"
import CallHistory from "./call-history"
import AuthenticatedLayout from "@/components/authenticated-layout"

export default function CallsPage() {
  const [refreshHistory, setRefreshHistory] = useState(0)

  const handleCallMade = () => {
    setRefreshHistory((prev) => prev + 1)
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Phone</h1>
        <div className="grid gap-6 md:grid-cols-2">
          <MakeCall onCallMade={handleCallMade} />
          <CallHistory key={refreshHistory} />
        </div>
      </div>
    </AuthenticatedLayout>
  )
}

