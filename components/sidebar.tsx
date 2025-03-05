"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Phone, MessageSquare, User, Settings, Book } from "lucide-react"
import { Logo } from "./logo"

const navItems = [
  { href: "/dashboard", icon: User, label: "Dash" },
  { href: "/calls", icon: Phone, label: "Phone" },
  { href: "/sms", icon: MessageSquare, label: "SMS" },
  { href: "/contacts", icon: Book, label: "Contacts" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-background border-r h-screen">
      <div className="flex items-center h-16 border-b px-4">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
      </div>
      <nav className="p-4 space-y-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start transition-colors duration-200",
                pathname === item.href ? "text-primary font-bold" : "text-muted-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "mr-2 h-4 w-4",
                  pathname === item.href
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-primary transition-colors duration-200",
                )}
              />
              <span className="group-hover:text-primary transition-colors duration-200">{item.label}</span>
            </Button>
          </Link>
        ))}
      </nav>
    </div>
  )
}

