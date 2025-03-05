import type { Metadata } from "next"
import ForgotPasswordForm from "./forgot-password-form"
import Link from "next/link"
import { Logo } from "@/components/logo"

export const metadata: Metadata = {
  title: "Forgot Password | Voisa",
  description: "Reset your Voisa account password",
}

export default function ForgotPasswordPage() {
  return (
     <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
       
          <Logo className="mx-auto mb-4" />
        <ForgotPasswordForm />
        <p className="px-8 text-center text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-brand underline underline-offset-4">
            Remember your password? Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

