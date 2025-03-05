"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

export default function NotificationSettings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [pushNotifications, setPushNotifications] = useState(true)
  const { toast } = useToast()

  const handleSave = () => {
    // Here you would typically save the notification settings to your backend
    console.log("Saving notification settings:", { emailNotifications, smsNotifications, pushNotifications })
    toast({
      title: "Settings Saved",
      description: "Your notification settings have been updated successfully.",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
        <CardDescription>Manage how you receive notifications</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
              <span>Email Notifications</span>
              <span className="font-normal text-sm text-muted-foreground">Receive notifications via email</span>
            </Label>
            <Switch id="email-notifications" checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sms-notifications" className="flex flex-col space-y-1">
              <span>SMS Notifications</span>
              <span className="font-normal text-sm text-muted-foreground">Receive notifications via SMS</span>
            </Label>
            <Switch id="sms-notifications" checked={smsNotifications} onCheckedChange={setSmsNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
              <span>Push Notifications</span>
              <span className="font-normal text-sm text-muted-foreground">
                Receive push notifications on your devices
              </span>
            </Label>
            <Switch id="push-notifications" checked={pushNotifications} onCheckedChange={setPushNotifications} />
          </div>
        </div>
        <Button onClick={handleSave} className="mt-6">
          Save Settings
        </Button>
      </CardContent>
    </Card>
  )
}

