"use strict";
/**
 * Analytics Job Processor
 *
 * Handles:
 * - Daily rollup computation
 * - Agent performance scoring
 * - Funnel metrics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAnalyticsRollup = processAnalyticsRollup;
exports.processAgentPerformance = processAgentPerformance;
exports.computeFunnelMetrics = computeFunnelMetrics;
const db_1 = __importDefault(require("@propagent/db"));
/**
 * Compute daily analytics rollup
 */
async function processAnalyticsRollup(job) {
    const { date, tenantId } = job.data;
    console.log(`[analytics.rollup] Computing rollup for ${date}`);
    // Build tenant filter
    const tenantFilter = tenantId ? `AND tenant_id = '${tenantId}'` : '';
    // New leads
    const newLeadsResult = await db_1.default.query(`
    SELECT COUNT(*) as count, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001') as tenant_id
    FROM leads
    WHERE DATE(created_at) = $1 ${tenantFilter}
    GROUP BY tenant_id
  `, [date]);
    // Leads by intent class
    const intentResult = await db_1.default.query(`
    SELECT 
      COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001') as tenant_id,
      COUNT(*) FILTER (WHERE intent_class = 'hot') as hot,
      COUNT(*) FILTER (WHERE intent_class = 'warm') as warm,
      COUNT(*) FILTER (WHERE intent_class = 'cold') as cold
    FROM leads
    WHERE DATE(created_at) = $1 ${tenantFilter}
    GROUP BY tenant_id
  `, [date]);
    // Status transitions (qualified, visits scheduled, converted)
    const statusResult = await db_1.default.query(`
    SELECT 
      COALESCE(tenant_id, '00000000-0000-0000-0000-000000000001') as tenant_id,
      COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
      COUNT(*) FILTER (WHERE status = 'visit_scheduled' OR status = 'visit_completed') as visits,
      COUNT(*) FILTER (WHERE status = 'converted') as converted,
      COUNT(*) FILTER (WHERE status = 'lost') as lost
    FROM leads
    WHERE DATE(status_updated_at) = $1 ${tenantFilter}
    GROUP BY tenant_id
  `, [date]);
    // Interactions (calls, whatsapp)
    const interactionsResult = await db_1.default.query(`
    SELECT 
      COALESCE(l.tenant_id, '00000000-0000-0000-0000-000000000001') as tenant_id,
      COUNT(*) FILTER (WHERE i.type = 'call') as calls,
      COUNT(*) FILTER (WHERE i.type = 'whatsapp') as whatsapp,
      COUNT(*) FILTER (WHERE i.type = 'email') as emails
    FROM interactions i
    JOIN leads l ON i.lead_id = l.id
    WHERE DATE(i.created_at) = $1 ${tenantFilter.replace('tenant_id', 'l.tenant_id')}
    GROUP BY l.tenant_id
  `, [date]);
    // Upsert into daily_analytics
    const allTenants = new Set([
        ...newLeadsResult.rows.map((r) => r.tenant_id),
        ...intentResult.rows.map((r) => r.tenant_id),
    ]);
    for (const tid of allTenants) {
        const newLeads = newLeadsResult.rows.find((r) => r.tenant_id === tid)?.count || 0;
        const intent = intentResult.rows.find((r) => r.tenant_id === tid) || { hot: 0, warm: 0, cold: 0 };
        const status = statusResult.rows.find((r) => r.tenant_id === tid) || { qualified: 0, visits: 0, converted: 0, lost: 0 };
        const interactions = interactionsResult.rows.find((r) => r.tenant_id === tid) || { calls: 0, whatsapp: 0, emails: 0 };
        await db_1.default.query(`
      INSERT INTO daily_analytics (
        date, tenant_id, new_leads, hot_leads, warm_leads, cold_leads,
        qualified_leads, visits_scheduled, visits_completed, conversions,
        calls_made, whatsapp_sent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (date, tenant_id) DO UPDATE SET
        new_leads = EXCLUDED.new_leads,
        hot_leads = EXCLUDED.hot_leads,
        warm_leads = EXCLUDED.warm_leads,
        cold_leads = EXCLUDED.cold_leads,
        qualified_leads = EXCLUDED.qualified_leads,
        visits_scheduled = EXCLUDED.visits_scheduled,
        conversions = EXCLUDED.conversions,
        calls_made = EXCLUDED.calls_made,
        whatsapp_sent = EXCLUDED.whatsapp_sent
    `, [
            date, tid,
            parseInt(newLeads),
            parseInt(intent.hot) || 0,
            parseInt(intent.warm) || 0,
            parseInt(intent.cold) || 0,
            parseInt(status.qualified) || 0,
            parseInt(status.visits) || 0,
            0, // visits_completed needs separate tracking
            parseInt(status.converted) || 0,
            parseInt(interactions.calls) || 0,
            parseInt(interactions.whatsapp) || 0,
        ]);
    }
    return {
        success: true,
        date,
        tenantsProcessed: allTenants.size,
    };
}
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
async function processAgentPerformance(job) {
    const { agentId, tenantId, periodStart, periodEnd } = job.data;
    console.log(`[analytics.agent] Computing performance for agent ${agentId}`);
    // Response time
    const responseTimeResult = await db_1.default.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (i.created_at - l.created_at))) as avg_seconds
    FROM leads l
    JOIN interactions i ON l.id = i.lead_id
    WHERE l.assigned_agent_id = $1
      AND l.tenant_id = $2
      AND l.created_at BETWEEN $3 AND $4
      AND i.type = 'call'
      AND i.created_at = (
        SELECT MIN(created_at) FROM interactions WHERE lead_id = l.id AND type = 'call'
      )
  `, [agentId, tenantId, periodStart, periodEnd]);
    const avgResponseTimeSeconds = parseFloat(responseTimeResult.rows[0]?.avg_seconds || '0');
    // Score: 100 if < 5min, 80 if < 30min, 60 if < 2hr, 40 if < 24hr, 20 otherwise
    let responseTimeScore = 20;
    if (avgResponseTimeSeconds < 300)
        responseTimeScore = 100;
    else if (avgResponseTimeSeconds < 1800)
        responseTimeScore = 80;
    else if (avgResponseTimeSeconds < 7200)
        responseTimeScore = 60;
    else if (avgResponseTimeSeconds < 86400)
        responseTimeScore = 40;
    // Follow-up adherence
    const followupResult = await db_1.default.query(`
    SELECT 
      COUNT(*) FILTER (WHERE next_follow_up_at IS NOT NULL AND last_contacted_at >= next_follow_up_at) as on_time,
      COUNT(*) FILTER (WHERE next_follow_up_at IS NOT NULL) as total
    FROM leads
    WHERE assigned_agent_id = $1 AND tenant_id = $2
      AND created_at BETWEEN $3 AND $4
  `, [agentId, tenantId, periodStart, periodEnd]);
    const followupOntime = parseInt(followupResult.rows[0]?.on_time || '0');
    const followupTotal = parseInt(followupResult.rows[0]?.total || '1');
    const followupScore = (followupOntime / followupTotal) * 100;
    // Conversion rate
    const conversionResult = await db_1.default.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'converted') as converted,
      COUNT(*) as total
    FROM leads
    WHERE assigned_agent_id = $1 AND tenant_id = $2
      AND created_at BETWEEN $3 AND $4
  `, [agentId, tenantId, periodStart, periodEnd]);
    const converted = parseInt(conversionResult.rows[0]?.converted || '0');
    const totalLeads = parseInt(conversionResult.rows[0]?.total || '1');
    const conversionRate = converted / totalLeads;
    const conversionScore = conversionRate * 100; // Scale to 0-100
    // Activity volume
    const activityResult = await db_1.default.query(`
    SELECT COUNT(*) as count
    FROM interactions i
    JOIN leads l ON i.lead_id = l.id
    WHERE l.assigned_agent_id = $1 AND l.tenant_id = $2
      AND i.created_at BETWEEN $3 AND $4
  `, [agentId, tenantId, periodStart, periodEnd]);
    const activityCount = parseInt(activityResult.rows[0]?.count || '0');
    // Normalize: 10+ activities/day is excellent
    const daysInPeriod = Math.max(1, (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000);
    const activitiesPerDay = activityCount / daysInPeriod;
    const activityScore = Math.min(100, (activitiesPerDay / 10) * 100);
    // Composite score (weighted)
    const compositeScore = responseTimeScore * 0.25 +
        followupScore * 0.20 +
        conversionScore * 0.30 +
        activityScore * 0.15 +
        70 * 0.10; // Base deal value score (would need deals table)
    // Store performance record
    await db_1.default.query(`
    INSERT INTO agent_performance (
      agent_id, tenant_id, period_start, period_end,
      response_time_score, followup_score, conversion_score, activity_score,
      composite_score, leads_assigned, leads_converted, activities_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (agent_id, period_start, period_end) DO UPDATE SET
      response_time_score = EXCLUDED.response_time_score,
      followup_score = EXCLUDED.followup_score,
      conversion_score = EXCLUDED.conversion_score,
      activity_score = EXCLUDED.activity_score,
      composite_score = EXCLUDED.composite_score,
      leads_assigned = EXCLUDED.leads_assigned,
      leads_converted = EXCLUDED.leads_converted,
      activities_count = EXCLUDED.activities_count
  `, [
        agentId, tenantId, periodStart, periodEnd,
        responseTimeScore, followupScore, conversionScore, activityScore,
        Math.round(compositeScore), totalLeads, converted, activityCount
    ]);
    return {
        success: true,
        agentId,
        compositeScore: Math.round(compositeScore),
        breakdown: {
            responseTime: Math.round(responseTimeScore),
            followup: Math.round(followupScore),
            conversion: Math.round(conversionScore),
            activity: Math.round(activityScore),
        },
    };
}
/**
 * Compute funnel metrics
 */
