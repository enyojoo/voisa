"use client"

import { useState } from "react"
import SendSMS from "./send-sms"
import SMSHistory from "./sms-history"
import AuthenticatedLayout from "@/components/authenticated-layout"

export default function SMSPage() {
  const [refreshHistory, setRefreshHistory] = useState(0)

  const handleSMSSent = () => {
    setRefreshHistory((prev) => prev + 1)
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">SMS</h1>
        <div className="grid gap-6 md:grid-cols-2">
          <SendSMS onSMSSent={handleSMSSent} />
          <SMSHistory key={refreshHistory} />
        </div>
      </div>
    </AuthenticatedLayout>
  )
}

