"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Header from "@/components/header"
import Sidebar from "@/components/sidebar"
import { useAuth } from "@/lib/auth-provider"

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const authenticatedRoutes = ["/dashboard", "/numbers", "/calls", "/sms", "/credits", "/settings", "/contacts"]
  const isAuthenticatedRoute = authenticatedRoutes.some((route) => pathname.startsWith(route))

  useEffect(() => {
    if (!loading && !user && isAuthenticatedRoute) {
      router.push("/login")
    }
  }, [user, loading, isAuthenticatedRoute, router])

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user || !isAuthenticatedRoute) {
    return <>{children}</>
  }

  return (
    <div className="fixed inset-0 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto p-4">{children}</div>
        </main>
      </div>
    </div>
  )
}

