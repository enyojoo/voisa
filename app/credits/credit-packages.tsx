"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, CreditCard } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { purchaseCredits } from "@/lib/api"

interface CreditPackage {
  id: string
  name: string
  credits: number
  price: number
  popular?: boolean
  features: string[]
}

export default function CreditPackages() {
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([])
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const fetchCreditPackages = async () => {
      try {
        // TODO: Replace this with an actual API call when available
        // const response = await getCreditPackages()
        // setCreditPackages(response.data.data)

        // For now, we'll use mock data
        setCreditPackages([
          {
            id: "basic",
            name: "Basic",
            credits: 100,
            price: 10,
            features: [
              "100 credits",
              "Valid for 30 days",
              "Make up to 50 minutes of calls",
              "Send up to 100 SMS messages",
            ],
          },
          {
            id: "standard",
            name: "Standard",
            credits: 500,
            price: 45,
            popular: true,
            features: [
              "500 credits",
              "Valid for 60 days",
              "Make up to 250 minutes of calls",
              "Send up to 500 SMS messages",
              "10% bonus credits",
            ],
          },
          {
            id: "premium",
            name: "Premium",
            credits: 1000,
            price: 80,
            features: [
              "1000 credits",
              "Valid for 90 days",
              "Make up to 500 minutes of calls",
              "Send up to 1000 SMS messages",
              "20% bonus credits",
              "Priority support",
            ],
          },
        ])
      } catch (error) {
        console.error("Error fetching credit packages:", error)
        toast({
          title: "Error",
          description: "Failed to load credit packages. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchCreditPackages()
  }, [toast])

  const handlePurchase = async (packageId: string) => {
    setSelectedPackage(packageId)
    try {
      const response = await purchaseCredits(packageId, 1) // Assuming 1 as the amount for now
      toast({
        title: "Purchase Successful",
        description: "Credits have been added to your account.",
      })
      router.push("/dashboard")
    } catch (error) {
      console.error("Error purchasing credits:", error)
      toast({
        title: "Purchase Failed",
        description: "There was an error purchasing credits. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSelectedPackage(null)
    }
  }

  if (isLoading) {
    return <div>Loading credit packages...</div>
  }

  return (
    <div id="credit-packages" className="grid gap-6 md:grid-cols-3">
      {creditPackages.map((pkg) => (
        <Card key={pkg.id} className={`${pkg.popular ? "border-primary" : ""} flex flex-col h-full`}>
          <div className="flex-grow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{pkg.name}</CardTitle>
                  <CardDescription>
                    {pkg.credits} credits for ${pkg.price.toFixed(2)}
                  </CardDescription>
                </div>
                {pkg.popular && <Badge variant="secondary">Popular</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${pkg.price.toFixed(2)}</div>
              <p className="text-sm text-muted-foreground mt-1">${(pkg.price / pkg.credits).toFixed(3)} per credit</p>
              <ul className="mt-4 space-y-2">
                {pkg.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </div>
          <CardFooter className="mt-auto">
            <Button className="w-full" onClick={() => handlePurchase(pkg.id)} disabled={selectedPackage === pkg.id}>
              {selectedPackage === pkg.id ? (
                "Processing..."
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Purchase
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

