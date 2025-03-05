"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { searchAvailableNumbers } from "@/lib/api"
import type { AvailablePhoneNumberDto } from "@/types/api"

interface PhoneNumberSearchProps {
  onSearchResults: (results: AvailablePhoneNumberDto[]) => void
  onSearching: (isSearching: boolean) => void
}

export default function PhoneNumberSearch({ onSearchResults, onSearching }: PhoneNumberSearchProps) {
  const [country, setCountry] = useState("US")
  const [areaCode, setAreaCode] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const { toast } = useToast()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(true)
    onSearching(true)

    try {
      const response = await searchAvailableNumbers(country, areaCode)
      onSearchResults(response.data.data)
    } catch (error) {
      console.error("Error searching for numbers:", error)
      toast({
        title: "Error",
        description: "Failed to search for available numbers. Please try again.",
        variant: "destructive",
      })
      onSearchResults([])
    } finally {
      setIsSearching(false)
      onSearching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search for Phone Numbers</CardTitle>
        <CardDescription>Search for available phone numbers by country and area code.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Select Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="CA">Canada</SelectItem>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="AU">Australia</SelectItem>
              <SelectItem value="DE">Germany</SelectItem>
              <SelectItem value="FR">France</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by area code..."
              className="pl-8"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isSearching}>
            {isSearching ? "Searching..." : "Search"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

