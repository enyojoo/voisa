import type { Metadata } from "next"
import CallsPage from "./calls-page"

export const metadata: Metadata = {
  title: "Calls | Voisa",
  description: "Make calls and view your call history",
}

export default function CallsServerPage() {
  return <CallsPage />
}

