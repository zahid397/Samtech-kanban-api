import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FuturePlan = 'PRO' | 'ENTERPRISE';

// These describe existing server-enforced execution limits, not paid allowances.
// All currently shipped features remain available during the Starter preview.
export const PREVIEW_LIMITS = {
  concurrentAgentRuns: 2,
  aiRequestTimeoutSeconds: 50,
  tasksPerAnalysis: 1000,
  textNotes: 100,
  textNoteCharacters: 100000,
  tasksPerDraftProposal: 8,
  assistantRequestsPerMinute: 15,
  voiceTranscriptionsPerMinute: 6,
  voiceSynthesisRequestsPerMinute: 10,
} as const;

export const PREVIEW_ENTITLEMENTS = {
  kanban: true,
  assistant: true,
  analytics: true,
  automations: true,
  voice: true,
  fileNotes: true,
  teamAdministration: false,
  administratorDashboard: false,
  paidBilling: false,
} as const;

const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    available: true,
    price: null,
    priceStatus: 'not-finalized',
    description: 'The current workspace preview. Existing tools remain available.',
    features: [
      'Kanban projects',
      'Samm assistant and browser voice',
      'Current analytics and automations',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    available: false,
    price: null,
    priceStatus: 'not-finalized',
    description: 'Planned expansion; paid subscriptions cannot be activated yet.',
    features: ['Expanded AI allowances', 'Advanced voice options', 'Expanded workflow automation'],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    available: false,
    price: null,
    priceStatus: 'not-finalized',
    description: 'Planned team and enterprise capabilities; not currently available.',
    features: [
      'Team administration',
      'Advanced access controls',
      'Custom integration and deployment options',
    ],
  },
] as const;

@Injectable()
export class SubscriptionService {
  constructor(private readonly db: PrismaService) {}

  async summary(userId: string) {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      boards,
      tasks,
      agentRuns,
      automationRules,
      files,
      agentRunsLast30Days,
      automationRunsLast30Days,
    ] = await this.db.$transaction([
      this.db.board.count({ where: { userId, deletedAt: null } }),
      this.db.task.count({
        where: { deletedAt: null, column: { board: { userId, deletedAt: null } } },
      }),
      this.db.agentRun.count({ where: { userId } }),
      this.db.automationRule.count({ where: { userId } }),
      this.db.workspaceFile.count({ where: { userId } }),
      this.db.agentRun.count({ where: { userId, createdAt: { gte: since, lte: now } } }),
      this.db.automationRun.count({
        where: { rule: { userId }, createdAt: { gte: since, lte: now } },
      }),
    ]);
    return {
      plan: 'STARTER',
      status: 'preview',
      billingConfigured: false,
      billingHistoryAvailable: false,
      paidPlansAvailable: false,
      entitlements: PREVIEW_ENTITLEMENTS,
      limits: PREVIEW_LIMITS,
      usage: {
        boards,
        tasks,
        agentRuns,
        automationRules,
        files,
        agentRunsLast30Days,
        automationRunsLast30Days,
      },
      usagePeriod: { since: since.toISOString(), until: now.toISOString(), label: 'Last 30 days' },
      plans: PLANS,
    };
  }

  async recordInterest(userId: string, plan: FuturePlan, approved: boolean) {
    if (approved !== true || !['PRO', 'ENTERPRISE'].includes(plan)) {
      throw new BadRequestException(
        'Choose a future plan and explicitly confirm recording your interest',
      );
    }
    return this.db.write(userId, async (tx) => {
      // Repeated clicks and concurrent requests do not create duplicate interest
      // records for the same owner/plan within the current 30-day period.
      const previous = await tx.auditLog.findFirst({
        where: {
          userId,
          action: 'subscription.interest.recorded',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          details: { path: ['plan'], equals: plan },
        },
        select: { id: true },
      });
      const record =
        previous ||
        (await tx.auditLog.create({
          data: {
            userId,
            action: 'subscription.interest.recorded',
            details: {
              plan,
              subscriptionChanged: false,
              charged: false,
            } satisfies Prisma.InputJsonObject,
          },
          select: { id: true },
        }));
      return {
        recorded: true,
        duplicate: Boolean(previous),
        recordId: record.id,
        plan,
        subscriptionChanged: false,
        charged: false,
        message:
          'Plan interest recorded in your workspace. No subscription was activated and no payment was taken.',
      };
    });
  }
}
