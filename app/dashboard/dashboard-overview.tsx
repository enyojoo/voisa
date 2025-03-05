"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, Phone, MessageSquare, Clock, Activity } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-provider"
import { getUserCreditBalance, getUserActivePhoneNumbers } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import type { PhoneNumberDto } from "@/types/api"

export default function DashboardOverview() {
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [activeNumbers, setActiveNumbers] = useState<PhoneNumberDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true)
      try {
        const [creditResponse, numbersResponse] = await Promise.all([
          getUserCreditBalance(),
          getUserActivePhoneNumbers(),
        ])
        setCreditBalance(creditResponse.data.data)
        setActiveNumbers(numbersResponse.data.data)
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
        toast({
          title: "Error",
          description: "Failed to load dashboard data. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [toast])

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Please log in to view your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button>Log In</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return <div>Loading dashboard overview...</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditBalance !== null ? creditBalance : "Loading..."}</div>
            <Link href="/credits">
              <Button variant="link" className="px-0">
                Manage Credits
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Numbers</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeNumbers.length}</div>
            <Link href="/numbers">
              <Button variant="link" className="px-0">
                Manage Numbers
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">250</div>
            <p className="text-xs text-muted-foreground">+15% from last month</p>
            <Link href="/sms">
              <Button variant="link" className="px-0">
                Send SMS
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Call Minutes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">120</div>
            <p className="text-xs text-muted-foreground">+5% from last month</p>
            <Link href="/calls">
              <Button variant="link" className="px-0">
                Make a Call
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    
    </div>
  )
}

