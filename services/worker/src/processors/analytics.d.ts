/**
 * Analytics Job Processor
 *
 * Handles:
 * - Daily rollup computation
 * - Agent performance scoring
 * - Funnel metrics
 */
import { Job } from 'bullmq';
interface AnalyticsRollupData {
    date: string;
    tenantId?: string;
}
interface AgentPerformanceData {
    agentId: string;
    tenantId: string;
    periodStart: string;
    periodEnd: string;
}
/**
 * Compute daily analytics rollup
 */
export declare function processAnalyticsRollup(job: Job<AnalyticsRollupData>): Promise<{
    success: boolean;
    date: string;
    tenantsProcessed: number;
}>;
/**
 * Compute agent performance score
 *
 * Formula:
 * - Response time (25%): avg time from lead creation to first contact
 * - Follow-up adherence (20%): % of follow-ups done on time
 * - Conversion rate (30%): leads converted / leads assigned
 * - Activity volume (15%): normalized call/message count
 * - Deal value (10%): avg deal value (if tracked)
 */
export declare function processAgentPerformance(job: Job<AgentPerformanceData>): Promise<{
    success: boolean;
    agentId: string;
    compositeScore: number;
    breakdown: {
        responseTime: number;
        followup: number;
        conversion: number;
        activity: number;
    };
}>;
/**
 * Compute funnel metrics
 */
export declare function computeFunnelMetrics(tenantId: string, startDate: string, endDate: string): Promise<any>;
export {};
//# sourceMappingURL=analytics.d.ts.map