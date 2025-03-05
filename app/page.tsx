import { Button } from "@/components/ui/button"
import { PhoneCall, MessageSquare, Globe, ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import UnauthenticatedLayout from "@/components/unauthenticated-layout"

export default function Home() {
  return (
    <UnauthenticatedLayout>
      <div className="flex flex-col">
        {/* Hero Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-br from-purple-600 to-indigo-700 dark:from-purple-900 dark:to-indigo-900">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-12">
              <div className="flex flex-col justify-center items-center lg:items-start text-center lg:text-left space-y-4 max-w-[600px]">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl lg:text-5xl text-white">
                    Global Communication Made Simple
                  </h1>
                  <p className="text-white/90 dark:text-white/80 md:text-xl">
                    Purchase virtual phone numbers, make calls, and send SMS worldwide with our easy-to-use platform.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href="/login">
                    <Button
                      size="lg"
                      className="bg-white text-purple-600 hover:bg-gray-100 dark:bg-purple-200 dark:text-purple-800 dark:hover:bg-purple-300"
                    >
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="relative w-full max-w-[500px] h-[400px] rounded-lg overflow-hidden shadow-xl">
                <Image
                  src="https://images.pexels.com/photos/8424887/pexels-photo-8424887.jpeg"
                  alt="Person using smartphone"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-purple-600 dark:text-purple-400">
                  Everything You Need for Global Communication
                </h2>
                <p className="max-w-[900px] text-gray-600 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                  Our platform provides all the tools you need to communicate globally with ease.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mt-12">
              {[
                {
                  icon: Globe,
                  title: "Global Numbers",
                  description: "Purchase virtual phone numbers from over 50 countries worldwide.",
                },
                {
                  icon: PhoneCall,
                  title: "Voice Calls",
                  description: "Make and receive calls at competitive rates with crystal-clear quality.",
                },
                {
                  icon: MessageSquare,
                  title: "SMS Messaging",
                  description: "Send and receive SMS messages globally with reliable delivery.",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center space-y-2 rounded-lg border p-6 shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700 transition-all duration-200 hover:shadow-md hover:scale-105"
                >
                  <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-900">
                    <feature.icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{feature.title}</h3>
                  <p className="text-center text-gray-600 dark:text-gray-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-white dark:bg-gray-800">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-purple-600 dark:text-purple-400">
                  How It Works
                </h2>
                <p className="max-w-[900px] text-gray-600 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                  Get started with our platform in just a few simple steps.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3 mt-12">
              {[
                {
                  step: 1,
                  title: "Create an Account",
                  description: "Sign up for a free account to get started with our platform.",
                },
                {
                  step: 2,
                  title: "Purchase a Number",
                  description: "Browse and select from our wide range of virtual phone numbers.",
                },
                {
                  step: 3,
                  title: "Start Communicating",
                  description: "Buy credits and start making calls and sending sms messages.",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center space-y-2 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:scale-105"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600 text-xl font-bold text-white">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{item.title}</h3>
                  <p className="text-center text-gray-600 dark:text-gray-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-purple-600 dark:bg-purple-900">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl text-white">
                  Ready to Get Started?
                </h2>
                <p className="max-w-[900px] text-white/90 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Join thousands of users who trust our platform for their global communication needs.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="bg-white text-purple-600 hover:bg-gray-100 dark:bg-purple-200 dark:text-purple-800 dark:hover:bg-purple-300"
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </UnauthenticatedLayout>
  )
}

