"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"

// Mock user phone numbers
const mockUserNumbers = [
  {
    id: "1",
    number: "+1 (415) 555-1234",
    country: "US",
    expiresAt: "2023-04-15",
    features: ["SMS", "Voice"],
    status: "active",
  },
  {
    id: "2",
    number: "+44 20 7946 0958",
    country: "UK",
    expiresAt: "2023-04-10",
    features: ["SMS", "Voice", "MMS"],
    status: "active",
  },
]

export default function NumbersSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone Numbers</CardTitle>
        <CardDescription>Manage your active phone numbers</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {mockUserNumbers.map((number) => (
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
                  <Button variant="outline" size="sm">
                    Renew
                  </Button>
                  <Button variant="ghost" size="sm">
                    Settings
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="mt-4">
          <Link href="/numbers">
            <Button>Get New Number</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

