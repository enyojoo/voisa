"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth-provider"
import { getUserCallHistory } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import type { CallDto } from "@/types/api"

export default function CallHistory() {
  const [callHistory, setCallHistory] = useState<CallDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    const fetchCallHistory = async () => {
      if (!user) return

      try {
        const response = await getUserCallHistory()
        setCallHistory(response.data.data)
      } catch (error) {
        console.error("Error fetching call history:", error)
        toast({
          title: "Error",
          description: "Failed to load call history. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchCallHistory()
  }, [user, toast])

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>Please log in to view your call history.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>Loading your call history...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call History</CardTitle>
        <CardDescription>View your recent calls.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {callHistory.map((call) => (
              <div key={call.id} className="flex items-center justify-between space-x-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {call.direction === "OUTBOUND" ? `To: ${call.toNumber}` : `From: ${call.fromNumber}`}
                  </p>
                  <p className="text-sm text-muted-foreground">{new Date(call.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={call.direction === "INBOUND" ? "secondary" : "default"}>{call.direction}</Badge>
                  <span className="text-sm font-medium">{call.duration ? `${call.duration}s` : "N/A"}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

