import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import './App.css'
import skillswapLogo from './assets/skillswap-logo.png'
import { createSeedState } from './data'
import type {
  AppState,
  Booking,
  ComplaintStatus,
  NotificationTone,
  Profile,
  Provider,
  Scope,
  ServiceMode,
  ViewId,
} from './types'
import {
  averageRating,
  buildSupportReply,
  computeCompletionRate,
  computeEscrowHeld,
  computeProcessedVolume,
  computeReleasedVolume,
  createId,
  currency,
  formatDateLabel,
  formatTimestamp,
  rankProviders,
  summarizeCategoryCounts,
  summarizeComplaintCounts,
} from './utils'

const STORAGE_KEY = 'skillswap-demo-state'

const VIEW_META: Record<
  ViewId,
  { label: string; eyebrow: string; title: string; copy: string }
> = {
  discover: {
    label: 'Discover',
    eyebrow: 'Marketplace',
    title: 'Find the right skill fast.',
    copy:
      'Search, compare, and choose a provider without digging through complicated screens.',
  },
  bookings: {
    label: 'Book',
    eyebrow: 'Scheduling',
    title: 'Book a service.',
    copy:
      'Pick a provider, choose a time, and keep the booking process simple from request to completion.',
  },
  messages: {
    label: 'Messages',
    eyebrow: 'Messaging',
    title: 'Message your provider.',
    copy:
      'Ask questions, share details, and keep everything in one clear conversation thread.',
  },
  payments: {
    label: 'Payments',
    eyebrow: 'Payments',
    title: 'Pay securely.',
    copy:
      'Hold payments safely, see the total clearly, and track what has been paid or released.',
  },
  support: {
    label: 'Support',
    eyebrow: 'Support AI',
    title: 'Get help quickly.',
    copy:
      'Use the chatbot for quick answers or open a support case when something needs attention.',
  },
  admin: {
    label: 'Admin',
    eyebrow: 'Admin + Analytics',
    title: 'See platform activity.',
    copy:
      'Review bookings, payments, ratings, and support trends in a single dashboard.',
  },
  profile: {
    label: 'Profile',
    eyebrow: 'Profile',
    title: 'Set up your profile.',
    copy:
      'Add your details, list your skills, and show proof so people can trust what you offer.',
  },
}

const GET_STARTED_STEPS: Array<{
  step: string
  title: string
  description: string
  view: ViewId
}> = [
  {
    step: '1',
    title: 'Set up your profile',
    description: 'Add your contact details, skills, and proof so people know what you offer.',
    view: 'profile',
  },
  {
    step: '2',
    title: 'Find the right person',
    description: 'Search locally or online, compare reviews, and choose the best provider.',
    view: 'discover',
  },
  {
    step: '3',
    title: 'Book and pay',
    description: 'Request a booking, confirm the session, and pay through protected escrow.',
    view: 'bookings',
  },
]

const SUPPORT_SHORTCUTS = [
  'I need a refund for a payment that feels wrong.',
  'My provider was late and I need to reschedule.',
  'How do I message a provider about a booking?',
  'A review on a profile feels suspicious.',
]

type AuthDraft = Pick<Profile, 'name' | 'email' | 'phone' | 'headline'>

type ProfileDraft = {
  city: string
  about: string
  interests: string
  availability: string
  evidence: string
}

type ListingDraft = {
  title: string
  category: string
  description: string
  price: string
  unit: string
  mode: ServiceMode
  tags: string
}

type BookingDraft = {
  providerId: string
  listingId: string
  date: string
  time: string
  note: string
}

type PaymentDraft = {
  bookingId: string
  method: string
}

type ReviewDraft = {
  providerId: string
  rating: number
  text: string
}

function loadState() {
  if (typeof window === 'undefined') {
    return createSeedState()
  }

  const cached = window.localStorage.getItem(STORAGE_KEY)

  if (!cached) {
    return createSeedState()
  }

  try {
    return JSON.parse(cached) as AppState
  } catch {
    return createSeedState()
  }
}

function makeAuthDraft(user: Profile): AuthDraft {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone,
    headline: user.headline,
  }
}

function makeProfileDraft(user: Profile): ProfileDraft {
  return {
    city: user.city,
    about: user.about,
    interests: user.interests.join(', '),
    availability: user.availability.join(', '),
    evidence: user.evidence.join('\n'),
  }
}

function makeListingDraft(): ListingDraft {
  return {
    title: '',
    category: 'Strategy',
    description: '',
    price: '65',
    unit: '/ session',
    mode: 'online',
    tags: '',
  }
}

function makeBookingDraft(provider?: Provider): BookingDraft {
  return {
    providerId: provider?.id ?? '',
    listingId: provider?.listings[0]?.id ?? '',
    date: '2026-05-10',
    time: '18:30',
    note: '',
  }
}

function makePaymentDraft(state: AppState): PaymentDraft {
  const firstEligible = state.bookings.find(
    (booking) => !state.payments.some((payment) => payment.bookingId === booking.id),
  )

  return {
    bookingId: firstEligible?.id ?? state.bookings[0]?.id ?? '',
    method: 'Skillswap balance',
  }
}

function makeReviewDraft(providerId: string): ReviewDraft {
  return {
    providerId,
    rating: 5,
    text: '',
  }
}

