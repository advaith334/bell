import { Logger } from '@aws-lambda-powertools/logger'
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics'
import { estimatedCostUsd } from './plans.js'

export const logger = new Logger({ serviceName: 'pilcrow' })
export const metrics = new Metrics({ namespace: 'Pilcrow', serviceName: 'pilcrow' })

/**
 * The single most important metric in the system. Characters synthesized is
 * directly proportional to what we owe ElevenLabs, so this is what tells us
 * whether $9.99 covers a real user before the invoice does.
 */
export function recordSynthesisMetrics(params: { chars: number; plan: string; cached?: boolean }): void {
  metrics.addDimension('plan', params.plan)
  metrics.addMetric('CharsSynthesized', MetricUnit.Count, params.chars)
  metrics.addMetric('EstimatedCostUsd', MetricUnit.Count, estimatedCostUsd(params.chars))
  metrics.addMetric('Synthesis', MetricUnit.Count, 1)
  metrics.publishStoredMetrics()
}

export function recordPaywallHit(reason: string): void {
  metrics.addDimension('reason', reason)
  metrics.addMetric('PaywallHit', MetricUnit.Count, 1)
  metrics.publishStoredMetrics()
}
