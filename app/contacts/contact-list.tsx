"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { User, Search, Edit, Trash2 } from "lucide-react"
import { getUserContacts, deleteContact, updateContact } from "@/lib/api"
import type { ContactDto } from "@/types/api"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function ContactList({ onContactUpdated }: { onContactUpdated?: () => void }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [contacts, setContacts] = useState<ContactDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [contactToDelete, setContactToDelete] = useState<string | null>(null)
  const [contactToEdit, setContactToEdit] = useState<ContactDto | null>(null)
  const [editName, setEditName] = useState("")
  const [editNumber, setEditNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchContacts()
  }, [])

  const fetchContacts = async () => {
    setIsLoading(true)
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
      setIsLoading(false)
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    try {
      await deleteContact(contactId)
      setContacts((prevContacts) => prevContacts.filter((contact) => contact.id !== contactId))
      toast({
        title: "Success",
        description: "Contact deleted successfully.",
      })
      if (onContactUpdated) {
        onContactUpdated()
      }
    } catch (error) {
      console.error("Error deleting contact:", error)
      toast({
        title: "Error",
        description: "Failed to delete contact. Please try again.",
        variant: "destructive",
      })
    } finally {
      setContactToDelete(null)
    }
  }

  const handleEditContact = (contact: ContactDto) => {
    setContactToEdit(contact)
    setEditName(contact.name)
    setEditNumber(contact.number)
  }

  const handleSaveEdit = async () => {
    if (!contactToEdit) return

    setIsSubmitting(true)
    try {
      await updateContact(contactToEdit.id, editName, editNumber)
      setContacts((prevContacts) =>
        prevContacts.map((contact) =>
          contact.id === contactToEdit.id ? { ...contact, name: editName, number: editNumber } : contact,
        ),
      )
      toast({
        title: "Success",
        description: "Contact updated successfully.",
      })
      setContactToEdit(null)
      if (onContactUpdated) {
        onContactUpdated()
      }
    } catch (error) {
      console.error("Error updating contact:", error)
      toast({
        title: "Error",
        description: "Failed to update contact. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredContacts = contacts.filter(
    (contact) => contact.name.toLowerCase().includes(searchTerm.toLowerCase()) || contact.number.includes(searchTerm),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact List</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">Loading contacts...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? "No contacts match your search" : "No contacts found. Add your first contact!"}
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {filteredContacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="bg-primary text-primary-foreground p-2 rounded-full">
                      <User size={24} />
                    </div>
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.number}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEditContact(contact)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setContactToDelete(contact.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the contact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contactToDelete && handleDeleteContact(contactToDelete)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!contactToEdit} onOpenChange={(open) => !open && setContactToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Make changes to your contact here. Click save when you're done.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input id="name" value={editName} onChange={(e) => setEditName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="number" className="text-right">
                Number
              </Label>
              <Input
                id="number"
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

