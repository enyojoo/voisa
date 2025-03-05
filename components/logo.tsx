"use client"

import Image from "next/image"
import { useTheme } from "next-themes"

interface LogoProps {
  className?: string
}

export function Logo({ className = "" }: LogoProps) {
  const { theme } = useTheme()

  const logoUrl =
    theme === "dark"
      ? "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Voisa-nPYEm3hQtROjdtuAoRS3l9Roxb1YTp.svg"
      : "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Voisa%20purple-8CV0xhSdHxNyq3SDzC38OvTXQ23qhl.svg"

  return (
    <div className={`relative w-28 h-10 ${className}`}>
      <Image
        src={logoUrl || "/placeholder.svg"}
        alt="Voisa Logo"
        fill
        className="object-contain"
        onError={(e) => {
          e.currentTarget.src = "/fallback-logo.png"
          console.error("Error loading logo:", e)
        }}
      />
    </div>
  )
}