async function computeFunnelMetrics(tenantId, startDate, endDate) {
    const result = await db_1.default.query(`
    WITH funnel AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'new' OR status = 'contacted') as new_stage,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified_stage,
        COUNT(*) FILTER (WHERE status = 'visit_scheduled') as scheduled_stage,
        COUNT(*) FILTER (WHERE status = 'visit_completed') as visited_stage,
        COUNT(*) FILTER (WHERE status = 'converted') as converted_stage,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_stage,
        COUNT(*) as total
      FROM leads
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
    )
    SELECT
      total,
      new_stage,
      qualified_stage,
      scheduled_stage,
      visited_stage,
      converted_stage,
      lost_stage,
      ROUND(qualified_stage::numeric / NULLIF(new_stage, 0) * 100, 1) as new_to_qualified_pct,
      ROUND(scheduled_stage::numeric / NULLIF(qualified_stage, 0) * 100, 1) as qualified_to_scheduled_pct,
      ROUND(visited_stage::numeric / NULLIF(scheduled_stage, 0) * 100, 1) as scheduled_to_visited_pct,
      ROUND(converted_stage::numeric / NULLIF(visited_stage, 0) * 100, 1) as visited_to_converted_pct,
      ROUND(converted_stage::numeric / NULLIF(total, 0) * 100, 1) as overall_conversion_pct
    FROM funnel
  `, [tenantId, startDate, endDate]);
    return result.rows[0];
}
//# sourceMappingURL=analytics.js.map