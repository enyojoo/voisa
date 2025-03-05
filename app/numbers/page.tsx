"use client"

import { useState } from "react"
import PhoneNumberSearch from "./phone-number-search"
import PhoneNumberList from "./phone-number-list"
import ActiveNumbers from "./active-numbers"
import AuthenticatedLayout from "@/components/authenticated-layout"
import type { AvailablePhoneNumberDto } from "@/types/api"

export default function NumbersPage() {
  const [searchResults, setSearchResults] = useState<AvailablePhoneNumberDto[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [key, setKey] = useState(0)

  const handleSearchResults = (results: AvailablePhoneNumberDto[]) => {
    setSearchResults(results)
  }

  const handlePurchaseSuccess = () => {
    setKey((prevKey) => prevKey + 1)
    setSearchResults([])
  }

  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Phone Numbers</h1>
        <ActiveNumbers key={key} />
        <h2 className="text-2xl font-bold tracking-tight">Find New Numbers</h2>
        <PhoneNumberSearch onSearchResults={handleSearchResults} onSearching={setIsSearching} />
        {isSearching ? (
          <div>Searching for available numbers...</div>
        ) : (
          <PhoneNumberList availableNumbers={searchResults} onPurchaseSuccess={handlePurchaseSuccess} />
        )}
      </div>
    </AuthenticatedLayout>
  )
}

