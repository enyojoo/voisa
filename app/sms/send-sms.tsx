"use client"

import type React from "react"

import { useState, useCallback, useEffect } from "react"
import { X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-provider"
import { Badge } from "@/components/ui/badge"
import { getUserActivePhoneNumbers, sendSMS } from "@/lib/api"
import type { PhoneNumberDto } from "@/types/api"

export default function SendSMS({ onSMSSent }: { onSMSSent: () => void }) {
  const [fromNumber, setFromNumber] = useState("")
  const [toNumbers, setToNumbers] = useState<string[]>([])
  const [currentInput, setCurrentInput] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [userNumbers, setUserNumbers] = useState<PhoneNumberDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    const fetchUserNumbers = async () => {
      try {
        const response = await getUserActivePhoneNumbers()
        setUserNumbers(response.data.data)
      } catch (error) {
        console.error("Error fetching user numbers:", error)
        toast({
          title: "Error",
          description: "Failed to fetch your phone numbers. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserNumbers()
  }, [toast])

  const handleAddNumber = useCallback(
    (number: string) => {
      if (number.trim() && !toNumbers.includes(number.trim())) {
        setToNumbers((prev) => [...prev, number.trim()])
        setCurrentInput("")
      }
    },
    [toNumbers],
  )

  const handleRemoveNumber = useCallback((number: string) => {
    setToNumbers((prev) => prev.filter((n) => n !== number))
  }, [])

  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fromNumber || toNumbers.length === 0 || !message) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      })
      return
    }

    setSending(true)

    try {
      await sendSMS(fromNumber, toNumbers, message)
      toast({
        title: "SMS Sent",
        description: "Your message has been sent successfully.",
      })
      setToNumbers([])
      setMessage("")
      onSMSSent() // Call the callback when SMS is sent successfully
    } catch (error) {
      console.error("Error sending SMS:", error)
      toast({
        title: "Error",
        description: "Failed to send SMS. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Send SMS</CardTitle>
          <CardDescription>Please log in to send SMS messages.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Send SMS</CardTitle>
          <CardDescription>Loading your phone numbers...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send SMS</CardTitle>
        <CardDescription>Send SMS messages using your virtual phone numbers.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSendSMS} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="from" className="text-sm font-medium">
              From
            </label>
            <Select value={fromNumber} onValueChange={setFromNumber}>
              <SelectTrigger id="from">
                <SelectValue placeholder="Select a number" />
              </SelectTrigger>
              <SelectContent>
                {userNumbers.map((num) => (
                  <SelectItem key={num.id} value={num.id}>
                    {num.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="to" className="text-sm font-medium">
              To
            </label>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md">
              {toNumbers.map((number) => (
                <Badge key={number} variant="secondary" className="gap-1">
                  {number}
                  <button type="button" onClick={() => handleRemoveNumber(number)} className="ml-1 text-xs">
                    <X size={12} />
                  </button>
                </Badge>
              ))}
              <Input
                id="to"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "," || e.key === "Enter") {
                    e.preventDefault()
                    handleAddNumber(currentInput)
                  }
                }}
                onBlur={() => handleAddNumber(currentInput)}
                className="flex-grow border-none shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">
              Message
            </label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/160 characters</p>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSendSMS}
          disabled={sending || !fromNumber || toNumbers.length === 0 || !message}
          className="w-full"
        >
          {sending ? "Sending..." : "Send SMS"}
        </Button>
      </CardFooter>
    </Card>
  )
}

