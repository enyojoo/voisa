"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShoppingCart, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { purchasePhoneNumber } from "@/lib/api"
import type { AvailablePhoneNumberDto } from "@/types/api"

interface PhoneNumberListProps {
  availableNumbers: AvailablePhoneNumberDto[]
  onPurchaseSuccess: () => void
}

export default function PhoneNumberList({ availableNumbers, onPurchaseSuccess }: PhoneNumberListProps) {
  const [purchasingNumber, setPurchasingNumber] = useState<string | null>(null)
  const { toast } = useToast()

  const handlePurchase = async (numberDto: AvailablePhoneNumberDto) => {
    setPurchasingNumber(numberDto.id)
    try {
      await purchasePhoneNumber(numberDto.id)
      toast({
        title: "Success",
        description: `Successfully purchased number ${numberDto.number}`,
      })
      onPurchaseSuccess()
    } catch (error) {
      console.error("Error purchasing number:", error)
      toast({
        title: "Error",
        description: "Failed to purchase the number. Please try again.",
        variant: "destructive",
      })
    } finally {
      setPurchasingNumber(null)
    }
  }

  if (availableNumbers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No available numbers found. Try a different search.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Available Numbers</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {availableNumbers.map((number) => (
              <TableRow key={number.id}>
                <TableCell className="font-medium">{number.number}</TableCell>
                <TableCell>{number.country}</TableCell>
                <TableCell>{number.type}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {number.features.map((feature) => (
                      <Badge key={feature} variant="outline">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>${number.price.toFixed(2)}/month</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Info className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View number details</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button onClick={() => handlePurchase(number)} disabled={purchasingNumber === number.id}>
                      {purchasingNumber === number.id ? (
                        "Purchasing..."
                      ) : (
                        <>
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Purchase
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

