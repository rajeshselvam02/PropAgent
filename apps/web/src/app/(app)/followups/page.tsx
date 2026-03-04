/**
 * Follow-ups Page
 * 
 * Task manager for scheduled follow-ups
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { followUpsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/state/queryClient';
import { Calendar, Clock, User, CheckCircle, AlertCircle } from 'lucide-react';

type ViewType = 'today' | 'overdue' | 'week' | 'all';

export default function FollowupsPage() {
  const [activeView, setActiveView] = useState<ViewType>('today');

  // Fetch overdue follow-ups
  const { data: overdueLeads, isLoading } = useQuery({
    queryKey: queryKeys.overdueFollowUps(),
    queryFn: followUpsApi.overdue,
  });

  // Filter based on view
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filteredLeads = overdueLeads?.filter((lead: any) => {
    const followUpDate = new Date(lead.next_follow_up_at);
    switch (activeView) {
      case 'today':
        return followUpDate <= todayEnd;
      case 'overdue':
        return followUpDate < now;
      case 'week':
        return followUpDate <= weekEnd;
      default:
        return true;
    }
  }) || [];

  const overdueCount = overdueLeads?.filter((lead: any) => 
    new Date(lead.next_follow_up_at) < now
  ).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Follow-ups</h1>
          {overdueCount > 0 && (
            <p className="text-sm text-danger flex items-center gap-1 mt-1">
              <AlertCircle className="w-4 h-4" />
              {overdueCount} overdue follow-ups
            </p>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'today', label: 'Today' },
          { id: 'overdue', label: 'Overdue', badge: overdueCount },
          { id: 'week', label: 'This Week' },
          { id: 'all', label: 'All' },
        ].map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id as ViewType)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === view.id
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-muted hover:bg-bg'
            }`}
          >
            {view.label}
            {view.badge ? (
              <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {view.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Follow-ups List */}
      {isLoading ? (
        <div className="card p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <CheckCircle className="w-12 h-12 mx-auto text-success mb-4" />
          <p>No follow-ups for this view</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Scheduled</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead: any) => {
                const followUpDate = new Date(lead.next_follow_up_at);
                const isOverdue = followUpDate < now;
                
                return (
                  <tr 
                    key={lead.id}
                    className={isOverdue ? 'bg-red-50' : ''}
                    onClick={() => window.location.href = `/leads/${lead.id}`}
                  >
                    <td className="font-medium">{lead.name || 'Unknown'}</td>
                    <td className="font-mono-data text-sm">{lead.phone}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted" />
                        <div>
                          <p className="text-sm">{followUpDate.toLocaleDateString()}</p>
                          <p className="text-xs text-muted">{followUpDate.toLocaleTimeString()}</p>
                        </div>
                        {isOverdue && (
                          <span className="badge-danger">Overdue</span>
                        )}
                      </div>
                    </td>
                    <td className="text-muted">{lead.agent_name || '-'}</td>
                    <td>
                      <span className={`status-${lead.status}`}>
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <button className="btn-secondary text-xs py-1">
                          Reschedule
                        </button>
                        <button className="btn-primary text-xs py-1">
                          Mark Done
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
