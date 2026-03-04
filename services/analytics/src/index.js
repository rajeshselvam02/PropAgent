"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("@propagent/db"));
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
// ============================================================================
// HEALTH CHECK
// ============================================================================
fastify.get('/health', async () => ({ status: 'ok', service: 'analytics' }));
// ============================================================================
// 1. CONVERSION FUNNEL
// GET /api/analytics/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD&tenantId=UUID
// ============================================================================
fastify.get('/api/analytics/funnel', async (req, reply) => {
    const { from, to, tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    // Real-time query for current day or recent data
    const isToday = startDate === new Date().toISOString().split('T')[0];
    if (isToday) {
        // Real-time calculation from leads table
        const result = await db_1.default.query(`
      WITH funnel AS (
        SELECT 
          COUNT(*) FILTER (WHERE status IN ('new', 'contacted')) as stage_1_new,
          COUNT(*) FILTER (WHERE status = 'qualified') as stage_2_qualified,
          COUNT(*) FILTER (WHERE status = 'visit_scheduled') as stage_3_scheduled,
          COUNT(*) FILTER (WHERE status = 'visit_completed') as stage_4_visited,
          COUNT(*) FILTER (WHERE status = 'converted') as stage_5_converted,
          COUNT(*) FILTER (WHERE status = 'lost') as stage_lost,
          COUNT(*) as total
        FROM leads
        WHERE (tenant_id = $1 OR $1 = '00000000-0000-0000-0000-000000000001')
          AND created_at >= $2
          AND created_at <= $3
      )
      SELECT 
        total,
        stage_1_new,
        stage_2_qualified,
        stage_3_scheduled,
        stage_4_visited,
        stage_5_converted,
        stage_lost,
        ROUND((stage_2_qualified::numeric / NULLIF(stage_1_new, 0) * 100)::numeric, 1) as new_to_qualified_pct,
        ROUND((stage_3_scheduled::numeric / NULLIF(stage_2_qualified, 0) * 100)::numeric, 1) as qualified_to_scheduled_pct,
        ROUND((stage_4_visited::numeric / NULLIF(stage_3_scheduled, 0) * 100)::numeric, 1) as scheduled_to_visited_pct,
        ROUND((stage_5_converted::numeric / NULLIF(stage_4_visited, 0) * 100)::numeric, 1) as visited_to_converted_pct,
        ROUND((stage_5_converted::numeric / NULLIF(total, 0) * 100)::numeric, 1) as overall_conversion_pct
      FROM funnel
    `, [tid, startDate, endDate + ' 23:59:59']);
        const row = result.rows[0];
        reply.send({
            success: true,
            data: {
                period: { from: startDate, to: endDate },
                stages: [
                    { stage: 'new', label: 'New Leads', count: parseInt(row.stage_1_new) || 0 },
                    { stage: 'qualified', label: 'Qualified', count: parseInt(row.stage_2_qualified) || 0 },
                    { stage: 'scheduled', label: 'Visit Scheduled', count: parseInt(row.stage_3_scheduled) || 0 },
                    { stage: 'visited', label: 'Visit Completed', count: parseInt(row.stage_4_visited) || 0 },
                    { stage: 'converted', label: 'Converted', count: parseInt(row.stage_5_converted) || 0 }
                ],
                conversionRates: {
                    newToQualified: parseFloat(row.new_to_qualified_pct) || 0,
                    qualifiedToScheduled: parseFloat(row.qualified_to_scheduled_pct) || 0,
                    scheduledToVisited: parseFloat(row.scheduled_to_visited_pct) || 0,
                    visitedToConverted: parseFloat(row.visited_to_converted_pct) || 0,
                    overall: parseFloat(row.overall_conversion_pct) || 0
                },
                lost: parseInt(row.stage_lost) || 0,
                total: parseInt(row.total) || 0
            }
        });
    }
    else {
        // Use pre-computed daily_analytics for historical data
        const result = await db_1.default.query(`
      SELECT 
        SUM(new_leads) as stage_1_new,
        SUM(qualified_leads) as stage_2_qualified,
        SUM(visits_scheduled) as stage_3_scheduled,
        SUM(visits_completed) as stage_4_visited,
        SUM(conversions) as stage_5_converted,
        SUM(new_leads + qualified_leads + visits_scheduled) as total
      FROM daily_analytics
      WHERE date >= $1 AND date <= $2
        AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    `, [startDate, endDate, tid]);
        const row = result.rows[0];
        const stage1 = parseInt(row.stage_1_new) || 0;
        const stage2 = parseInt(row.stage_2_qualified) || 0;
        const stage3 = parseInt(row.stage_3_scheduled) || 0;
        const stage4 = parseInt(row.stage_4_visited) || 0;
        const stage5 = parseInt(row.stage_5_converted) || 0;
        reply.send({
            success: true,
            data: {
                period: { from: startDate, to: endDate },
                stages: [
                    { stage: 'new', label: 'New Leads', count: stage1 },
                    { stage: 'qualified', label: 'Qualified', count: stage2 },
                    { stage: 'scheduled', label: 'Visit Scheduled', count: stage3 },
                    { stage: 'visited', label: 'Visit Completed', count: stage4 },
                    { stage: 'converted', label: 'Converted', count: stage5 }
                ],
                conversionRates: {
                    newToQualified: stage1 > 0 ? Math.round((stage2 / stage1) * 1000) / 10 : 0,
                    qualifiedToScheduled: stage2 > 0 ? Math.round((stage3 / stage2) * 1000) / 10 : 0,
                    scheduledToVisited: stage3 > 0 ? Math.round((stage4 / stage3) * 1000) / 10 : 0,
                    visitedToConverted: stage4 > 0 ? Math.round((stage5 / stage4) * 1000) / 10 : 0,
                    overall: stage1 > 0 ? Math.round((stage5 / stage1) * 1000) / 10 : 0
                },
                total: parseInt(row.total) || 0,
                source: 'daily_analytics_rollup'
            }
        });
    }
});
// ============================================================================
// 2. TIME TO CONVERSION
// GET /api/analytics/time-to-conversion?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=source|agent
// ============================================================================
fastify.get('/api/analytics/time-to-conversion', async (req, reply) => {
    const { from, to, groupBy = 'source', tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    const groupField = groupBy === 'agent' ? 'assigned_agent_id' : 'source';
    const groupLabel = groupBy === 'agent' ? 'agent_id' : 'source';
    const result = await db_1.default.query(`
    SELECT 
      ${groupBy === 'agent' ? 'l.assigned_agent_id as group_key, a.name as group_label' : 'l.source as group_key, l.source as group_label'},
      COUNT(*) as total_conversions,
      AVG(EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400) as avg_days_to_conversion,
      MIN(EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400) as min_days,
      MAX(EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400) as max_days,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400) as median_days
    FROM leads l
    ${groupBy === 'agent' ? 'LEFT JOIN agents a ON l.assigned_agent_id = a.id' : ''}
    WHERE l.status = 'converted'
      AND l.converted_at >= $1
      AND l.converted_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
      AND ${groupBy === 'agent' ? 'l.assigned_agent_id' : 'l.source'} IS NOT NULL
    GROUP BY ${groupBy === 'agent' ? 'l.assigned_agent_id, a.name' : 'l.source'}
    ORDER BY avg_days_to_conversion ASC
  `, [startDate, endDate + ' 23:59:59', tid]);
    const data = result.rows.map((row) => ({
        [groupLabel]: row.group_key,
        label: row.group_label,
        totalConversions: parseInt(row.total_conversions) || 0,
        avgDays: Math.round(parseFloat(row.avg_days_to_conversion) * 10) / 10 || 0,
        minDays: Math.round(parseFloat(row.min_days) * 10) / 10 || 0,
        maxDays: Math.round(parseFloat(row.max_days) * 10) / 10 || 0,
        medianDays: Math.round(parseFloat(row.median_days) * 10) / 10 || 0
    }));
    // Calculate overall average
    const overallResult = await db_1.default.query(`
    SELECT 
      AVG(EXTRACT(EPOCH FROM (converted_at - created_at)) / 86400) as overall_avg_days
    FROM leads
    WHERE status = 'converted'
      AND converted_at >= $1
      AND converted_at <= $2
      AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
  `, [startDate, endDate + ' 23:59:59', tid]);
    reply.send({
        success: true,
        data: {
            period: { from: startDate, to: endDate },
            groupBy,
            overallAvgDays: Math.round(parseFloat(overallResult.rows[0]?.overall_avg_days || '0') * 10) / 10,
            breakdown: data
        }
    });
});
// ============================================================================
// 3. AGENT PERFORMANCE
// GET /api/analytics/agent-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
fastify.get('/api/analytics/agent-performance', async (req, reply) => {
    const { from, to, tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    // Try to get from pre-computed agent_performance table first
    const precomputed = await db_1.default.query(`
    SELECT 
      ap.agent_id,
      a.name as agent_name,
      ap.composite_score,
      ap.response_time_score,
      ap.followup_score,
      ap.conversion_score,
      ap.activity_score,
      ap.leads_assigned,
      ap.leads_converted,
      ap.activities_count
    FROM agent_performance ap
    JOIN agents a ON ap.agent_id = a.id
    WHERE ap.period_start >= $1
      AND ap.period_end <= $2
      AND (ap.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    ORDER BY ap.composite_score DESC
  `, [startDate, endDate, tid]);
    if (precomputed.rows.length > 0) {
        reply.send({
            success: true,
            data: {
                period: { from: startDate, to: endDate },
                source: 'precomputed',
                leaderboard: precomputed.rows.map((row) => ({
                    agentId: row.agent_id,
                    agentName: row.agent_name,
                    compositeScore: parseInt(row.composite_score) || 0,
                    breakdown: {
                        responseTime: parseInt(row.response_time_score) || 0,
                        followup: parseInt(row.followup_score) || 0,
                        conversion: parseInt(row.conversion_score) || 0,
                        activity: parseInt(row.activity_score) || 0,
                        dealValue: 70 // baseline
                    },
                    metrics: {
                        leadsAssigned: parseInt(row.leads_assigned) || 0,
                        leadsConverted: parseInt(row.leads_converted) || 0,
                        activities: parseInt(row.activities_count) || 0
                    }
                }))
            }
        });
        return;
    }
    // Real-time calculation if no precomputed data
    const result = await db_1.default.query(`
    WITH agent_metrics AS (
      SELECT 
        a.id as agent_id,
        a.name as agent_name,
        COUNT(DISTINCT l.id) as leads_assigned,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as leads_converted,
        COUNT(DISTINCT i.id) as activities_count,
        AVG(
          CASE WHEN i.type = 'call' AND i.created_at = (
            SELECT MIN(created_at) FROM interactions WHERE lead_id = l.id AND type = 'call'
          )
          THEN EXTRACT(EPOCH FROM (i.created_at - l.created_at))
          END
        ) as avg_response_seconds,
        COUNT(DISTINCT l.id) FILTER (
          WHERE l.next_follow_up_at IS NOT NULL 
          AND l.last_contacted_at >= l.next_follow_up_at
        ) as followups_ontime,
        COUNT(DISTINCT l.id) FILTER (WHERE l.next_follow_up_at IS NOT NULL) as followups_total
      FROM agents a
      LEFT JOIN leads l ON a.id = l.assigned_agent_id
        AND l.created_at >= $1
        AND l.created_at <= $2
        AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
      LEFT JOIN interactions i ON l.id = i.lead_id
        AND i.created_at >= $1
        AND i.created_at <= $2
      WHERE a.active = true
      GROUP BY a.id, a.name
    )
    SELECT 
      agent_id,
      agent_name,
      leads_assigned,
      leads_converted,
      activities_count,
      avg_response_seconds,
      followups_ontime,
      followups_total,
      -- Response time score (100 if <5min, 80 if <30min, 60 if <2hr, 40 if <24hr, 20 otherwise)
      CASE 
        WHEN avg_response_seconds < 300 THEN 100
        WHEN avg_response_seconds < 1800 THEN 80
        WHEN avg_response_seconds < 7200 THEN 60
        WHEN avg_response_seconds < 86400 THEN 40
        ELSE 20
      END as response_time_score,
      -- Follow-up score
      CASE 
        WHEN followups_total > 0 THEN ROUND((followups_ontime::numeric / followups_total) * 100)
        ELSE 0
      END as followup_score,
      -- Conversion score
      CASE 
        WHEN leads_assigned > 0 THEN ROUND((leads_converted::numeric / leads_assigned) * 100)
        ELSE 0
      END as conversion_score,
      -- Activity score (normalized to 10+ activities/day = 100)
      LEAST(100, ROUND((activities_count::numeric / GREATEST(1, EXTRACT(EPOCH FROM ($2::timestamp - $1::timestamp)) / 86400) / 10) * 100)) as activity_score
    FROM agent_metrics
    ORDER BY leads_converted DESC
  `, [startDate, endDate + ' 23:59:59', tid]);
    const leaderboard = result.rows.map((row) => {
        const responseTimeScore = parseInt(row.response_time_score) || 0;
        const followupScore = parseInt(row.followup_score) || 0;
        const conversionScore = parseInt(row.conversion_score) || 0;
        const activityScore = parseInt(row.activity_score) || 0;
        const dealValueScore = 70; // baseline
        const compositeScore = Math.round(responseTimeScore * 0.25 +
            followupScore * 0.20 +
            conversionScore * 0.30 +
            activityScore * 0.15 +
            dealValueScore * 0.10);
        return {
            agentId: row.agent_id,
            agentName: row.agent_name,
            compositeScore,
            breakdown: {
                responseTime: responseTimeScore,
                followup: followupScore,
                conversion: conversionScore,
                activity: activityScore,
                dealValue: dealValueScore
            },
            metrics: {
                leadsAssigned: parseInt(row.leads_assigned) || 0,
                leadsConverted: parseInt(row.leads_converted) || 0,
                activities: parseInt(row.activities_count) || 0
            }
        };
    }).sort((a, b) => b.compositeScore - a.compositeScore);
    reply.send({
        success: true,
        data: {
            period: { from: startDate, to: endDate },
            source: 'realtime',
            leaderboard
        }
    });
});
// ============================================================================
// 4. SOURCE ROI
// GET /api/analytics/source-roi?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
fastify.get('/api/analytics/source-roi', async (req, reply) => {
    const { from, to, tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    // Try precomputed data first
    const precomputed = await db_1.default.query(`
    SELECT 
      source,
      SUM(total_leads) as total_leads,
      SUM(qualified_leads) as qualified_leads,
      SUM(converted_leads) as converted_leads,
      SUM(total_cost) as total_cost,
      SUM(total_revenue) as total_revenue,
      AVG(avg_time_to_conversion) as avg_time_to_conversion
    FROM source_roi
    WHERE date >= $1 AND date <= $2
      AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    GROUP BY source
    ORDER BY total_leads DESC
  `, [startDate, endDate, tid]);
    if (precomputed.rows.length > 0) {
        const data = precomputed.rows.map((row) => ({
            source: row.source,
            totalLeads: parseInt(row.total_leads) || 0,
            qualifiedLeads: parseInt(row.qualified_leads) || 0,
            convertedLeads: parseInt(row.converted_leads) || 0,
            totalCost: parseFloat(row.total_cost) || 0,
            totalRevenue: parseFloat(row.total_revenue) || 0,
            costPerLead: parseInt(row.total_leads) > 0
                ? Math.round((parseFloat(row.total_cost) / parseInt(row.total_leads)) * 100) / 100
                : 0,
            costPerQualified: parseInt(row.qualified_leads) > 0
                ? Math.round((parseFloat(row.total_cost) / parseInt(row.qualified_leads)) * 100) / 100
                : 0,
            costPerConversion: parseInt(row.converted_leads) > 0
                ? Math.round((parseFloat(row.total_cost) / parseInt(row.converted_leads)) * 100) / 100
                : 0,
            roi: parseFloat(row.total_cost) > 0
                ? Math.round(((parseFloat(row.total_revenue) - parseFloat(row.total_cost)) / parseFloat(row.total_cost)) * 100)
                : 0,
            conversionRate: parseInt(row.total_leads) > 0
                ? Math.round((parseInt(row.converted_leads) / parseInt(row.total_leads)) * 1000) / 10
                : 0,
            avgDaysToConversion: Math.round(parseFloat(row.avg_time_to_conversion) * 10) / 10 || 0
        }));
        reply.send({
            success: true,
            data: {
                period: { from: startDate, to: endDate },
                source: 'precomputed',
                sources: data
            }
        });
        return;
    }
    // Real-time calculation from leads
    const result = await db_1.default.query(`
    SELECT 
      l.source,
      COUNT(*) as total_leads,
      COUNT(*) FILTER (WHERE l.status = 'qualified') as qualified_leads,
      COUNT(*) FILTER (WHERE l.status = 'converted') as converted_leads,
      COALESCE(SUM(l.meta_lead_cost), 0) as total_cost,
      COALESCE(SUM(l.deal_value), 0) as total_revenue,
      AVG(
        CASE WHEN l.status = 'converted' 
        THEN EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400 
        END
      ) as avg_days_to_conversion
    FROM leads l
    WHERE l.created_at >= $1
      AND l.created_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
      AND l.source IS NOT NULL
    GROUP BY l.source
    ORDER BY total_leads DESC
  `, [startDate, endDate + ' 23:59:59', tid]);
    const sources = result.rows.map((row) => {
        const totalLeads = parseInt(row.total_leads) || 0;
        const qualifiedLeads = parseInt(row.qualified_leads) || 0;
        const convertedLeads = parseInt(row.converted_leads) || 0;
        const totalCost = parseFloat(row.total_cost) || 0;
        const totalRevenue = parseFloat(row.total_revenue) || 0;
        return {
            source: row.source,
            totalLeads,
            qualifiedLeads,
            convertedLeads,
            totalCost,
            totalRevenue,
            costPerLead: totalLeads > 0 ? Math.round((totalCost / totalLeads) * 100) / 100 : 0,
            costPerQualified: qualifiedLeads > 0 ? Math.round((totalCost / qualifiedLeads) * 100) / 100 : 0,
            costPerConversion: convertedLeads > 0 ? Math.round((totalCost / convertedLeads) * 100) / 100 : 0,
            roi: totalCost > 0 ? Math.round(((totalRevenue - totalCost) / totalCost) * 100) : 0,
            conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0,
            avgDaysToConversion: Math.round(parseFloat(row.avg_days_to_conversion) * 10) / 10 || 0
        };
    });
    reply.send({
        success: true,
        data: {
            period: { from: startDate, to: endDate },
            source: 'realtime',
            sources
        }
    });
});
// ============================================================================
// 5. DASHBOARD SUMMARY
// GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
fastify.get('/api/analytics/summary', async (req, reply) => {
    const { from, to, tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    const isToday = startDate === new Date().toISOString().split('T')[0];
    // Get leads by status
    const leadsByStatus = await db_1.default.query(`
    SELECT 
      status,
      COUNT(*) as count
    FROM leads
    WHERE created_at >= $1
      AND created_at <= $2
      AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    GROUP BY status
  `, [startDate, endDate + ' 23:59:59', tid]);
    // Get leads by source
    const leadsBySource = await db_1.default.query(`
    SELECT 
      source,
      COUNT(*) as count
    FROM leads
    WHERE created_at >= $1
      AND created_at <= $2
      AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    GROUP BY source
    ORDER BY count DESC
    LIMIT 5
  `, [startDate, endDate + ' 23:59:59', tid]);
    // Get conversions
    const conversions = await db_1.default.query(`
    SELECT 
      COUNT(*) as total_conversions,
      COALESCE(SUM(deal_value), 0) as total_revenue,
      AVG(deal_value) as avg_deal_value
    FROM leads
    WHERE status = 'converted'
      AND converted_at >= $1
      AND converted_at <= $2
      AND (tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
  `, [startDate, endDate + ' 23:59:59', tid]);
    // Get visits
    const visits = await db_1.default.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
    FROM site_visits
    WHERE scheduled_at >= $1
      AND scheduled_at <= $2
  `, [startDate, endDate + ' 23:59:59']);
    // Get activity metrics
    const activities = await db_1.default.query(`
    SELECT 
      COUNT(*) FILTER (WHERE i.type = 'call') as calls,
      COUNT(*) FILTER (WHERE i.type = 'whatsapp') as whatsapp,
      COUNT(*) FILTER (WHERE i.type = 'email') as emails
    FROM interactions i
    JOIN leads l ON i.lead_id = l.id
    WHERE i.created_at >= $1
      AND i.created_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
  `, [startDate, endDate + ' 23:59:59', tid]);
    // Get top agents
    const topAgents = await db_1.default.query(`
    SELECT 
      a.id,
      a.name,
      COUNT(DISTINCT l.id) as leads,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as conversions,
      COALESCE(SUM(l.deal_value), 0) as revenue
    FROM agents a
    JOIN leads l ON a.id = l.assigned_agent_id
    WHERE l.created_at >= $1
      AND l.created_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    GROUP BY a.id, a.name
    ORDER BY conversions DESC, revenue DESC
    LIMIT 5
  `, [startDate, endDate + ' 23:59:59', tid]);
    // Calculate overall conversion rate
    const totalLeads = leadsByStatus.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const convertedLeads = parseInt(leadsByStatus.rows.find((r) => r.status === 'converted')?.count || '0');
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0;
    reply.send({
        success: true,
        data: {
            period: { from: startDate, to: endDate },
            leads: {
                total: totalLeads,
                byStatus: Object.fromEntries(leadsByStatus.rows.map((r) => [r.status, parseInt(r.count)])),
                bySource: Object.fromEntries(leadsBySource.rows.map((r) => [r.source, parseInt(r.count)]))
            },
            conversions: {
                total: parseInt(conversions.rows[0]?.total_conversions) || 0,
                revenue: parseFloat(conversions.rows[0]?.total_revenue) || 0,
                avgDealValue: parseFloat(conversions.rows[0]?.avg_deal_value) || 0,
                rate: conversionRate
            },
            visits: {
                scheduled: parseInt(visits.rows[0]?.scheduled) || 0,
                completed: parseInt(visits.rows[0]?.completed) || 0,
                noShow: parseInt(visits.rows[0]?.no_show) || 0,
                cancelled: parseInt(visits.rows[0]?.cancelled) || 0
            },
            activities: {
                calls: parseInt(activities.rows[0]?.calls) || 0,
                whatsapp: parseInt(activities.rows[0]?.whatsapp) || 0,
                emails: parseInt(activities.rows[0]?.emails) || 0
            },
            topAgents: topAgents.rows.map((r) => ({
                id: r.id,
                name: r.name,
                leads: parseInt(r.leads),
                conversions: parseInt(r.conversions),
                revenue: parseFloat(r.revenue)
            }))
        }
    });
});
// ============================================================================
// MANAGER PANEL - TEAM METRICS
// GET /api/analytics/team-metrics?teamId=UUID&from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
fastify.get('/api/analytics/team-metrics', async (req, reply) => {
    const { teamId, from, to, tenantId } = req.query;
    const startDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];
    const tid = tenantId || '00000000-0000-0000-0000-000000000001';
    // Team-level aggregation
    const teamStats = await db_1.default.query(`
    SELECT 
      COUNT(DISTINCT a.id) as team_size,
      COUNT(DISTINCT l.id) as total_leads,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as conversions,
      COALESCE(SUM(l.deal_value), 0) as total_revenue,
      AVG(CASE WHEN l.status = 'converted' THEN l.deal_value END) as avg_deal_size,
      COUNT(DISTINCT i.id) as total_activities,
      AVG(EXTRACT(EPOCH FROM (
        SELECT MIN(i2.created_at) FROM interactions i2 WHERE i2.lead_id = l.id
      ) - l.created_at)) as avg_response_time
    FROM agents a
    LEFT JOIN leads l ON a.id = l.assigned_agent_id
      AND l.created_at >= $1
      AND l.created_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    LEFT JOIN interactions i ON l.id = i.lead_id
      AND i.created_at >= $1
      AND i.created_at <= $2
    WHERE a.active = true
      ${teamId ? 'AND a.id = ANY(SELECT unnest(projects_assigned) FROM projects WHERE id = $4)' : ''}
  `, teamId ? [startDate, endDate + ' 23:59:59', tid, teamId] : [startDate, endDate + ' 23:59:59', tid]);
    // Individual breakdown
    const individualMetrics = await db_1.default.query(`
    SELECT 
      a.id,
      a.name,
      COUNT(DISTINCT l.id) as leads_assigned,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as conversions,
      COALESCE(SUM(l.deal_value), 0) as revenue,
      COUNT(DISTINCT i.id) as activities
    FROM agents a
    LEFT JOIN leads l ON a.id = l.assigned_agent_id
      AND l.created_at >= $1
      AND l.created_at <= $2
      AND (l.tenant_id = $3 OR $3 = '00000000-0000-0000-0000-000000000001')
    LEFT JOIN interactions i ON l.id = i.lead_id
      AND i.created_at >= $1
      AND i.created_at <= $2
    WHERE a.active = true
      ${teamId ? 'AND a.id = ANY(SELECT unnest(projects_assigned) FROM projects WHERE id = $4)' : ''}
    GROUP BY a.id, a.name
    ORDER BY conversions DESC, revenue DESC
  `, teamId ? [startDate, endDate + ' 23:59:59', tid, teamId] : [startDate, endDate + ' 23:59:59', tid]);
    reply.send({
        success: true,
        data: {
            period: { from: startDate, to: endDate },
            team: {
                size: parseInt(teamStats.rows[0]?.team_size) || 0,
                totalLeads: parseInt(teamStats.rows[0]?.total_leads) || 0,
                conversions: parseInt(teamStats.rows[0]?.conversions) || 0,
                revenue: parseFloat(teamStats.rows[0]?.total_revenue) || 0,
                avgDealSize: parseFloat(teamStats.rows[0]?.avg_deal_size) || 0,
                totalActivities: parseInt(teamStats.rows[0]?.total_activities) || 0,
                conversionRate: parseInt(teamStats.rows[0]?.total_leads) > 0
                    ? Math.round((parseInt(teamStats.rows[0]?.conversions) / parseInt(teamStats.rows[0]?.total_leads)) * 1000) / 10
                    : 0
            },
            individuals: individualMetrics.rows.map((r) => ({
                agentId: r.id,
                name: r.name,
                leadsAssigned: parseInt(r.leads_assigned) || 0,
                conversions: parseInt(r.conversions) || 0,
                revenue: parseFloat(r.revenue) || 0,
                activities: parseInt(r.activities) || 0,
                conversionRate: parseInt(r.leads_assigned) > 0
                    ? Math.round((parseInt(r.conversions) / parseInt(r.leads_assigned)) * 1000) / 10
                    : 0
            }))
        }
    });
});
// ============================================================================
// START SERVER
// ============================================================================
const start = async () => {
    const port = Number(process.env.ANALYTICS_PORT) || 4003;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Analytics service on port ${port}`);
};
start().catch(console.error);
//# sourceMappingURL=index.js.map