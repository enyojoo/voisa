import type { Metadata } from "next"
import RegisterForm from "./register-form"
import { Logo } from "@/components/logo"

export const metadata: Metadata = {
  title: "Register | Voisa",
  description: "Create a new Voisa account",
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        
        <Logo className="mx-auto mb-8" />
        <RegisterForm />
      </div>
    </div>
  )
}

