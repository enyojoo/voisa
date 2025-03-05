"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, TrendingUp, TrendingDown } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-provider"
import { getUserCreditBalance, getUserCreditHistory } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"

interface CreditData {
  balance: number
  lastPurchase: {
    amount: number
    date: string
  }
  usage: {
    thisMonth: number
    lastMonth: number
  }
}

export default function AvailableCredits() {
  const [creditData, setCreditData] = useState<CreditData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    const fetchCreditData = async () => {
      try {
        const [balanceResponse, historyResponse] = await Promise.all([getUserCreditBalance(), getUserCreditHistory()])

        const balance = balanceResponse.data.data
        const history = historyResponse.data.data

        const lastPurchase = history
          .filter((transaction) => transaction.transactionType === "PURCHASE")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        const now = new Date()
        const thisMonth = now.getMonth()
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
        const thisYear = now.getFullYear()
        const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear

        const usageThisMonth = history
          .filter(
            (transaction) =>
              transaction.transactionType === "USAGE" &&
              new Date(transaction.createdAt).getMonth() === thisMonth &&
              new Date(transaction.createdAt).getFullYear() === thisYear,
          )
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

        const usageLastMonth = history
          .filter(
            (transaction) =>
              transaction.transactionType === "USAGE" &&
              new Date(transaction.createdAt).getMonth() === lastMonth &&
              new Date(transaction.createdAt).getFullYear() === lastYear,
          )
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

        setCreditData({
          balance,
          lastPurchase: lastPurchase
            ? {
                amount: lastPurchase.amount,
                date: lastPurchase.createdAt,
              }
            : null,
          usage: {
            thisMonth: usageThisMonth,
            lastMonth: usageLastMonth,
          },
        })
      } catch (error) {
        console.error("Error fetching credit data:", error)
        toast({
          title: "Error",
          description: "Failed to load credit data. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchCreditData()
    } else {
      setIsLoading(false)
    }
  }, [user, toast])

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Available Credits</CardTitle>
          <CardDescription>Please log in to view your credit balance.</CardDescription>
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
    return <div>Loading credit data...</div>
  }

  const usageChange = creditData.usage.thisMonth - creditData.usage.lastMonth
  const usageChangePercentage =
    creditData.usage.lastMonth !== 0 ? ((usageChange / creditData.usage.lastMonth) * 100).toFixed(1) : "N/A"

  return (
    <Card className="flex flex-col justify-center h-full">
      <CardContent className="py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 ">
              <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData.balance}</div>
              {creditData.lastPurchase && (
                <p className="text-xs text-muted-foreground">
                  Last purchase: {creditData.lastPurchase.amount} credits on{" "}
                  {new Date(creditData.lastPurchase.date).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usage This Month</CardTitle>
              {usageChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creditData.usage.thisMonth}</div>
              <p className="text-xs text-muted-foreground">
                {usageChange >= 0 ? "+" : ""}
                {usageChangePercentage}% from last month
              </p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}

