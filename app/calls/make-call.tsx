"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-provider"
import { Phone, Mic, MicOff, Delete, PhoneOff, Pause, Play, Book } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getUserActivePhoneNumbers, makeCall, getUserContacts } from "@/lib/api"
import type { PhoneNumberDto, ContactDto } from "@/types/api"

const dialPad = [
  { number: "1", letters: "" },
  { number: "2", letters: "ABC" },
  { number: "3", letters: "DEF" },
  { number: "4", letters: "GHI" },
  { number: "5", letters: "JKL" },
  { number: "6", letters: "MNO" },
  { number: "7", letters: "PQRS" },
  { number: "8", letters: "TUV" },
  { number: "9", letters: "WXYZ" },
  { number: "*", letters: "" },
  { number: "0", letters: "+" },
  { number: "#", letters: "" },
]

export default function MakeCall() {
  const [fromNumber, setFromNumber] = useState("")
  const [toNumber, setToNumber] = useState("")
  const [isCalling, setIsCalling] = useState(false)
  const [isCallConnected, setIsCallConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [contacts, setContacts] = useState<ContactDto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()
  const [userNumbers, setUserNumbers] = useState<PhoneNumberDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingContacts, setIsLoadingContacts] = useState(true)

  useEffect(() => {
    const fetchUserNumbers = async () => {
      try {
        const response = await getUserActivePhoneNumbers()
        setUserNumbers(response.data.data)
      } catch (error) {
        console.error("Error fetching user numbers:", error)
        toast({
          title: "Error",
          description: "Failed to fetch your phone numbers. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchUserNumbers()
    }
  }, [user, toast])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isCallConnected && !isOnHold) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isCallConnected, isOnHold])

  useEffect(() => {
    const handleCloseDialog = () => setIsDialogOpen(false)
    document.addEventListener("close-dialog", handleCloseDialog)
    return () => {
      document.removeEventListener("close-dialog", handleCloseDialog)
    }
  }, [])

  useEffect(() => {
    const fetchContacts = async () => {
      if (!user) return

      try {
        const response = await getUserContacts()
        setContacts(response.data.data)
      } catch (error) {
        console.error("Error fetching contacts:", error)
        toast({
          title: "Error",
          description: "Failed to load contacts. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingContacts(false)
      }
    }

    fetchContacts()
  }, [user, toast])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleMakeCall = async () => {
    if (!fromNumber || !toNumber) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      })
      return
    }

    setIsCalling(true)

    try {
      const response = await makeCall(fromNumber, toNumber)
      setIsCallConnected(true)
      toast({
        title: "Call Connected",
        description: `Connected to ${toNumber}`,
      })
    } catch (error) {
      console.error("Error making call:", error)
      toast({
        title: "Error",
        description: "Failed to initiate call. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCalling(false)
    }
  }

  const handleEndCall = () => {
    setIsCallConnected(false)
    setCallDuration(0)
    setIsMuted(false)
    setIsOnHold(false)
    toast({
      title: "Call Ended",
      description: `Call duration: ${formatTime(callDuration)}`,
    })
  }

  const handleSelectContact = (number: string) => {
    setToNumber(number)
  }

  const filteredContacts = contacts.filter(
    (contact) => contact.name.toLowerCase().includes(searchTerm.toLowerCase()) || contact.number.includes(searchTerm),
  )

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6">Please log in to make calls.</CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">Loading your phone numbers...</CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full h-full">
      <CardContent className="p-6 h-full flex flex-col justify-between">
        <div className="space-y-6 flex-grow">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Select value={fromNumber} onValueChange={setFromNumber} disabled={isCallConnected || isCalling}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a number to call from" />
                </SelectTrigger>
                <SelectContent>
                  {userNumbers.map((num) => (
                    <SelectItem key={num.id} value={num.number}>
                      {num.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={isCallConnected}>
                          <Book className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isCallConnected ? "Phone book is not available during a call" : "Open phone book"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Phone Book</DialogTitle>
                  </DialogHeader>
                  <div className="mb-4">
                    <Input
                      placeholder="Search contacts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-[300px]">
                    {isLoadingContacts ? (
                      <div className="flex justify-center items-center h-full">
                        <p>Loading contacts...</p>
                      </div>
                    ) : filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-2 hover:bg-muted rounded-lg cursor-pointer"
                          onClick={() => {
                            handleSelectContact(contact.number)
                            setIsDialogOpen(false)
                          }}
                        >
                          <div>
                            <p className="font-medium">{contact.name}</p>
                            <p className="text-sm text-muted-foreground">{contact.number}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-center items-center h-full">
                        <p>No contacts found</p>
                      </div>
                    )}
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>

            <div className="relative">
              <div className="text-3xl text-center font-light min-h-[48px] py-2">
                {toNumber || "Enter phone number"}
              </div>
              {toNumber && !isCallConnected && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10"
                  onClick={() => setToNumber((prev) => prev.slice(0, -1))}
                >
                  <Delete className="h-6 w-6" />
                </Button>
              )}
            </div>

            {isCallConnected && (
              <div className="text-center space-y-1">
                <div className="text-sm text-muted-foreground">{isOnHold ? "Call on hold" : "Call in progress"}</div>
                <div className="text-2xl font-semibold text-primary">{formatTime(callDuration)}</div>
              </div>
            )}
          </div>

          {!isCallConnected && (
            <div className="grid grid-cols-3 gap-4 flex-grow">
              {dialPad.map((key) => (
                <Button
                  key={key.number}
                  variant="ghost"
                  className="h-16 text-center p-0"
                  onClick={() => setToNumber((prev) => prev + key.number)}
                  disabled={isCalling}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-light">{key.number}</span>
                    {key.letters && <span className="text-xs text-muted-foreground mt-1">{key.letters}</span>}
                  </div>
                </Button>
              ))}
            </div>
          )}

          <div className={cn("grid gap-4 mt-auto", isCallConnected ? "grid-cols-3" : "grid-cols-1")}>
            {isCallConnected ? (
              <>
                <Button
                  variant={isMuted ? "default" : "outline"}
                  onClick={() => setIsMuted(!isMuted)}
                  className={cn(
                    "flex flex-col items-center py-4 h-24 transition-all duration-200 hover:scale-105",
                    isMuted && "bg-primary text-primary-foreground",
                  )}
                >
                  <div className={cn("rounded-full p-3 mb-2", isMuted ? "bg-primary-foreground/20" : "bg-primary/10")}>
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </div>
                  <span className="text-sm font-medium">{isMuted ? "Unmute" : "Mute"}</span>
                </Button>
                <Button
                  variant={isOnHold ? "default" : "outline"}
                  onClick={() => setIsOnHold(!isOnHold)}
                  className={cn(
                    "flex flex-col items-center py-4 h-24 transition-all duration-200 hover:scale-105",
                    isOnHold && "bg-primary text-primary-foreground",
                  )}
                >
                  <div className={cn("rounded-full p-3 mb-2", isOnHold ? "bg-primary-foreground/20" : "bg-primary/10")}>
                    {isOnHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </div>
                  <span className="text-sm font-medium">{isOnHold ? "Resume" : "Hold"}</span>
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleEndCall}
                  className="flex flex-col items-center py-4 h-24 transition-all duration-200 hover:scale-105 hover:bg-red-600"
                >
                  <div className="rounded-full bg-destructive-foreground/20 p-3 mb-2">
                    <PhoneOff className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium">End Call</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={handleMakeCall}
                disabled={isCalling || !toNumber || !fromNumber}
                className="h-15 text-lg bg-primary hover:bg-primary/90 transition-all duration-200 hover:scale-105"
              >
                {isCalling ? (
                  "Calling..."
                ) : (
                  <>
                    <div className="rounded-full bg-primary-foreground/20 p-2 mr-2">
                      <Phone className="h-5 w-5" />
                    </div>
                    <span className="text-lg font-medium">Call</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

