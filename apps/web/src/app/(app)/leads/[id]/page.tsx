/**
 * Lead Details Page
 * 
 * Workspace for managing a single lead
 */

'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, agentsApi } from '@/lib/api/endpoints';
import { queryKeys, invalidateLeadsQueries } from '@/lib/state/queryClient';
import type { Lead, LeadStatus } from '@/types/entities';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  UserPlus,
  RefreshCw,
  ArrowRight,
  Clock,
  TrendingUp,
} from 'lucide-react';

// Status transitions
const STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted'],
  contacted: ['qualified', 'lost'],
  qualified: ['visit_scheduled', 'lost'],
  visit_scheduled: ['visit_completed', 'lost'],
  visit_completed: ['converted', 'lost'],
  converted: [],
  lost: ['new', 'contacted'],
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  visit_scheduled: 'Visit Scheduled',
  visit_completed: 'Visit Done',
  converted: 'Converted',
  lost: 'Lost',
};

// Status badge
function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`status-${status.replace('_', '_')} text-sm`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// Intent badge
function IntentBadge({ intentClass, score }: { intentClass: string; score: number }) {
  const colorClass = intentClass === 'hot' ? 'text-red-700 bg-red-50' : 
                     intentClass === 'warm' ? 'text-orange-700 bg-orange-50' : 
                     'text-blue-700 bg-blue-50';
  return (
    <span className={`px-2 py-1 rounded text-sm font-medium ${colorClass}`}>
      {intentClass.toUpperCase()} ({score})
    </span>
  );
}

export default function LeadDetailsPage({ params }: { params: { id: string } }) {
  const leadId = params.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'followups'>('overview');
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Fetch lead
  const { data: lead, isLoading, error } = useQuery({
    queryKey: queryKeys.lead(leadId),
    queryFn: () => leadsApi.get(leadId),
  });

  // Fetch agents
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents(),
    queryFn: agentsApi.list,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: LeadStatus) => leadsApi.updateStatus(leadId, { status }),
    onSuccess: () => {
      invalidateLeadsQueries();
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: () => leadsApi.assign(leadId),
    onSuccess: () => {
      invalidateLeadsQueries();
    },
  });

  // Calculate score mutation
  const calcScoreMutation = useMutation({
    mutationFn: () => leadsApi.calculateScore(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
    },
  });

  // Mark contacted mutation
  const contactedMutation = useMutation({
    mutationFn: () => leadsApi.contacted(leadId),
    onSuccess: () => {
      invalidateLeadsQueries();
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-muted">Loading lead...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="p-8 text-center text-danger">
        Lead not found. <a href="/leads" className="text-primary underline">Back to leads</a>
      </div>
    );
  }

  const availableTransitions = STATUS_TRANSITIONS[lead.status] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">{lead.name || 'Unknown'}</h1>
          <div className="flex items-center gap-4 mt-2 text-muted">
            <span className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              {lead.phone}
            </span>
            {lead.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-4 h-4" />
                {lead.email}
              </span>
            )}
            {lead.preferred_location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {lead.preferred_location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} />
          <IntentBadge intentClass={lead.intent_class} score={lead.intent_score} />
        </div>
      </div>

      {/* Actions */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {/* Status transitions */}
          {availableTransitions.length > 0 && (
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-muted" />
              {availableTransitions.map(status => (
                <button
                  key={status}
                  onClick={() => updateStatusMutation.mutate(status)}
                  disabled={updateStatusMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  Mark {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          )}

          {/* Mark Contacted */}
          {lead.status === 'new' && (
            <button
              onClick={() => contactedMutation.mutate()}
              disabled={contactedMutation.isPending}
              className="btn-primary"
            >
              <Phone className="w-4 h-4" />
              Mark Contacted
            </button>
          )}

          {/* Assign */}
          {!lead.assigned_agent_id && (
            <button
              onClick={() => assignMutation.mutate()}
              disabled={assignMutation.isPending}
              className="btn-secondary"
            >
              <UserPlus className="w-4 h-4" />
              Auto-Assign
            </button>
          )}

          {/* Schedule Follow-up */}
          <button
            onClick={() => setShowScheduleModal(true)}
            className="btn-secondary"
          >
            <Calendar className="w-4 h-4" />
            Schedule Follow-up
          </button>

          {/* Recalculate Score */}
          <button
            onClick={() => calcScoreMutation.mutate()}
            disabled={calcScoreMutation.isPending}
            className="btn-ghost"
          >
            <RefreshCw className={`w-4 h-4 ${calcScoreMutation.isPending ? 'animate-spin' : ''}`} />
            Recalculate Score
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4">
          {(['overview', 'activity', 'followups'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {activeTab === 'overview' && (
            <>
              {/* Lead Info */}
              <div className="card p-4">
                <h3 className="font-medium mb-4">Lead Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted">Source</p>
                    <p className="font-medium">{lead.source}</p>
                  </div>
                  <div>
                    <p className="text-muted">Budget</p>
                    <p className="font-medium">
                      {lead.budget_min && lead.budget_max 
                        ? `₹${lead.budget_min/100000}L - ₹${lead.budget_max/100000}L`
                        : 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Purpose</p>
                    <p className="font-medium capitalize">{lead.purpose || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-muted">Timeline</p>
                    <p className="font-medium capitalize">{lead.timeline?.replace('_', ' ') || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-muted">Property Type</p>
                    <p className="font-medium">{lead.property_type_preference || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-muted">Location</p>
                    <p className="font-medium">{lead.preferred_location || 'Not specified'}</p>
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="card p-4">
                <h3 className="font-medium mb-4">Intent Score Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-muted" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Overall Score</span>
                        <span className="font-medium">{lead.intent_score}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-full rounded-full ${
                            lead.intent_class === 'hot' ? 'bg-red-500' : 
                            lead.intent_class === 'warm' ? 'bg-orange-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${lead.intent_score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'activity' && (
            <div className="card p-4">
              <p className="text-muted text-sm">Activity timeline coming soon...</p>
            </div>
          )}

          {activeTab === 'followups' && (
            <div className="card p-4">
              <p className="text-muted text-sm">Follow-up history coming soon...</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Assigned Agent */}
          <div className="card p-4">
            <h3 className="font-medium mb-2">Assigned Agent</h3>
            {lead.assigned_agent_id ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-medium">
                    {lead.agent_name?.charAt(0) || 'A'}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{lead.agent_name || 'Unknown'}</p>
                  <p className="text-xs text-muted">
                    Assigned {lead.assigned_at ? new Date(lead.assigned_at).toLocaleDateString() : ''}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending}
                className="btn-secondary w-full"
              >
                <UserPlus className="w-4 h-4" />
                Assign Agent
              </button>
            )}
          </div>

          {/* Next Follow-up */}
          <div className="card p-4">
            <h3 className="font-medium mb-2">Next Follow-up</h3>
            {lead.next_follow_up_at ? (
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted" />
                <div>
                  <p className="font-medium">
                    {new Date(lead.next_follow_up_at).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(lead.next_follow_up_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No follow-up scheduled</p>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-4">
            <h3 className="font-medium mb-2">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Created</span>
                <span>{new Date(lead.created_at).toLocaleDateString()}</span>
              </div>
              {lead.last_contacted_at && (
                <div className="flex justify-between">
                  <span className="text-muted">Last Contacted</span>
                  <span>{new Date(lead.last_contacted_at).toLocaleDateString()}</span>
                </div>
              )}
              {lead.converted_at && (
                <div className="flex justify-between">
                  <span className="text-muted">Converted</span>
                  <span>{new Date(lead.converted_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
