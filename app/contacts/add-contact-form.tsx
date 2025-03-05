"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { addContact } from "@/lib/api"

export default function AddContactForm({ onContactAdded }: { onContactAdded?: () => void }) {
  const [name, setName] = useState("")
  const [number, setNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !number) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      await addContact(name, number)
      toast({
        title: "Contact Added",
        description: `${name} has been added to your contacts.`,
      })
      setName("")
      setNumber("")

      // If a callback was provided, call it to refresh the contact list
      if (onContactAdded) {
        onContactAdded()
      }
    } catch (error: any) {
      console.error("Error adding contact:", error)
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to add contact. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Contact</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter contact name"
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="number">Phone Number</Label>
            <Input
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Enter phone number"
              required
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Contact"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

