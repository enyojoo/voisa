"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth-provider"
import { getUserSMSHistory, getUserSentSMSHistory, getUserReceivedSMSHistory } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import type { SMSDto } from "@/types/api"

export default function SMSHistory() {
  const [smsHistory, setSMSHistory] = useState<SMSDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  const fetchSMSHistory = async (type: "all" | "sent" | "received") => {
    setIsLoading(true)
    try {
      let response
      switch (type) {
        case "sent":
          response = await getUserSentSMSHistory()
          break
        case "received":
          response = await getUserReceivedSMSHistory()
          break
        default:
          response = await getUserSMSHistory()
      }
      setSMSHistory(response.data.data)
    } catch (error) {
      console.error("Error fetching SMS history:", error)
      toast({
        title: "Error",
        description: "Failed to fetch SMS history. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchSMSHistory("all")
    }
  }, [user]) // Removed fetchSMSHistory from dependencies

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS History</CardTitle>
          <CardDescription>Please log in to view your SMS history.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SMS History</CardTitle>
          <CardDescription>Loading your SMS history...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS History</CardTitle>
        <CardDescription>View your sent and received SMS messages.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" onValueChange={(value) => fetchSMSHistory(value as "all" | "sent" | "received")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="received">Received</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <SMSList messages={smsHistory} />
          </TabsContent>
          <TabsContent value="sent">
            <SMSList messages={smsHistory.filter((sms) => sms.direction === "OUTBOUND")} />
          </TabsContent>
          <TabsContent value="received">
            <SMSList messages={smsHistory.filter((sms) => sms.direction === "INBOUND")} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function SMSList({ messages }: { messages: SMSDto[] }) {
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-4 py-4">
        {messages.map((sms) => (
          <div key={sms.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant={sms.direction === "OUTBOUND" ? "default" : "secondary"}>
                  {sms.direction === "OUTBOUND" ? "Sent" : "Received"}
                </Badge>
                <span className="text-sm text-muted-foreground">{new Date(sms.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {sms.direction === "OUTBOUND" ? `To: ${sms.toNumber}` : `From: ${sms.fromNumber}`}
              </p>
              <p className="mt-2">{sms.message}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

