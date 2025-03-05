import type { Metadata } from "next"
import UnauthenticatedLayout from "@/components/unauthenticated-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/logo"

export const metadata: Metadata = {
  title: "Verify Email | Voisa",
  description: "Verify your email address for your Voisa account",
}

export default function VerifyEmailPage() {
  return (
    <UnauthenticatedLayout>
      <div className="container flex h-screen w-screen flex-col items-center justify-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <Logo className="mx-auto mb-4" />
            <h1 className="text-2xl font-semibold tracking-tight">Check Your Email</h1>
            <p className="text-sm text-muted-foreground">We've sent you a verification link</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Email Verification</CardTitle>
              <CardDescription>Please check your email to verify your account</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                We've sent a verification link to your email address. Please click on the link to verify your account
                and complete the registration process.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                If you don't see the email in your inbox, please check your spam folder.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </UnauthenticatedLayout>
  )
}

