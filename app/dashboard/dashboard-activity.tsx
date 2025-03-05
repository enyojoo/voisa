"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Phone, MessageSquare, CreditCard } from "lucide-react"
import { getUserCallHistory, getUserSMSHistory, getUserCreditHistory } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import type { CallDto, SMSDto, CreditDto } from "@/types/api"

type ActivityItem = (CallDto | SMSDto | CreditDto) & { type: "call" | "sms" | "credit" }

export default function DashboardActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const [callResponse, smsResponse, creditResponse] = await Promise.all([
          getUserCallHistory(),
          getUserSMSHistory(),
          getUserCreditHistory(),
        ])

        const calls = callResponse.data.data.map((call: CallDto) => ({ ...call, type: "call" as const }))
        const sms = smsResponse.data.data.map((sms: SMSDto) => ({ ...sms, type: "sms" as const }))
        const credits = creditResponse.data.data.map((credit: CreditDto) => ({ ...credit, type: "credit" as const }))

        setActivity(
          [...calls, ...sms, ...credits].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        )
      } catch (error) {
        console.error("Error fetching dashboard activity:", error)
        toast({
          title: "Error",
          description: "Failed to load activity data. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchActivity()
  }, [toast])

  if (isLoading) {
    return <div>Loading activity data...</div>
  }

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Your recent calls, messages, and transactions.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="calls">Calls</TabsTrigger>
            <TabsTrigger value="sms">SMS</TabsTrigger>
            <TabsTrigger value="credits">Credits</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 py-4">
                {activity.map((item) => (
                  <ActivityItem key={item.id} activity={item} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="calls">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 py-4">
                {activity
                  .filter((item) => item.type === "call")
                  .map((item) => (
                    <ActivityItem key={item.id} activity={item} />
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="sms">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 py-4">
                {activity
                  .filter((item) => item.type === "sms")
                  .map((item) => (
                    <ActivityItem key={item.id} activity={item} />
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="credits">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 py-4">
                {activity
                  .filter((item) => item.type === "credit")
                  .map((item) => (
                    <ActivityItem key={item.id} activity={item} />
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ActivityItem({ activity }: { activity: ActivityItem }) {
  const getIcon = (type: string) => {
    switch (type) {
      case "call":
        return <Phone className="h-4 w-4" />
      case "sms":
        return <MessageSquare className="h-4 w-4" />
      case "credit":
        return <CreditCard className="h-4 w-4" />
      default:
        return null
    }
  }

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case "call":
        return "default"
      case "sms":
        return "secondary"
      case "credit":
        return "outline"
      default:
        return "default"
    }
  }

  const getDescription = (item: ActivityItem) => {
    switch (item.type) {
      case "call":
        return `Call ${item.direction === "OUTBOUND" ? "to" : "from"} ${item.direction === "OUTBOUND" ? item.toNumber : item.fromNumber}`
      case "sms":
        return `SMS ${item.direction === "OUTBOUND" ? "to" : "from"} ${item.direction === "OUTBOUND" ? item.toNumber : item.fromNumber}`
      case "credit":
        return item.description
    }
  }

  const getCost = (item: ActivityItem) => {
    if ("cost" in item) {
      return `Cost: ${item.cost} credits`
    } else if ("amount" in item) {
      return `Amount: ${item.amount} credits`
    }
    return ""
  }

  return (
    <div className="flex items-start space-x-4 rounded-lg border p-4">
      <div className="rounded-full bg-primary/10 p-2">{getIcon(activity.type)}</div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{getDescription(activity)}</p>
          <Badge variant={getBadgeVariant(activity.type)}>
            {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
          </Badge>
        </div>
        <div className="flex items-center text-sm text-muted-foreground">
          <span>{new Date(activity.createdAt).toLocaleString()}</span>
          {"duration" in activity && <span className="ml-4">Duration: {activity.duration} seconds</span>}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>{getCost(activity)}</span>
        </div>
      </div>
    </div>
  )
}

