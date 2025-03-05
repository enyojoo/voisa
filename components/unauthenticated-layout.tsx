"use client"

import type React from "react"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-provider"
import { Button } from "@/components/ui/button"
import { Logo } from "./logo"

export default function UnauthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()

  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(pathname)

  const HeaderLogo = () => (
    <Link href="/" className="flex items-center">
      <Logo />
    </Link>
  )

  const Header = () => (
    <header className="bg-background border-b">
      <div className="flex items-center justify-between h-16 w-full px-4 md:px-6 lg:px-8">
        <div className="flex items-center">
          <HeaderLogo />
        </div>
        <nav>
          {user ? (
            <Link href="/dashboard">
              <Button variant="ghost">Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="mr-2">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button>Sign Up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )

  const Footer = () => (
    <footer className="bg-background border-t">
      <div className="flex items-center justify-between h-16 w-full px-4 md:px-6 lg:px-8">
        <span className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Voisa. All rights reserved.
        </span>
        <nav>
          <Link href="/terms" className="text-sm text-muted-foreground hover:underline mr-4">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm text-muted-foreground hover:underline">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  )
}

