import type {
  Booking,
  Complaint,
  Payment,
  Provider,
  Review,
  Scope,
  ServiceMode,
  SkillListing,
} from './types'

export type ProviderMatch = {
  provider: Provider
  listing: SkillListing
  score: number
  confidence: number
  reasons: string[]
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function currency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDateLabel(date: string, time?: string) {
  const stamp = new Date(`${date}T${time ?? '12:00'}:00`)

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(time
      ? {
          hour: 'numeric',
          minute: '2-digit',
        }
      : {}),
  }).format(stamp)
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function averageRating(reviews: Review[]) {
  if (reviews.length === 0) {
    return 0
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0)
  return total / reviews.length
}

export function isModeCompatible(filter: 'all' | ServiceMode, mode: ServiceMode) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'hybrid') {
    return mode === 'hybrid'
  }

  return mode === filter || mode === 'hybrid'
}

function isLocalMatch(provider: Provider, city: string) {
  const normalized = city.trim().toLowerCase()
  const areas = [provider.city, ...provider.coverage].map((item) => item.toLowerCase())
  return areas.some((item) => item === normalized)
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function rankProviders({
  providers,
  query,
  scope,
  city,
  category,
  modeFilter,
}: {
  providers: Provider[]
  query: string
  scope: Scope
  city: string
  category: string
  modeFilter: 'all' | ServiceMode
}) {
  const tokens = tokenize(query)

  return providers
    .map((provider) => {
      const local = isLocalMatch(provider, city)

      if (scope === 'local' && !local) {
        return null
      }

      const listingMatches = provider.listings
        .filter((listing) => category === 'All' || listing.category === category)
        .filter((listing) => isModeCompatible(modeFilter, listing.mode))
        .map<ProviderMatch>((listing) => {
          const haystack = [
            provider.name,
            provider.headline,
            provider.bio,
            ...provider.trustBadges,
            ...listing.tags,
            listing.title,
            listing.description,
            listing.category,
          ]
            .join(' ')
            .toLowerCase()

          const tokenHits =
            tokens.length === 0
              ? 0
              : tokens.reduce((sum, token) => sum + Number(haystack.includes(token)), 0)

          let score = 40
          score += provider.rating * 8
          score += Math.min(provider.reviewCount, 60) / 2
          score += Math.min(provider.completedJobs, 120) / 10

          if (provider.featured) {
            score += 10
          }

          if (local) {
            score += 12
          }

          if (provider.evidence.length > 0) {
            score += 6
          }

          if (listing.mode === 'hybrid') {
            score += 4
          }

          if (tokens.length > 0) {
            score += tokenHits * 16

            if (tokenHits === 0) {
              score -= 28
            }
          }

          if (category !== 'All' && listing.category === category) {
            score += 12
          }

          const reasons: string[] = []

          if (tokens.length > 0 && tokenHits > 0) {
            reasons.push(`Matches ${tokenHits} search terms`)
          }

          if (scope === 'local' && local) {
            reasons.push(`Works locally in ${city}`)
          }

          if (listing.mode === 'online') {
            reasons.push('Can be delivered online')
          }

          if (listing.mode === 'hybrid') {
            reasons.push('Flexible online and in-person delivery')
          }

          if (provider.rating >= 4.85) {
            reasons.push(`Top-rated with ${provider.reviewCount} reviews`)
          }

          if (provider.evidence.length > 0) {
            reasons.push('Evidence and trust badges on profile')
          }

          const confidence = Math.max(54, Math.min(98, Math.round(score * 0.7)))

          return {
            provider,
            listing,
            score,
            confidence,
            reasons: reasons.slice(0, 3),
          }
        })
        .sort((left, right) => right.score - left.score)

      return listingMatches[0] ?? null
    })
    .filter((item): item is ProviderMatch => item !== null)
    .sort((left, right) => right.score - left.score)
}

export function buildSupportReply(message: string) {
  const normalized = message.toLowerCase()

  if (/(refund|charge|charged|payment|escrow|invoice)/.test(normalized)) {
    return {
      reply:
        'I flagged this as a payment issue. Escrowed payments stay protected until the service is completed or a support agent intervenes. I created a ticket so the finance flow can be reviewed.',
      topic: 'Payments',
    }
  }

  if (/(late|no show|didn.t show|reschedule|cancel|booking)/.test(normalized)) {
    return {
      reply:
        'I logged a scheduling case and recommended the provider share two new time options within the thread. If the session cannot be completed, support can hold or reverse the release step.',
      topic: 'Scheduling',
    }
  }

  if (/(fake|fraud|scam|unsafe|harass|review)/.test(normalized)) {
    return {
      reply:
        'This sounds like a trust and safety concern. I opened a moderation case so the account, review history, and payment trail can be checked by the admin team.',
      topic: 'Trust & Safety',
    }
  }

  if (/(message|chat|reply)/.test(normalized)) {
    return {
      reply:
        'You can keep everything inside the Skillswap inbox so messages, attachments, and timestamps stay tied to the booking record.',
    }
  }

  return {
    reply:
      'I found this as a general support question. You can book, reschedule, message providers, and pay securely from the dashboard. If you want, describe the issue in a little more detail and I can route it.',
    topic: undefined,
  }
}

export function summarizeCategoryCounts(providers: Provider[]) {
  const counts = new Map<string, number>()

  providers.forEach((provider) => {
    provider.listings.forEach((listing) => {
      counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1)
    })
  })

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function summarizeComplaintCounts(complaints: Complaint[]) {
  const counts = new Map<string, number>()

  complaints.forEach((complaint) => {
    counts.set(complaint.topic, (counts.get(complaint.topic) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

export function computeEscrowHeld(payments: Payment[]) {
  return payments
    .filter((payment) => payment.status === 'Held in escrow')
    .reduce((sum, payment) => sum + payment.amount + payment.fee, 0)
}

export function computeProcessedVolume(payments: Payment[]) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

export function computeReleasedVolume(payments: Payment[]) {
  return payments
    .filter((payment) => payment.status === 'Released')
    .reduce((sum, payment) => sum + payment.amount, 0)
}

export function computeCompletionRate(bookings: Booking[]) {
  if (bookings.length === 0) {
    return 0
  }

  return (
    bookings.filter((booking) => booking.status === 'Completed').length / bookings.length
  )
}
