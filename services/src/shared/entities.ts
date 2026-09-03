import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { Entity, Service } from 'electrodb'
import type { EntityItem } from 'electrodb'
import { config } from './config.js'

/**
 * One DynamoDB table, four entities, modelled with ElectroDB so nothing in this
 * codebase ever builds a `PK`/`SK` string by hand.
 *
 * Identity and entitlement live on the SAME item deliberately. Keeping them
 * together makes `/me` a single GetItem and — far more importantly — makes
 * "consume one read" a single conditional update rather than a read-then-write
 * race across two items.
 */

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), {
  marshallOptions: { removeUndefinedValues: true },
})

const table = config.tableName
const service = 'pilcrow'

export const UserEntity = new Entity(
  {
    model: { entity: 'user', version: '1', service },
    attributes: {
      userId: { type: 'string', required: true, readOnly: true },
      email: { type: 'string' },
      provider: { type: 'string' },

      plan: { type: ['free', 'pro'] as const, required: true, default: 'free' },
      /** Mirrors the Stripe subscription status; 'none' while they have never paid. */
      status: {
        type: ['none', 'active', 'trialing', 'past_due', 'canceled', 'unpaid'] as const,
        required: true,
        default: 'none',
      },
      /** Epoch ms. Access is honoured until this instant even after cancellation. */
      currentPeriodEnd: { type: 'number' },

      stripeCustomerId: { type: 'string' },
      stripeSubscriptionId: { type: 'string' },

      /** Trial counters. Monotonic; never reset, because the trial is once per account. */
      freeReadsUsed: { type: 'number', required: true, default: 0 },
      freeCharsUsed: { type: 'number', required: true, default: 0 },

      /** Set by hand for the handful of pre-launch users who paid ElevenLabs themselves. */
      comped: { type: 'boolean' },

      createdAt: { type: 'number', required: true, default: () => Date.now(), readOnly: true },
      updatedAt: { type: 'number', required: true, default: () => Date.now(), set: () => Date.now() },
    },
    indexes: {
      primary: {
        pk: { field: 'pk', composite: ['userId'] },
        sk: { field: 'sk', composite: [] },
      },
      // The Stripe webhook knows a customer id, not a Cognito sub. Without this
      // index every webhook would be a table scan.
      byStripeCustomer: {
        index: 'gsi1',
        pk: { field: 'gsi1pk', composite: ['stripeCustomerId'] },
        sk: { field: 'gsi1sk', composite: ['userId'] },
      },
    },
  },
  { client, table },
)

/**
 * One item per read, written with `attribute_not_exists`. This is the whole
 * mechanism that makes quota consumption exactly-once: a read is split into
 * several chunks and the TTS Lambda is invoked for each, but only the invocation
 * that successfully creates this item is allowed to charge for it.
 *
 * Expires after 24h — it exists to deduplicate one read in flight, not to be a
 * permanent record. The permanent record is MonthlyUsage.
 */
export const ReadEntity = new Entity(
  {
    model: { entity: 'read', version: '1', service },
    attributes: {
      userId: { type: 'string', required: true, readOnly: true },
      readId: { type: 'string', required: true, readOnly: true },
      chars: { type: 'number', required: true, default: 0 },
      chunks: { type: 'number', required: true, default: 0 },
      plan: { type: 'string' },
      createdAt: { type: 'number', required: true, default: () => Date.now(), readOnly: true },
      /** Epoch SECONDS — DynamoDB TTL rejects milliseconds silently. */
      expiresAt: {
        type: 'number',
        required: true,
        default: () => Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        readOnly: true,
      },
    },
    indexes: {
      primary: {
        pk: { field: 'pk', composite: ['userId'] },
        sk: { field: 'sk', composite: ['readId'] },
      },
    },
  },
  { client, table },
)

/** Characters actually synthesized per user per calendar month. Drives the Pro allowance. */
export const UsageEntity = new Entity(
  {
    model: { entity: 'usage', version: '1', service },
    attributes: {
      userId: { type: 'string', required: true, readOnly: true },
      period: { type: 'string', required: true, readOnly: true },
      chars: { type: 'number', required: true, default: 0 },
      reads: { type: 'number', required: true, default: 0 },
    },
    indexes: {
      primary: {
        pk: { field: 'pk', composite: ['userId'] },
        sk: { field: 'sk', composite: ['period'] },
      },
    },
  },
  { client, table },
)

/**
 * Stripe redelivers webhooks on any non-2xx and occasionally duplicates on 2xx.
 * Handling `customer.subscription.updated` twice is harmless, but
 * `invoice.payment_failed` twice is not, so every event is claimed here first.
 */
export const StripeEventEntity = new Entity(
  {
    model: { entity: 'stripeevent', version: '1', service },
    attributes: {
      eventId: { type: 'string', required: true, readOnly: true },
      eventType: { type: 'string' },
      processedAt: { type: 'number', required: true, default: () => Date.now() },
      expiresAt: {
        type: 'number',
        required: true,
        default: () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        readOnly: true,
      },
    },
    indexes: {
      primary: {
        pk: { field: 'pk', composite: ['eventId'] },
        sk: { field: 'sk', composite: [] },
      },
    },
  },
  { client, table },
)

export const pilcrow = new Service(
  { user: UserEntity, read: ReadEntity, usage: UsageEntity, stripeEvent: StripeEventEntity },
  { client, table },
)

export type UserItem = EntityItem<typeof UserEntity>
export type UsageItem = EntityItem<typeof UsageEntity>
export type ReadItem = EntityItem<typeof ReadEntity>

export { client as documentClient }
