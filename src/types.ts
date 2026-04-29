export type ViewId =
  | 'discover'
  | 'bookings'
  | 'messages'
  | 'payments'
  | 'support'
  | 'admin'
  | 'profile'

export type Scope = 'local' | 'global'

export type ServiceMode = 'online' | 'in-person' | 'hybrid'

export type BookingStatus = 'Pending' | 'Confirmed' | 'Completed'

export type PaymentStatus = 'Held in escrow' | 'Released' | 'Pending verification'

export type ComplaintStatus = 'Open' | 'Investigating' | 'Resolved'

export type NotificationTone = 'info' | 'success' | 'alert'

export type SkillListing = {
  id: string
  title: string
  category: string
  description: string
  price: number
  unit: string
  mode: ServiceMode
  tags: string[]
}

export type Profile = {
  id: string
  name: string
  headline: string
  city: string
  email: string
  phone: string
  about: string
  wallet: number
  verified: boolean
  role: 'member' | 'admin'
  evidence: string[]
  interests: string[]
  availability: string[]
  listings: SkillListing[]
}

export type Provider = {
  id: string
  name: string
  headline: string
  city: string
  coverage: string[]
  bio: string
  deliveryModes: ServiceMode[]
  rating: number
  reviewCount: number
  responseTime: string
  completedJobs: number
  trustBadges: string[]
  evidence: string[]
  availability: string[]
  listings: SkillListing[]
  featured: boolean
}

export type Review = {
  id: string
  providerId: string
  providerName: string
  author: string
  rating: number
  text: string
  verified: boolean
  serviceTitle: string
  createdAt: string
}

export type Booking = {
  id: string
  providerId: string
  providerName: string
  listingId: string
  serviceTitle: string
  date: string
  time: string
  location: string
  amount: number
  status: BookingStatus
  note: string
}

export type DirectMessage = {
  id: string
  contactId: string
  contactName: string
  direction: 'inbound' | 'outbound'
  text: string
  timestamp: string
}

export type Notification = {
  id: string
  title: string
  body: string
  tone: NotificationTone
  createdAt: string
  read: boolean
}

export type Payment = {
  id: string
  bookingId: string
  providerName: string
  amount: number
  fee: number
  method: string
  status: PaymentStatus
  createdAt: string
}

export type SupportMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

export type Complaint = {
  id: string
  topic: string
  message: string
  status: ComplaintStatus
  createdAt: string
  source: 'chatbot' | 'manual'
}

export type AppState = {
  currentUser: Profile
  providers: Provider[]
  reviews: Review[]
  bookings: Booking[]
  messages: DirectMessage[]
  notifications: Notification[]
  payments: Payment[]
  supportMessages: SupportMessage[]
  complaints: Complaint[]
}