function splitList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [activeView, setActiveView] = useState<ViewId>('discover')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('local')
  const [category, setCategory] = useState('All')
  const [modeFilter, setModeFilter] = useState<'all' | ServiceMode>('all')
  const [selectedProviderId, setSelectedProviderId] = useState(state.providers[0]?.id ?? '')
  const [authDraft, setAuthDraft] = useState<AuthDraft>(makeAuthDraft(state.currentUser))
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(makeProfileDraft(state.currentUser))
  const [listingDraft, setListingDraft] = useState<ListingDraft>(makeListingDraft())
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(
    makeBookingDraft(state.providers[0]),
  )
  const [messageContactId, setMessageContactId] = useState(state.providers[0]?.id ?? '')
  const [messageText, setMessageText] = useState('')
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(makePaymentDraft(state))
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(
    makeReviewDraft(state.providers[0]?.id ?? ''),
  )
  const [supportDraft, setSupportDraft] = useState('')
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const categories = [
    'All',
    ...new Set(state.providers.flatMap((provider) => provider.listings.map((listing) => listing.category))),
  ]

  const safeSelectedProviderId = state.providers.some(
    (provider) => provider.id === selectedProviderId,
  )
    ? selectedProviderId
    : state.providers[0]?.id ?? ''

  const safeMessageContactId = state.providers.some((provider) => provider.id === messageContactId)
    ? messageContactId
    : state.providers[0]?.id ?? ''

  const safeReviewProviderId = state.providers.some(
    (provider) => provider.id === reviewDraft.providerId,
  )
    ? reviewDraft.providerId
    : state.providers[0]?.id ?? ''

  const safeBookingProviderId = state.providers.some(
    (provider) => provider.id === bookingDraft.providerId,
  )
    ? bookingDraft.providerId
    : state.providers[0]?.id ?? ''

  const rankedProviders = rankProviders({
    providers: state.providers,
    query: deferredQuery,
    scope,
    city: state.currentUser.city,
    category,
    modeFilter,
  })

  const selectedMatch =
    rankedProviders.find((match) => match.provider.id === safeSelectedProviderId) ??
    rankedProviders[0]

  const selectedProvider = selectedMatch?.provider

  const selectedListing =
    selectedProvider?.listings.find((listing) => listing.id === selectedMatch.listing.id) ??
    selectedProvider?.listings[0]

  const currentConversation = state.messages
    .filter((message) => message.contactId === safeMessageContactId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))

  const conversationContacts = [...state.providers]
    .map((provider) => {
      const messages = state.messages
        .filter((message) => message.contactId === provider.id)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      const lastMessage = messages[messages.length - 1]

      return {
        provider,
        lastMessage,
      }
    })
    .sort((left, right) => {
      const leftStamp = left.lastMessage?.timestamp ?? ''
      const rightStamp = right.lastMessage?.timestamp ?? ''
      return rightStamp.localeCompare(leftStamp)
    })

  const unreadCount = state.notifications.filter((notification) => !notification.read).length
  const averageReviewScore = averageRating(state.reviews)
  const completionRate = computeCompletionRate(state.bookings)
  const totalListings =
    state.providers.reduce((sum, provider) => sum + provider.listings.length, 0) +
    state.currentUser.listings.length
  const totalEscrow = computeEscrowHeld(state.payments)
  const processedVolume = computeProcessedVolume(state.payments)
  const releasedVolume = computeReleasedVolume(state.payments)
  const resolutionRate =
    state.complaints.length === 0
      ? 0
      : state.complaints.filter((complaint) => complaint.status === 'Resolved').length /
        state.complaints.length
  const trustScore = Math.round((averageReviewScore / 5) * 60 + resolutionRate * 40)
  const availableWallet = Math.max(
    0,
    state.currentUser.wallet -
      state.payments.reduce((sum, payment) => sum + payment.amount + payment.fee, 0),
  )
  const categorySummary = summarizeCategoryCounts(state.providers)
  const complaintSummary = summarizeComplaintCounts(state.complaints)
  const selectedProviderReviews = state.reviews.filter(
    (review) => review.providerId === selectedProvider?.id,
  )
  const selectedBookingProvider = state.providers.find(
    (provider) => provider.id === safeBookingProviderId,
  )
  const selectedBookingListing =
    selectedBookingProvider?.listings.find((listing) => listing.id === bookingDraft.listingId) ??
    selectedBookingProvider?.listings[0]
  const eligibleBookings = state.bookings.filter(
    (booking) => !state.payments.some((payment) => payment.bookingId === booking.id),
  )
  const safePaymentBookingId =
    state.bookings.some((booking) => booking.id === paymentDraft.bookingId) && paymentDraft.bookingId
      ? paymentDraft.bookingId
      : eligibleBookings[0]?.id ?? ''
  const selectedPaymentBooking =
    state.bookings.find((booking) => booking.id === safePaymentBookingId) ?? eligibleBookings[0]
  const selectedPaymentTotal = selectedPaymentBooking
    ? selectedPaymentBooking.amount + Math.round(selectedPaymentBooking.amount * 0.08)
    : 0
  const viewMeta = VIEW_META[activeView]

  function addNotification(title: string, body: string, tone: NotificationTone = 'info') {
    return {
      id: createId('notification'),
      title,
      body,
      tone,
      createdAt: new Date().toISOString(),
      read: false,
    }
  }

  function jumpToView(nextView: ViewId) {
    startTransition(() => {
      setActiveView(nextView)
    })
  }

  function focusProvider(provider: Provider, nextView?: ViewId) {
    setSelectedProviderId(provider.id)
    setBookingDraft((current) => ({
      ...current,
      providerId: provider.id,
      listingId: provider.listings[0]?.id ?? '',
    }))
    setMessageContactId(provider.id)
    setReviewDraft((current) => ({
      ...current,
      providerId: provider.id,
    }))

    if (nextView) {
      jumpToView(nextView)
    }
  }

  function ensureConversation(provider: Provider) {
    setState((current) => {
      if (current.messages.some((message) => message.contactId === provider.id)) {
        return current
      }

      return {
        ...current,
        messages: [
          ...current.messages,
          {
            id: createId('message'),
            contactId: provider.id,
            contactName: provider.name,
            direction: 'inbound',
            text: `Hi Maya, I can help with ${provider.listings[0]?.title.toLowerCase() ?? 'this request'}. Share your goal and I will tailor the session.`,
            timestamp: new Date().toISOString(),
          },
        ],
      }
    })
  }

  function resetDemo() {
    const fresh = createSeedState()
    setState(fresh)
    setActiveView('discover')
    setQuery('')
    setScope('local')
    setCategory('All')
    setModeFilter('all')
    setSelectedProviderId(fresh.providers[0]?.id ?? '')
    setBookingDraft(makeBookingDraft(fresh.providers[0]))
    setMessageContactId(fresh.providers[0]?.id ?? '')
    setPaymentDraft(makePaymentDraft(fresh))
    setReviewDraft(makeReviewDraft(fresh.providers[0]?.id ?? ''))
    setSupportDraft('')
    setMessageText('')
    setListingDraft(makeListingDraft())
    setAuthDraft(makeAuthDraft(fresh.currentUser))
    setProfileDraft(makeProfileDraft(fresh.currentUser))
  }

  function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setState((current) => ({
      ...current,
      currentUser: {
        ...current.currentUser,
        ...authDraft,
      },
      notifications: [
        addNotification(
          'Account details updated',
          'Your email, phone, and public headline are now refreshed across the app.',
          'success',
        ),
        ...current.notifications,
      ],
    }))
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setState((current) => ({
      ...current,
      currentUser: {
        ...current.currentUser,
        city: profileDraft.city,
        about: profileDraft.about,
        interests: splitList(profileDraft.interests),
        availability: splitList(profileDraft.availability),
        evidence: splitList(profileDraft.evidence),
      },
      notifications: [
        addNotification(
          'Profile refreshed',
          'Your profile, trust evidence, and availability are now up to date.',
          'success',
        ),
        ...current.notifications,
      ],
    }))
  }

  function handleListingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!listingDraft.title.trim() || !listingDraft.description.trim()) {
      return
    }

    const nextListing = {
      id: createId('my-listing'),
      title: listingDraft.title.trim(),
      category: listingDraft.category.trim(),
      description: listingDraft.description.trim(),
      price: Number(listingDraft.price),
      unit: listingDraft.unit.trim() || '/ session',
      mode: listingDraft.mode,
      tags: splitList(listingDraft.tags),
    }

    setState((current) => ({
      ...current,
      currentUser: {
        ...current.currentUser,
        listings: [nextListing, ...current.currentUser.listings],
      },
      notifications: [
        addNotification(
          'New skill listing created',
          `${nextListing.title} is now visible inside your storefront draft.`,
          'success',
        ),
        ...current.notifications,
      ],
    }))
    setListingDraft(makeListingDraft())
  }

  function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedBookingProvider || !selectedBookingListing) {
      return
    }

    const location =
      selectedBookingListing.mode === 'online'
        ? 'Online session'
        : selectedBookingListing.mode === 'hybrid'
          ? `${state.currentUser.city} or online`
          : state.currentUser.city

    setState((current) => ({
      ...current,
      bookings: [
        {
          id: createId('booking'),
          providerId: selectedBookingProvider.id,
          providerName: selectedBookingProvider.name,
          listingId: selectedBookingListing.id,
          serviceTitle: selectedBookingListing.title,
          date: bookingDraft.date,
          time: bookingDraft.time,
          location,
          amount: selectedBookingListing.price,
          status: 'Pending',
          note: bookingDraft.note.trim(),
        },
        ...current.bookings,
      ],
      notifications: [
        addNotification(
          'Booking request sent',
          `${selectedBookingProvider.name} received your request for ${selectedBookingListing.title}.`,
          'success',
        ),
        ...current.notifications,
      ],
    }))

    setBookingDraft((current) => ({
      ...current,
      date: '2026-05-12',
      time: '18:30',
      note: '',
    }))
  }

  function updateBookingStatus(bookingId: string, status: Booking['status']) {
    setState((current) => ({
      ...current,
      bookings: current.bookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              status,
            }
          : booking,
      ),
      notifications: [
        addNotification(
          status === 'Confirmed' ? 'Appointment confirmed' : 'Booking marked complete',
          status === 'Confirmed'
            ? 'The schedule is locked in and ready for payment protection.'
            : 'This booking is complete and can now release escrow if needed.',
          'info',
        ),
        ...current.notifications,
      ],
    }))
  }

  function releaseEscrow(bookingId: string) {
    setState((current) => ({
      ...current,
      payments: current.payments.map((payment) =>
        payment.bookingId === bookingId && payment.status === 'Held in escrow'
          ? {
              ...payment,
              status: 'Released',
            }
          : payment,
      ),
      notifications: [
        addNotification(
          'Escrow released',
          'Funds were released after the booking was marked complete.',
          'success',
        ),
        ...current.notifications,
      ],
    }))
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const provider = state.providers.find((item) => item.id === safeMessageContactId)

    if (!provider || !messageText.trim()) {
      return
    }

    setState((current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('message'),
          contactId: provider.id,
          contactName: provider.name,
          direction: 'outbound',
          text: messageText.trim(),
          timestamp: new Date().toISOString(),
        },
      ],
      notifications: [
        addNotification(
          'Message sent',
          `Your note to ${provider.name} is now in the Skillswap inbox.`,
          'info',
        ),
        ...current.notifications,
      ],
    }))
    setMessageText('')
  }

  function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedPaymentBooking) {
      return
    }

    const fee = Math.round(selectedPaymentBooking.amount * 0.08)

    setState((current) => ({
      ...current,
      payments: [
        {
          id: createId('payment'),
          bookingId: selectedPaymentBooking.id,
          providerName: selectedPaymentBooking.providerName,
          amount: selectedPaymentBooking.amount,
          fee,
          method: paymentDraft.method,
          status: 'Held in escrow',
          createdAt: new Date().toISOString(),
        },
        ...current.payments,
      ],
      notifications: [
        addNotification(
          'Payment secured in escrow',
          `${currency(selectedPaymentBooking.amount)} is protected until the service is completed.`,
          'success',
        ),
        ...current.notifications,
      ],
    }))
    setPaymentDraft({
      bookingId:
        eligibleBookings.find((booking) => booking.id !== selectedPaymentBooking.id)?.id ?? '',
      method: paymentDraft.method,
    })
  }

  function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const provider = state.providers.find((item) => item.id === safeReviewProviderId)

    if (!provider || !reviewDraft.text.trim()) {
      return
    }

    const completedBooking = state.bookings.find(
      (booking) =>
        booking.providerId === provider.id &&
        booking.status === 'Completed' &&
        booking.listingId === provider.listings.find((listing) => listing.id === booking.listingId)?.id,
    )

    setState((current) => ({
      ...current,
      reviews: [
        {
          id: createId('review'),
          providerId: provider.id,
          providerName: provider.name,
          author: current.currentUser.name,
          rating: reviewDraft.rating,
          text: reviewDraft.text.trim(),
          verified: Boolean(completedBooking),
          serviceTitle:
            completedBooking?.serviceTitle ?? provider.listings[0]?.title ?? 'Skillswap service',
          createdAt: new Date().toISOString(),
        },
        ...current.reviews,
      ],
      notifications: [
        addNotification(
          'Review posted',
          `Your feedback for ${provider.name} is now live on their profile.`,
          'success',
        ),
        ...current.notifications,
      ],
    }))
    setReviewDraft((current) => ({
      ...current,
      rating: 5,
      text: '',
    }))
  }

  function sendSupportPrompt(message: string) {
    if (!message.trim()) {
      return
    }

    const resolution = buildSupportReply(message)

    setState((current) => ({
      ...current,
      supportMessages: [
        ...current.supportMessages,
        {
          id: createId('support'),
          role: 'user',
          text: message.trim(),
        },
        {
          id: createId('support'),
          role: 'assistant',
          text: resolution.reply,
        },
      ],
      complaints: resolution.topic
        ? [
            {
              id: createId('complaint'),
              topic: resolution.topic,
              message: message.trim(),
              status: 'Investigating',
              createdAt: new Date().toISOString(),
              source: 'chatbot',
            },
            ...current.complaints,
          ]
        : current.complaints,
      notifications: resolution.topic
        ? [
            addNotification(
              'Support case opened',
              `The chatbot escalated a ${resolution.topic.toLowerCase()} complaint for admin review.`,
              'alert',
            ),
            ...current.notifications,
          ]
        : current.notifications,
    }))
    setSupportDraft('')
  }

  function handleSupportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    sendSupportPrompt(supportDraft)
  }

  function updateComplaintStatus(complaintId: string, status: ComplaintStatus) {
    setState((current) => ({
      ...current,
      complaints: current.complaints.map((complaint) =>
        complaint.id === complaintId
          ? {
              ...complaint,
              status,
            }
          : complaint,
      ),
    }))
  }

  function markAllNotificationsRead() {
    setState((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    }))
  }

  function renderDiscoverView() {
    return (
      <>
        <section className="surface surface--hero">
          <div className="hero-copy">
            <span className="eyebrow">Start here</span>
            <h2>Tell Skillswap what you need.</h2>
            <p>
              Use the search box, pick local or global, and Skillswap will show the clearest
              matches first.
            </p>
          </div>

          <form
            className="hero-filters"
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <label className="field">
              <span>What do you need help with?</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try portfolio review, React coach, Spanish practice, CPR..."
              />
            </label>

            <div className="inline-fields">
              <div className="segmented-control">
                <button
                  type="button"
                  className={scope === 'local' ? 'is-active' : ''}
                  onClick={() => setScope('local')}
                >
                  Local
                </button>
                <button
                  type="button"
                  className={scope === 'global' ? 'is-active' : ''}
                  onClick={() => setScope('global')}
                >
                  Global
                </button>
              </div>

              <label className="field field--compact">
                <span>Mode</span>
                <select
                  value={modeFilter}
                  onChange={(event) => setModeFilter(event.target.value as 'all' | ServiceMode)}
                >
                  <option value="all">All modes</option>
                  <option value="online">Online</option>
                  <option value="in-person">In person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
            </div>

            <div className="chip-row">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === category ? 'chip is-active' : 'chip'}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </form>
        </section>

        <section className="metric-grid">
          <MetricCard label="Live listings" value={String(totalListings)} detail="Services people can book right now" />
          <MetricCard
            label="Average rating"
            value={`${averageReviewScore.toFixed(1)} / 5`}
            detail="Based on customer reviews"
          />
          <MetricCard label="Escrow protected" value={currency(totalEscrow)} detail="Funds safely held for active jobs" />
          <MetricCard label="Trust score" value={`${trustScore}%`} detail="Ratings and support quality combined" />
        </section>

        <Surface eyebrow="How it works" title="Three simple steps">
          <div className="step-grid">
            {GET_STARTED_STEPS.map((item) => (
              <button
                key={item.step}
                type="button"
                className="step-card"
                onClick={() => jumpToView(item.view)}
              >
                <span className="step-card__number">{item.step}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </button>
            ))}
          </div>
        </Surface>

        <div className="view-grid view-grid--discover">
          <Surface
            eyebrow="Top result"
            title={selectedProvider ? selectedProvider.name : 'No provider found'}
            aside={
              selectedMatch ? (
                <span className="score-pill">{selectedMatch.confidence}% fit</span>
              ) : undefined
            }
          >
            {selectedProvider && selectedListing ? (
              <div className="spotlight">
                <div>
                  <p className="spotlight__headline">{selectedProvider.headline}</p>
                  <p className="muted">
                    {selectedProvider.city} • {selectedProvider.responseTime} response time •{' '}
                    {selectedProvider.completedJobs} jobs completed
                  </p>
                  <div className="badge-row">
                    {selectedProvider.trustBadges.map((badge) => (
                      <span key={badge} className="badge">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="callout-box">
                  <p className="callout-box__label">{selectedListing.title}</p>
                  <p className="callout-box__price">
                    {currency(selectedListing.price)}
                    <span>{selectedListing.unit}</span>
                  </p>
                  <p>{selectedListing.description}</p>
                </div>

                <div className="reason-list">
                  {selectedMatch.reasons.map((reason) => (
                    <div key={reason} className="reason-list__item">
                      {reason}
                    </div>
                  ))}
                </div>

                <div className="stack-inline">
                  <button type="button" className="button" onClick={() => focusProvider(selectedProvider, 'bookings')}>
                    Book now
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      ensureConversation(selectedProvider)
                      focusProvider(selectedProvider, 'messages')
                    }}
                  >
                    Ask a question
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No matches yet"
                body="Try a broader category, switch to global, or clear the search query."
              />
            )}
          </Surface>

          <Surface eyebrow="Reviews" title="What customers said">
            {selectedProviderReviews.length > 0 ? (
              <div className="stack-list">
                {selectedProviderReviews.slice(0, 3).map((review) => (
                  <article key={review.id} className="review-card">
                    <div className="stack-inline stack-inline--spread">
                      <strong>{review.author}</strong>
                      <StatusBadge tone={review.verified ? 'success' : 'info'}>
                        {review.verified ? 'Verified' : 'Open profile review'}
                      </StatusBadge>
                    </div>
                    <p className="muted">
                      {review.serviceTitle} • {review.rating}/5
                    </p>
                    <p>{review.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Reviews will appear here"
                body="Choose a provider with feedback or add a review from the bookings view."
              />
            )}
          </Surface>
        </div>

        <Surface eyebrow="Browse" title="Available providers">
          {rankedProviders.length > 0 ? (
            <div className="provider-grid">
              {rankedProviders.map((match) => (
                <article
                  key={match.provider.id}
                  className={
                    match.provider.id === safeSelectedProviderId
                      ? 'provider-card provider-card--selected'
                      : 'provider-card'
                  }
                >
                  <div className="stack-inline stack-inline--spread">
                    <div>
                      <h3>{match.provider.name}</h3>
                      <p className="muted">{match.provider.headline}</p>
                    </div>
                    <span className="score-pill">{match.confidence}% fit</span>
                  </div>

                  <p className="muted">
                    {match.provider.city} • {match.provider.rating.toFixed(1)} stars •{' '}
                    {match.provider.reviewCount} reviews
                  </p>
                  <p>{match.listing.title}</p>
                  <p className="muted">{match.listing.description}</p>

                  <div className="badge-row">
                    {match.listing.tags.map((tag) => (
                      <span key={tag} className="badge badge--soft">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="stack-inline stack-inline--spread provider-card__footer">
                    <div>
                      <strong>{currency(match.listing.price)}</strong>
                      <span className="muted"> {match.listing.unit}</span>
                    </div>
                    <div className="stack-inline">
                      <button type="button" className="button button--ghost" onClick={() => setSelectedProviderId(match.provider.id)}>
                        See details
                      </button>
                      <button type="button" className="button" onClick={() => focusProvider(match.provider, 'bookings')}>
                        Book
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No providers matched the current filters"
              body="Switch from local to global, broaden the mode filter, or try another keyword."
              action={
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setQuery('')
                    setCategory('All')
                    setModeFilter('all')
                  }}
                >
                  Clear filters
                </button>
              }
            />
          )}
        </Surface>
      </>
    )
  }

  function renderBookingsView() {
    return (
      <div className="view-grid">
        <Surface eyebrow="Book a session" title="Create a booking">
          <form className="form-grid" onSubmit={handleBookingSubmit}>
            <label className="field">
              <span>Provider</span>
              <select
                value={safeBookingProviderId}
                onChange={(event) =>
                  setBookingDraft({
                    ...bookingDraft,
                    providerId: event.target.value,
                    listingId:
                      state.providers.find((provider) => provider.id === event.target.value)?.listings[0]
                        ?.id ?? '',
                  })
                }
              >
                {state.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Service</span>
              <select
                value={bookingDraft.listingId}
                onChange={(event) =>
                  setBookingDraft({
                    ...bookingDraft,
                    listingId: event.target.value,
                  })
                }
              >
                {selectedBookingProvider?.listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="inline-fields">
              <label className="field">
                <span>Date</span>
                <input
                  type="date"
                  value={bookingDraft.date}
                  onChange={(event) =>
                    setBookingDraft({
                      ...bookingDraft,
                      date: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Time</span>
                <input
                  type="time"
                  value={bookingDraft.time}
                  onChange={(event) =>
                    setBookingDraft({
                      ...bookingDraft,
                      time: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Notes</span>
              <textarea
                rows={4}
                value={bookingDraft.note}
                onChange={(event) =>
                  setBookingDraft({
                    ...bookingDraft,
                    note: event.target.value,
                  })
                }
                placeholder="Describe the goal, materials, or what success looks like."
              />
            </label>

            <div className="callout-box">
              <p className="callout-box__label">Estimated total</p>
              <p className="callout-box__price">
                {currency(selectedBookingListing?.price ?? 0)}
                <span>{selectedBookingListing?.unit ?? ''}</span>
              </p>
              <p>
                Availability: {selectedBookingProvider?.availability.join(', ') ?? 'Provider schedule pending'}
              </p>
            </div>

            <button type="submit" className="button">
              Request booking
            </button>
          </form>
        </Surface>

        <Surface eyebrow="Your bookings" title="Upcoming and completed">
          <div className="stack-list">
            {state.bookings.map((booking) => {
              const payment = state.payments.find((item) => item.bookingId === booking.id)

              return (
                <article key={booking.id} className="activity-card">
                  <div className="stack-inline stack-inline--spread">
                    <div>
                      <h3>{booking.serviceTitle}</h3>
                      <p className="muted">
                        {booking.providerName} • {formatDateLabel(booking.date, booking.time)}
                      </p>
                    </div>
                    <StatusBadge tone={booking.status === 'Completed' ? 'success' : 'info'}>
                      {booking.status}
                    </StatusBadge>
                  </div>
                  <p>{booking.location}</p>
                  {booking.note ? <p className="muted">{booking.note}</p> : null}
                  <div className="stack-inline stack-inline--spread">
                    <strong>{currency(booking.amount)}</strong>
                    <div className="stack-inline">
                      {booking.status === 'Pending' ? (
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => updateBookingStatus(booking.id, 'Confirmed')}
                        >
                          Confirm
                        </button>
                      ) : null}
                      {booking.status !== 'Completed' ? (
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => updateBookingStatus(booking.id, 'Completed')}
                        >
                          Mark complete
                        </button>
                      ) : null}
                      {booking.status === 'Completed' && payment?.status === 'Held in escrow' ? (
                        <button type="button" className="button" onClick={() => releaseEscrow(booking.id)}>
                          Release escrow
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </Surface>

        <Surface eyebrow="Leave feedback" title="Add a review">
          <form className="form-grid" onSubmit={handleReviewSubmit}>
            <label className="field">
              <span>Provider</span>
              <select
                value={safeReviewProviderId}
                onChange={(event) =>
                  setReviewDraft({
                    ...reviewDraft,
                    providerId: event.target.value,
                  })
                }
              >
                {state.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Rating</span>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={reviewDraft.rating}
                onChange={(event) =>
                  setReviewDraft({
                    ...reviewDraft,
                    rating: Number(event.target.value),
                  })
                }
              />
              <strong>{reviewDraft.rating} / 5</strong>
            </label>

            <label className="field">
              <span>Feedback</span>
              <textarea
                rows={4}
                value={reviewDraft.text}
                onChange={(event) =>
                  setReviewDraft({
                    ...reviewDraft,
                    text: event.target.value,
                  })
                }
                placeholder="Share what went well, what could improve, and why you would recommend them."
              />
            </label>

            <button type="submit" className="button">
              Publish review
            </button>
          </form>
        </Surface>

        <Surface eyebrow="Booking summary" title="What needs attention">
          <div className="mini-stat-grid">
            <MiniStat label="Completion rate" value={`${Math.round(completionRate * 100)}%`} />
            <MiniStat
              label="Confirmed this week"
              value={String(state.bookings.filter((booking) => booking.status === 'Confirmed').length)}
            />
            <MiniStat
              label="Pending requests"
              value={String(state.bookings.filter((booking) => booking.status === 'Pending').length)}
            />
            <MiniStat label="Escrow eligible" value={currency(totalEscrow)} />
          </div>
        </Surface>
      </div>
    )
  }

  function renderMessagesView() {
    return (
      <div className="messages-layout">
        <Surface eyebrow="Choose a provider" title="Messages">
          <div className="contact-list">
            {conversationContacts.map(({ provider, lastMessage }) => (
              <button
                key={provider.id}
                type="button"
                className={
                  provider.id === safeMessageContactId
                    ? 'contact-button is-active'
                    : 'contact-button'
                }
                onClick={() => {
                  ensureConversation(provider)
                  setMessageContactId(provider.id)
                }}
              >
                <strong>{provider.name}</strong>
                <span>{provider.headline}</span>
                <small>{lastMessage?.text ?? 'Start a new conversation'}</small>
              </button>
            ))}
          </div>
        </Surface>

        <Surface
          eyebrow="Conversation"
          title={
            state.providers.find((provider) => provider.id === safeMessageContactId)?.name ??
            'Inbox'
          }
        >
          <div className="message-thread">
            {currentConversation.length > 0 ? (
              currentConversation.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.direction === 'outbound'
                      ? 'message-bubble message-bubble--outbound'
                      : 'message-bubble'
                  }
                >
                  <p>{message.text}</p>
                  <small>{formatTimestamp(message.timestamp)}</small>
                </div>
              ))
            ) : (
              <EmptyState
                title="No conversation yet"
                body="Pick a provider and send the first note. Their replies will stay attached to the profile and booking history."
              />
            )}
          </div>

          <form className="message-composer" onSubmit={handleSendMessage}>
            <textarea
              rows={4}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Ask about scope, share materials, or confirm scheduling details."
            />
            <div className="stack-inline stack-inline--spread">
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  setMessageText(
                    `Here are the times I am free: ${state.currentUser.availability.join(', ')}.`,
                  )
                }
              >
                Insert availability
              </button>
              <button type="submit" className="button">
                Send message
              </button>
            </div>
          </form>
        </Surface>
      </div>
    )
  }

  function renderPaymentsView() {
    return (
      <div className="view-grid">
        <section className="metric-grid metric-grid--payments">
          <MetricCard label="Available wallet" value={currency(availableWallet)} detail="After current platform charges" />
          <MetricCard label="Escrow held" value={currency(totalEscrow)} detail="Protected until completion" />
          <MetricCard label="Released payouts" value={currency(releasedVolume)} detail="Successfully delivered value" />
          <MetricCard label="Processed volume" value={currency(processedVolume)} detail="Total service value on-platform" />
        </section>

        <Surface eyebrow="Pay for a booking" title="Checkout">
          {selectedPaymentBooking ? (
            <form className="form-grid" onSubmit={handlePaymentSubmit}>
              <label className="field">
                <span>Booking</span>
                <select
                  value={safePaymentBookingId}
                  onChange={(event) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      bookingId: event.target.value,
                    })
                  }
                >
                  {eligibleBookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.providerName} • {booking.serviceTitle}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Payment method</span>
                <select
                  value={paymentDraft.method}
                  onChange={(event) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      method: event.target.value,
                    })
                  }
                >
                  <option>Skillswap balance</option>
                  <option>Visa ending 2408</option>
                  <option>Bank transfer</option>
                </select>
              </label>

              <div className="callout-box">
                <p className="callout-box__label">Charge summary</p>
                <p className="callout-box__price">
                  {currency(selectedPaymentTotal)}
                  <span>including platform fee</span>
                </p>
                <p>
                  Service: {currency(selectedPaymentBooking.amount)} • Fee:{' '}
                  {currency(Math.round(selectedPaymentBooking.amount * 0.08))}
                </p>
              </div>

              <button type="submit" className="button">
                Hold payment in escrow
              </button>
            </form>
          ) : (
            <EmptyState
              title="No unpaid bookings"
              body="Every booking already has payment coverage. Create another booking to test the flow."
            />
          )}
        </Surface>

        <Surface eyebrow="Payment history" title="Recent transactions">
          <div className="stack-list">
            {state.payments.map((payment) => (
              <article key={payment.id} className="activity-card">
                <div className="stack-inline stack-inline--spread">
                  <div>
                    <h3>{payment.providerName}</h3>
                    <p className="muted">{formatTimestamp(payment.createdAt)}</p>
                  </div>
                  <StatusBadge tone={payment.status === 'Released' ? 'success' : 'info'}>
                    {payment.status}
                  </StatusBadge>
                </div>
                <p>
                  {currency(payment.amount)} service value • {currency(payment.fee)} platform fee
                </p>
                <p className="muted">{payment.method}</p>
              </article>
            ))}
          </div>
        </Surface>

        <Surface eyebrow="How it works" title="Why payments stay safe">
          <div className="stack-list">
            <article className="activity-card">
              <h3>Escrow-aware release</h3>
              <p>Funds stay protected until the booking is confirmed complete or support intervenes.</p>
            </article>
            <article className="activity-card">
              <h3>Transparent fees</h3>
              <p>Platform fees are displayed before payment so providers and customers see the split.</p>
            </article>
            <article className="activity-card">
              <h3>Tax and audit trail</h3>
              <p>Every payment stays tied to a provider, service, and booking timestamp for reporting.</p>
            </article>
          </div>
        </Surface>
      </div>
    )
  }

  function renderSupportView() {
    return (
      <div className="view-grid">
        <Surface eyebrow="Ask for help" title="Support assistant">
          <div className="message-thread message-thread--support">
            {state.supportMessages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'message-bubble message-bubble--outbound'
                    : 'message-bubble'
                }
              >
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className="chip-row">
            {SUPPORT_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut}
                type="button"
                className="chip"
                onClick={() => sendSupportPrompt(shortcut)}
              >
                {shortcut}
              </button>
            ))}
          </div>

          <form className="message-composer" onSubmit={handleSupportSubmit}>
            <textarea
              rows={4}
              value={supportDraft}
              onChange={(event) => setSupportDraft(event.target.value)}
              placeholder="Describe the complaint, account issue, payment concern, or scheduling problem."
            />
            <div className="stack-inline stack-inline--spread">
              <span className="muted">Frequent complaints automatically feed the admin queue.</span>
              <button type="submit" className="button">
                Ask the chatbot
              </button>
            </div>
          </form>
        </Surface>

        <Surface eyebrow="Common issues" title="Top support topics">
          <div className="stack-list">
            {complaintSummary.map((item) => (
              <BarRow key={item.label} label={item.label} value={item.value} max={complaintSummary[0]?.value ?? 1} />
            ))}
          </div>
          <div className="mini-stat-grid">
            <MiniStat label="Open cases" value={String(state.complaints.filter((complaint) => complaint.status !== 'Resolved').length)} />
            <MiniStat label="Resolution rate" value={`${Math.round(resolutionRate * 100)}%`} />
            <MiniStat label="Unread alerts" value={String(unreadCount)} />
            <MiniStat label="Escalated by bot" value={String(state.complaints.filter((complaint) => complaint.source === 'chatbot').length)} />
          </div>
        </Surface>

        <Surface eyebrow="Open cases" title="Support case tracker">
          <div className="stack-list">
            {state.complaints.map((complaint) => (
              <article key={complaint.id} className="activity-card">
                <div className="stack-inline stack-inline--spread">
                  <div>
                    <h3>{complaint.topic}</h3>
                    <p className="muted">
                      {formatTimestamp(complaint.createdAt)} • {complaint.source}
                    </p>
                  </div>
                  <StatusBadge tone={complaint.status === 'Resolved' ? 'success' : 'alert'}>
                    {complaint.status}
                  </StatusBadge>
                </div>
                <p>{complaint.message}</p>
              </article>
            ))}
          </div>
        </Surface>
      </div>
    )
  }

  function renderAdminView() {
    return (
      <div className="view-grid">
        <section className="metric-grid">
          <MetricCard label="Marketplace users" value={String(state.providers.length + 1)} detail="Seeded members and providers" />
          <MetricCard label="Conversion health" value={`${Math.round(completionRate * 100)}%`} detail="Completed bookings versus total" />
          <MetricCard label="Complaint resolution" value={`${Math.round(resolutionRate * 100)}%`} detail="Resolved support cases" />
          <MetricCard label="Gross service value" value={currency(processedVolume)} detail="Tracked across platform payments" />
        </section>

        <Surface eyebrow="Marketplace mix" title="Service categories">
          <div className="stack-list">
            {categorySummary.map((item) => (
              <BarRow key={item.label} label={item.label} value={item.value} max={categorySummary[0]?.value ?? 1} />
            ))}
          </div>
        </Surface>

        <Surface eyebrow="Support patterns" title="Complaint topics">
          <div className="stack-list">
            {complaintSummary.map((item) => (
              <BarRow key={item.label} label={item.label} value={item.value} max={complaintSummary[0]?.value ?? 1} />
            ))}
          </div>
        </Surface>

        <Surface eyebrow="Admin actions" title="Resolve support cases">
          <div className="stack-list">
            {state.complaints.map((complaint) => (
              <article key={complaint.id} className="activity-card">
                <div className="stack-inline stack-inline--spread">
                  <div>
                    <h3>{complaint.topic}</h3>
                    <p className="muted">{complaint.message}</p>
                  </div>
                  <StatusBadge tone={complaint.status === 'Resolved' ? 'success' : 'alert'}>
                    {complaint.status}
                  </StatusBadge>
                </div>
                <div className="stack-inline">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => updateComplaintStatus(complaint.id, 'Investigating')}
                  >
                    Investigate
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => updateComplaintStatus(complaint.id, 'Resolved')}
                  >
                    Resolve
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Surface>
      </div>
    )
  }

  function renderProfileView() {
    return (
      <div className="view-grid">
        <Surface eyebrow="Sign-in details" title="Account information">
          <form className="form-grid" onSubmit={handleAccountSubmit}>
            <label className="field">
              <span>Name</span>
              <input
                value={authDraft.name}
                onChange={(event) =>
                  setAuthDraft({
                    ...authDraft,
                    name: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={authDraft.email}
                onChange={(event) =>
                  setAuthDraft({
                    ...authDraft,
                    email: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                value={authDraft.phone}
                onChange={(event) =>
                  setAuthDraft({
                    ...authDraft,
                    phone: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Public headline</span>
              <input
                value={authDraft.headline}
                onChange={(event) =>
                  setAuthDraft({
                    ...authDraft,
                    headline: event.target.value,
                  })
                }
              />
            </label>

            <button type="submit" className="button">
              Save account details
            </button>
          </form>
        </Surface>

        <Surface eyebrow="Public profile" title="Profile details">
          <form className="form-grid" onSubmit={handleProfileSubmit}>
            <label className="field">
              <span>City</span>
              <input
                value={profileDraft.city}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    city: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>About</span>
              <textarea
                rows={4}
                value={profileDraft.about}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    about: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Interests</span>
              <input
                value={profileDraft.interests}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    interests: event.target.value,
                  })
                }
                placeholder="Comma separated"
              />
            </label>

            <label className="field">
              <span>Availability</span>
              <input
                value={profileDraft.availability}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    availability: event.target.value,
                  })
                }
                placeholder="Comma separated"
              />
            </label>

            <label className="field">
              <span>Evidence</span>
              <textarea
                rows={4}
                value={profileDraft.evidence}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    evidence: event.target.value,
                  })
                }
                placeholder="One proof point per line"
              />
            </label>

            <button type="submit" className="button">
              Update public profile
            </button>
          </form>
        </Surface>

        <Surface eyebrow="Create a service" title="Add a listing">
          <form className="form-grid" onSubmit={handleListingSubmit}>
            <label className="field">
              <span>Listing title</span>
              <input
                value={listingDraft.title}
                onChange={(event) =>
                  setListingDraft({
                    ...listingDraft,
                    title: event.target.value,
                  })
                }
              />
            </label>

            <div className="inline-fields">
              <label className="field">
                <span>Category</span>
                <input
                  value={listingDraft.category}
                  onChange={(event) =>
                    setListingDraft({
                      ...listingDraft,
                      category: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Mode</span>
                <select
                  value={listingDraft.mode}
                  onChange={(event) =>
                    setListingDraft({
                      ...listingDraft,
                      mode: event.target.value as ServiceMode,
                    })
                  }
                >
                  <option value="online">Online</option>
                  <option value="in-person">In person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
            </div>

            <div className="inline-fields">
              <label className="field">
                <span>Price</span>
                <input
                  type="number"
                  min="1"
                  value={listingDraft.price}
                  onChange={(event) =>
                    setListingDraft({
                      ...listingDraft,
                      price: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field">
                <span>Unit</span>
                <input
                  value={listingDraft.unit}
                  onChange={(event) =>
                    setListingDraft({
                      ...listingDraft,
                      unit: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>Description</span>
              <textarea
                rows={4}
                value={listingDraft.description}
                onChange={(event) =>
                  setListingDraft({
                    ...listingDraft,
                    description: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Tags</span>
              <input
                value={listingDraft.tags}
                onChange={(event) =>
                  setListingDraft({
                    ...listingDraft,
                    tags: event.target.value,
                  })
                }
                placeholder="Comma separated"
              />
            </label>

            <button type="submit" className="button">
              Add listing
            </button>
          </form>
        </Surface>

        <Surface eyebrow="Your services" title="Current listings">
          <div className="stack-list">
            {state.currentUser.listings.map((listing) => (
              <article key={listing.id} className="activity-card">
                <div className="stack-inline stack-inline--spread">
                  <div>
                    <h3>{listing.title}</h3>
                    <p className="muted">
                      {listing.category} • {listing.mode}
                    </p>
                  </div>
                  <strong>{currency(listing.price)}</strong>
                </div>
                <p>{listing.description}</p>
                <div className="badge-row">
                  {listing.tags.map((tag) => (
                    <span key={tag} className="badge badge--soft">
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </Surface>
      </div>
    )
  }

  function renderActiveView() {
    switch (activeView) {
      case 'discover':
        return renderDiscoverView()
      case 'bookings':
        return renderBookingsView()
      case 'messages':
        return renderMessagesView()
      case 'payments':
        return renderPaymentsView()
      case 'support':
        return renderSupportView()
      case 'admin':
        return renderAdminView()
      case 'profile':
        return renderProfileView()
      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={skillswapLogo} alt="Skillswap logo" className="brand__logo" />
          <p className="brand__caption">Connect. Exchange. Thrive.</p>
        </div>

        <div className="sidebar-card">
          <span className="eyebrow">Signed in</span>
          <h2>{state.currentUser.name}</h2>
          <p>{state.currentUser.headline}</p>
          <div className="sidebar-card__meta">
            <span>{state.currentUser.city}</span>
            <span>{currency(availableWallet)} available</span>
          </div>
        </div>

        <div className="sidebar-card sidebar-card--guide">
          <span className="eyebrow">Quick guide</span>
          <div className="stack-list">
            <p>
              <strong>Discover:</strong> search and compare providers.
            </p>
            <p>
              <strong>Book:</strong> request a session and choose a time.
            </p>
            <p>
              <strong>Payments:</strong> pay securely and track escrow.
            </p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="App sections">
          {Object.keys(VIEW_META).map((key) => {
            const view = key as ViewId
            const showCount =
              view === 'support'
                ? state.complaints.filter((complaint) => complaint.status !== 'Resolved').length
                : view === 'messages'
                  ? state.messages.length
                  : view === 'payments'
                    ? state.payments.length
                    : view === 'bookings'
                      ? state.bookings.length
                      : view === 'profile'
                        ? state.currentUser.listings.length
                        : unreadCount

            return (
              <button
                key={view}
                type="button"
                className={view === activeView ? 'nav-button is-active' : 'nav-button'}
                onClick={() => jumpToView(view)}
              >
                <span>{VIEW_META[view].eyebrow}</span>
                <strong>{VIEW_META[view].label}</strong>
                <small>{showCount}</small>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-card">
          <div className="stack-inline stack-inline--spread">
            <span className="eyebrow">Notifications</span>
            <button type="button" className="text-button" onClick={markAllNotificationsRead}>
              Mark all read
            </button>
          </div>
          <div className="stack-list">
            {state.notifications.slice(0, 3).map((notification) => (
              <div key={notification.id} className="notification-preview">
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="page-header">
          <div>
            <span className="eyebrow">{viewMeta.eyebrow}</span>
            <h1>{viewMeta.title}</h1>
            <p>{viewMeta.copy}</p>
          </div>
          <div className="page-header__actions">
            <div className="mini-stat-grid mini-stat-grid--header">
              <MiniStat label="Unread" value={String(unreadCount)} />
              <MiniStat label="Open cases" value={String(state.complaints.filter((complaint) => complaint.status !== 'Resolved').length)} />
            </div>
            <button type="button" className="button button--secondary" onClick={resetDemo}>
              Reset demo data
            </button>
          </div>
        </header>

        {renderActiveView()}
      </main>
    </div>
  )
}

type SurfaceProps = {
  eyebrow?: string
  title: string
  aside?: ReactNode
  children: ReactNode
}

function Surface({ eyebrow, title, aside, children }: SurfaceProps) {
  return (
    <section className="surface">
      <div className="surface__header">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

function BarRow({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  return (
    <div className="bar-row">
      <div className="stack-inline stack-inline--spread">
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <div className="bar-row__track">
        <div
          className="bar-row__fill"
          style={{ width: `${Math.max(16, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function StatusBadge({
  tone,
  children,
}: {
  tone: NotificationTone
  children: ReactNode
}) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>
}

export default App
