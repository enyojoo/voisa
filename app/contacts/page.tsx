"use client"

import AuthenticatedLayout from "@/components/authenticated-layout"
import ContactList from "./contact-list"
import AddContactForm from "./add-contact-form"
import { useState, useCallback } from "react"

export default function ContactsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleContactUpdated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
        <div className="grid gap-6 md:grid-cols-2">
          <ContactList key={refreshTrigger} onContactUpdated={handleContactUpdated} />
          <AddContactForm onContactAdded={handleContactUpdated} />
        </div>
      </div>
    </AuthenticatedLayout>
  )
}

