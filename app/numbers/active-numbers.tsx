"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Phone, MessageSquare, Settings } from "lucide-react"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { getUserActivePhoneNumbers, deactivatePhoneNumber, renewPhoneNumber } from "@/lib/api"
import type { PhoneNumberDto } from "@/types/api"

export default function ActiveNumbers() {
  const [activeNumbers, setActiveNumbers] = useState<PhoneNumberDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const fetchActiveNumbers = async () => {
    try {
      const response = await getUserActivePhoneNumbers()
      setActiveNumbers(response.data.data)
    } catch (error) {
      console.error("Error fetching active numbers:", error)
      toast({
        title: "Error",
        description: "Failed to fetch your active numbers. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchActiveNumbers()
  }, [])

  const handleDeactivate = async (phoneNumberId: string) => {
    try {
      await deactivatePhoneNumber(phoneNumberId)
      toast({
        title: "Success",
        description: "Phone number deactivated successfully.",
      })
      fetchActiveNumbers()
    } catch (error) {
      console.error("Error deactivating phone number:", error)
      toast({
        title: "Error",
        description: "Failed to deactivate phone number. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRenew = async (phoneNumberId: string) => {
    try {
      await renewPhoneNumber(phoneNumberId)
      toast({
        title: "Success",
        description: "Phone number renewed successfully.",
      })
      fetchActiveNumbers()
    } catch (error) {
      console.error("Error renewing phone number:", error)
      toast({
        title: "Error",
        description: "Failed to renew phone number. Please try again.",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return <div>Loading active numbers...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Active Numbers</CardTitle>
        <CardDescription>Manage your current phone numbers.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activeNumbers.map((number) => (
            <div
              key={number.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-primary text-primary-foreground p-2 rounded-full">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">{number.number}</div>
                  <div className="text-sm text-muted-foreground">
                    {number.country} • Expires: {new Date(number.expiresAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant={number.status === "ACTIVE" ? "default" : "secondary"}>{number.status}</Badge>
                <Link href={`/sms?from=${number.id}`}>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    SMS
                  </Button>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleRenew(number.id)}>Renew</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeactivate(number.id)}>Deactivate</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

