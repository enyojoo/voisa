"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Phone, MessageSquare } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { getUserActivePhoneNumbers, deactivatePhoneNumber } from "@/lib/api"
import type { PhoneNumberDto } from "@/types/api"
import { useToast } from "@/components/ui/use-toast"

// Mock user phone numbers
// const mockUserNumbers = [
//   {
//     id: "1",
//     number: "+1 (415) 555-1234",
//     country: "US",
//     expiresAt: "2023-04-15",
//     features: ["SMS", "Voice"],
//     status: "active",
//   },
//   {
//     id: "2",
//     number: "+44 20 7946 0958",
//     country: "UK",
//     expiresAt: "2023-04-10",
//     features: ["SMS", "Voice", "MMS"],
//     status: "active",
//   },
// ]

export default function DashboardNumbers() {
  const [userNumbers, setUserNumbers] = useState<PhoneNumberDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchUserNumbers = async () => {
      try {
        const response = await getUserActivePhoneNumbers()
        setUserNumbers(response.data.data)
      } catch (error) {
        console.error("Error fetching user numbers:", error)
        toast({
          title: "Error",
          description: "Failed to fetch your phone numbers. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserNumbers()
  }, [toast])

  const handleDeactivate = async (phoneNumberId: string) => {
    try {
      await deactivatePhoneNumber(phoneNumberId)
      setUserNumbers((prevNumbers) => prevNumbers.filter((number) => number.id !== phoneNumberId))
      toast({
        title: "Success",
        description: "Phone number deactivated successfully.",
      })
    } catch (error) {
      console.error("Error deactivating phone number:", error)
      toast({
        title: "Error",
        description: "Failed to deactivate phone number. Please try again.",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <Card className="col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Your Phone Numbers</CardTitle>
          <CardDescription>Manage your active phone numbers.</CardDescription>
        </div>
        <Link href="/numbers">
          <Button variant="outline" size="sm">
            <Phone className="mr-2 h-4 w-4" />
            Get New Number
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {userNumbers.map((number) => (
            <div key={number.id} className="flex flex-col space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{number.number}</div>
                <Badge variant={number.status === "active" ? "default" : "secondary"}>
                  {number.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">Country: {number.country}</div>
              <div className="text-sm text-muted-foreground">
                Expires: {new Date(number.expiresAt).toLocaleDateString()}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {number.features.map((feature) => (
                  <Badge key={feature} variant="outline">
                    {feature}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <Link href={`/sms?from=${number.id}`}>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send SMS
                  </Button>
                </Link>
                <Button onClick={() => handleDeactivate(number.id)} variant="destructive" size="sm">
                  Deactivate
                </Button>
                {/* <Link href={`/numbers/${number.id}/settings`}>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Settings</span>
                  </Button>
                </Link> */}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

