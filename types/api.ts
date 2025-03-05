export interface PhoneNumberDto {
  id: string
  number: string
  country: string
  status: string
  expiresAt: string
  features: string[]
  createdAt: string
}

export interface CreditDto {
  id: string
  amount: number
  transactionType: string
  description: string
  createdAt: string
}

export interface SMSDto {
  id: string
  fromNumber: string
  toNumber: string
  message: string
  status: string
  direction: string
  cost: number
  createdAt: string
  updatedAt: string
}

export interface CallDto {
  id: string
  fromNumber: string
  toNumber: string
  status: string
  direction: string
  duration: number
  cost: number
  createdAt: string
  updatedAt: string
}

export interface ContactDto {
  id: string
  name: string
  number: string
  createdAt: string
  updatedAt: string
}

export interface AvailablePhoneNumberDto {
  id: string
  number: string
  country: string
  type: string
  price: number
  features: string[]
}

