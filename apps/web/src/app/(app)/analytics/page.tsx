/**
 * Analytics Dashboard Page
 * 
 * Manager analytics with KPIs, funnel, and charts
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/state/queryClient';
import { 
  Users, 
  TrendingUp, 
  Calendar, 
  IndianRupee,
  Phone,
  MessageSquare,
  Mail,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

// KPI Card
function KPICard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'primary' 
}: { 
  title: string; 
  value: string | number; 
  change?: number; 
  icon: any; 
  color?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-orange-100 text-orange-700',
    danger: 'bg-red-100 text-red-700',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{title}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${change >= 0 ? 'text-success' : 'text-danger'}`}>
              {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <div className={`p-3 rounded-md ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

// Funnel Chart (simple CSS bars)
function FunnelChart({ data }: { data: { stage: string; count: number; label: string }[] }) {
  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={item.stage} className="flex items-center gap-4">
          <div className="w-32 text-sm text-muted">{item.label}</div>
          <div className="flex-1">
            <div 
              className="h-8 bg-primary/20 rounded flex items-center px-3"
              style={{ width: `${(item.count / maxCount) * 100}%`, minWidth: '20px' }}
            >
              <span className="text-sm font-medium text-primary">{item.count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Agent Leaderboard
function AgentLeaderboard({ agents }: { agents: { agentName: string; compositeScore: number; metrics: { leadsAssigned: number; leadsConverted: number } }[] }) {
  return (
    <div className="space-y-2">
      {agents.map((agent, index) => (
        <div key={index} className="flex items-center gap-3 p-2 rounded-md hover:bg-bg">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
            index === 0 ? 'bg-yellow-100 text-yellow-800' :
            index === 1 ? 'bg-gray-100 text-gray-800' :
            index === 2 ? 'bg-orange-100 text-orange-800' :
            'bg-gray-50 text-gray-600'
          }`}>
            {index + 1}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{agent.agentName}</p>
            <p className="text-xs text-muted">
              {agent.metrics.leadsConverted}/{agent.metrics.leadsAssigned} converted
            </p>
          </div>
          <div className="text-right">
            <p className="font-medium">{agent.compositeScore}</p>
            <p className="text-xs text-muted">Score</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: queryKeys.analyticsSummary(dateRange),
    queryFn: () => analyticsApi.summary(dateRange),
  });

  // Fetch funnel
  const { data: funnel, isLoading: funnelLoading } = useQuery({
    queryKey: queryKeys.analyticsFunnel(dateRange),
    queryFn: () => analyticsApi.funnel(dateRange),
  });

  // Fetch agent performance
  const { data: agentPerf, isLoading: agentLoading } = useQuery({
    queryKey: queryKeys.analyticsAgentPerformance(dateRange),
    queryFn: () => analyticsApi.agentPerformance(dateRange),
  });

  // Fetch source ROI
  const { data: sourceRoi, isLoading: roiLoading } = useQuery({
    queryKey: queryKeys.analyticsSourceROI(dateRange),
    queryFn: () => analyticsApi.sourceROI(dateRange),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Analytics</h1>
          <p className="text-sm text-muted">Real-time sales performance metrics</p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            className="input w-36"
          />
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            className="input w-36"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Leads"
          value={summary?.leads?.total || 0}
          icon={Users}
          color="primary"
        />
        <KPICard
          title="Conversions"
          value={summary?.conversions?.total || 0}
          icon={TrendingUp}
          color="success"
        />
        <KPICard
          title="Conversion Rate"
          value={`${summary?.conversions?.rate || 0}%`}
          icon={Calendar}
          color="primary"
        />
        <KPICard
          title="Revenue"
          value={`₹${((summary?.conversions?.revenue || 0) / 100000).toFixed(1)}L`}
          icon={IndianRupee}
          color="success"
        />
      </div>

      {/* Activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Calls Made"
          value={summary?.activities?.calls || 0}
          icon={Phone}
        />
        <KPICard
          title="WhatsApp Sent"
          value={summary?.activities?.whatsapp || 0}
          icon={MessageSquare}
        />
        <KPICard
          title="Emails Sent"
          value={summary?.activities?.emails || 0}
          icon={Mail}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="card p-4">
          <h3 className="font-medium mb-4">Conversion Funnel</h3>
          {funnelLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-8 w-full" />
              ))}
            </div>
          ) : funnel ? (
            <>
              <FunnelChart data={funnel.stages} />
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Overall Conversion</span>
                  <span className="font-medium">{funnel.conversionRates?.overall || 0}%</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted">No funnel data</p>
          )}
        </div>

        {/* Agent Leaderboard */}
        <div className="card p-4">
          <h3 className="font-medium mb-4">Agent Leaderboard</h3>
          {agentLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : agentPerf?.leaderboard ? (
            <AgentLeaderboard agents={agentPerf.leaderboard} />
          ) : (
            <p className="text-muted">No agent data</p>
          )}
        </div>
      </div>

      {/* Source ROI */}
      <div className="card p-4">
        <h3 className="font-medium mb-4">Source ROI</h3>
        {roiLoading ? (
          <div className="skeleton h-40 w-full" />
        ) : sourceRoi?.sources ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Qualified</th>
                  <th className="text-right">Converted</th>
                  <th className="text-right">Cost/Lead</th>
                  <th className="text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {sourceRoi.sources.map(source => (
                  <tr key={source.source}>
                    <td className="font-medium">{source.source}</td>
                    <td className="text-right">{source.totalLeads}</td>
                    <td className="text-right">{source.qualifiedLeads}</td>
                    <td className="text-right">{source.convertedLeads}</td>
                    <td className="text-right font-mono-data">₹{source.costPerLead}</td>
                    <td className="text-right">
                      <span className={source.roi >= 0 ? 'text-success' : 'text-danger'}>
                        {source.roi}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No ROI data</p>
        )}
      </div>
    </div>
  );
}
