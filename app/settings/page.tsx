import type { Metadata } from "next"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AccountSettings from "./account-settings"
import NotificationSettings from "./notification-settings"

export const metadata: Metadata = {
  title: "Settings | Voisa",
  description: "Manage your account settings",
}

export default function SettingsPage() {
  return (
    <AuthenticatedLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <Tabs defaultValue="account" className="space-y-4">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <AccountSettings />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </AuthenticatedLayout>
  )
}

