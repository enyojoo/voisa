import axios from "axios"

const API_BASE_URL = "https://voisa-gdeug5aegkefgtbq.swedencentral-01.azurewebsites.net/api"

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Add a request interceptor to include the JWT token in the headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token")
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// Add a response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // Unauthorized: Clear token and redirect to login
          localStorage.removeItem("token")
          window.location.href = "/login"
          break
        case 403:
          // Forbidden: Show an error message
          console.error("You do not have permission to access this resource")
          break
        default:
          console.error("An error occurred:", error.response.data)
      }
    } else if (error.request) {
      console.error("No response received:", error.request)
    } else {
      console.error("Error setting up request:", error.message)
    }
    return Promise.reject(error)
  },
)

// Authentication
export const login = (email: string, password: string) => api.post("/auth/login", { email, password })
export const register = (name: string, email: string, password: string) =>
  api.post("/auth/register", { name, email, password })

// Phone Numbers
export const getUserPhoneNumbers = () => api.get("/phone-numbers")
export const getUserActivePhoneNumbers = () => api.get("/phone-numbers/active")
export const purchasePhoneNumber = (availableNumberId: string) =>
  api.post("/phone-numbers/purchase", { availableNumberId })
export const renewPhoneNumber = (phoneNumberId: string) => api.post(`/phone-numbers/${phoneNumberId}/renew`)
export const deactivatePhoneNumber = (phoneNumberId: string) => api.post(`/phone-numbers/${phoneNumberId}/deactivate`)

// Credits
export const getUserCreditHistory = () => api.get("/credits/history")
export const getUserCreditBalance = () => api.get("/credits/balance")
export const purchaseCredits = (packageId: string, amount: number) =>
  api.post("/credits/purchase", { packageId, amount })

// SMS
export const getUserSMSHistory = () => api.get("/sms/history")
export const getUserSentSMSHistory = () => api.get("/sms/history/sent")
export const getUserReceivedSMSHistory = () => api.get("/sms/history/received")
export const sendSMS = (fromNumberId: string, toNumbers: string[], message: string) =>
  api.post("/sms/send", { fromNumberId, toNumbers, message })
export const getSMSHistoryByDateRange = (start: string, end: string) =>
  api.get("/sms/history/date-range", { params: { start, end } })

// Calls
export const getUserCallHistory = () => api.get("/calls/history")
export const getUserOutgoingCallHistory = () => api.get("/calls/history/outgoing")
export const getUserIncomingCallHistory = () => api.get("/calls/history/incoming")
export const makeCall = (fromNumberId: string, toNumber: string) => api.post("/calls/make", { fromNumberId, toNumber })
export const getCallHistoryByDateRange = (start: string, end: string) =>
  api.get("/calls/history/date-range", { params: { start, end } })

// Contacts
export const getUserContacts = () => api.get("/contacts")
export const addContact = (name: string, number: string) => api.post("/contacts", { name, number })
export const updateContact = (contactId: string, name: string, number: string) =>
  api.put(`/contacts/${contactId}`, { name, number })
export const deleteContact = (contactId: string) => api.delete(`/contacts/${contactId}`)

// Available Phone Numbers
export const searchAvailableNumbers = (country: string, areaCode?: string, limit = 10) =>
  api.get("/available-numbers/search", { params: { country, areaCode, limit } })
export const getAvailableNumbersByCountry = (country: string) => api.get(`/available-numbers/country/${country}`)
export const searchAvailableNumbersByPattern = (country: string, pattern: string) =>
  api.get(`/available-numbers/search/${country}/${pattern}`)

// Health Check
export const checkApiHealth = () => api.get("/health")

// Dashboard
export const getDashboardOverview = () => api.get("/dashboard/overview")
export const getDashboardCreditUsage = () => api.get("/dashboard/credit-usage")
export const getDashboardActivity = () => api.get("/dashboard/activity")

export default api

