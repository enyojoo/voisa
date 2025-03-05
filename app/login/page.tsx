import type { Metadata } from "next"
import LoginForm from "./login-form"
import Link from "next/link"
import { Logo } from "@/components/logo"

export const metadata: Metadata = {
  title: "Login | Voisa",
  description: "Log in to your Voisa account",
}

export default function LoginPage() {
  return (
     <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        
        <Logo className="mx-auto mb-4" />
        <LoginForm />
        
      </div>
    </div>
  )
}

