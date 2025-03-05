import type { Metadata } from "next"
import UnauthenticatedLayout from "@/components/unauthenticated-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Terms of Service | Voisa",
  description: "Voisa Terms of Service",
}

export default function TermsPage() {
  return (
    <UnauthenticatedLayout>
      <div className="container mx-auto py-8">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Terms of Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose dark:prose-invert">
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing or using the Voisa service, you agree to be bound by these Terms of Service. If you do not
                agree to these terms, please do not use our service.
              </p>

              <h2>2. Description of Service</h2>
              <p>
                Voisa provides virtual phone numbers and communication services. We reserve the right to modify or
                discontinue any part of our service at any time.
              </p>

              <h2>3. User Responsibilities</h2>
              <p>
                You are responsible for maintaining the confidentiality of your account information and for all
                activities that occur under your account.
              </p>

              <h2>4. Privacy Policy</h2>
              <p>
                Your use of Voisa is also governed by our Privacy Policy, which can be found{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  here
                </a>
                .
              </p>

              <h2>5. Limitations of Liability</h2>
              <p>
                Voisa shall not be liable for any indirect, incidental, special, consequential or punitive damages
                resulting from your use of the service.
              </p>

              <h2>6. Changes to Terms</h2>
              <p>
                We reserve the right to update these Terms of Service at any time. We will notify users of any
                significant changes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </UnauthenticatedLayout>
  )
}

