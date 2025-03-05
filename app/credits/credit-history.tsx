"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-provider"
import { getUserCreditHistory } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import type { CreditDto } from "@/types/api"

export default function CreditHistory() {
  const [creditHistory, setCreditHistory] = useState<CreditDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    const fetchCreditHistory = async () => {
      if (!user) return

      try {
        const response = await getUserCreditHistory()
        setCreditHistory(response.data.data)
      } catch (error) {
        console.error("Error fetching credit history:", error)
        toast({
          title: "Error",
          description: "Failed to load credit history. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchCreditHistory()
  }, [user, toast])

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit History</CardTitle>
          <CardDescription>Please log in to view your credit history.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit History</CardTitle>
          <CardDescription>Loading your credit history...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case "PURCHASE":
        return "bg-green-500"
      case "USAGE":
        return "bg-red-500"
      case "BONUS":
        return "bg-blue-500"
      case "REFUND":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit History</CardTitle>
        <CardDescription>View your credit purchase and usage history.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creditHistory.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{new Date(transaction.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge className={getTransactionTypeColor(transaction.transactionType)}>
                    {transaction.transactionType}
                  </Badge>
                </TableCell>
                <TableCell>{transaction.description}</TableCell>
                <TableCell className="text-right">
                  <span className={transaction.amount > 0 ? "text-green-600" : "text-red-600"}>
                    {transaction.amount > 0 ? "+" : ""}
                    {transaction.amount}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

