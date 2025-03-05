"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"

// Mock credit data
const mockCreditData = {
  balance: 520,
  lastPurchase: {
    amount: 100,
    date: "2023-03-10",
  },
  recentTransactions: [
    { id: "1", type: "Purchase", amount: 100, date: "2023-03-10" },
    { id: "2", type: "Usage", amount: -10, date: "2023-03-12" },
    { id: "3", type: "Usage", amount: -5, date: "2023-03-14" },
    { id: "4", type: "Bonus", amount: 50, date: "2023-03-15" },
  ],
}

export default function CreditsSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits</CardTitle>
        <CardDescription>Manage your credit balance and transactions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Current Balance</h3>
            <p className="text-3xl font-bold">{mockCreditData.balance} credits</p>
          </div>
         
          <div>
            <h3 className="text-lg font-semibold">Recent Transactions</h3>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {mockCreditData.recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div>
                      <p className="font-medium">{transaction.type}</p>
                      <p className="text-sm text-muted-foreground">{new Date(transaction.date).toLocaleDateString()}</p>
                    </div>
                    <Badge
                      variant={
                        transaction.amount > 0 ? "default" : transaction.type === "Usage" ? "destructive" : "secondary"
                      }
                    >
                      {transaction.amount > 0 ? "+" : ""}
                      {transaction.amount} credits
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="mt-4">
          <Link href="/credits">
            <Button>Purchase Credits</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

