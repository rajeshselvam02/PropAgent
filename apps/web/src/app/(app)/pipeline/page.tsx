/**
 * Pipeline Kanban Page
 * 
 * Drag-and-drop board for lead pipeline management
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi } from '@/lib/api/endpoints';
import { queryKeys, invalidateLeadsQueries } from '@/lib/state/queryClient';
import type { Lead, LeadStatus } from '@/types/entities';
import { UserPlus, Calendar, Phone, Mail, MapPin } from 'lucide-react';

// Kanban columns
const COLUMNS: { id: LeadStatus; title: string; color: string }[] = [
  { id: 'new', title: 'New', color: 'bg-gray-100' },
  { id: 'contacted', title: 'Contacted', color: 'bg-blue-100' },
  { id: 'qualified', title: 'Qualified', color: 'bg-purple-100' },
  { id: 'visit_scheduled', title: 'Visit Scheduled', color: 'bg-yellow-100' },
  { id: 'visit_completed', title: 'Visit Done', color: 'bg-green-100' },
  { id: 'converted', title: 'Converted', color: 'bg-green-200' },
  { id: 'lost', title: 'Lost', color: 'bg-red-100' },
];

// Intent badge
function IntentBadge({ intentClass }: { intentClass: string }) {
  if (intentClass === 'hot') return <span className="badge-hot">Hot</span>;
  if (intentClass === 'warm') return <span className="badge-warm">Warm</span>;
  return <span className="badge-cold">Cold</span>;
}

// Lead card component
function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: (e: React.DragEvent, lead: Lead) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="bg-white rounded-md p-3 shadow-sm border border-border cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-text text-sm">{lead.name || 'Unknown'}</h4>
          <p className="text-xs text-muted">{lead.phone}</p>
        </div>
        <IntentBadge intentClass={lead.intent_class} />
      </div>

      {/* Budget */}
      {lead.budget_min && lead.budget_max && (
        <p className="text-xs text-muted mb-2">
          ₹{lead.budget_min / 100000}L - ₹{lead.budget_max / 100000}L
        </p>
      )}

      {/* Location */}
      {lead.preferred_location && (
        <p className="text-xs text-muted mb-2 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {lead.preferred_location}
        </p>
      )}

      {/* Agent */}
      {lead.agent_name && (
        <p className="text-xs text-muted mb-2">
          Agent: {lead.agent_name}
        </p>
      )}

      {/* Score */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted">Score:</span>
        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
          <div 
            className={`h-full rounded-full ${lead.intent_class === 'hot' ? 'bg-red-500' : lead.intent_class === 'warm' ? 'bg-orange-500' : 'bg-blue-500'}`}
            style={{ width: `${lead.intent_score}%` }}
          />
        </div>
        <span className="font-mono-data">{lead.intent_score}</span>
      </div>

      {/* Follow-up */}
      {lead.next_follow_up_at && (
        <p className="text-xs text-warning mt-2 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(lead.next_follow_up_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);

  // Fetch all leads (no status filter)
  const { data: leadsData, isLoading } = useQuery({
    queryKey: queryKeys.leads({ limit: 500 }),
    queryFn: () => leadsApi.list({ limit: 500 }),
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      leadsApi.updateStatus(leadId, { status }),
    onSuccess: () => {
      invalidateLeadsQueries();
    },
  });

  // Group leads by status
  const leadsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = leadsData?.data?.filter(l => l.status === col.id) || [];
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, newStatus: LeadStatus) => {
    e.preventDefault();
    if (draggedLead && draggedLead.status !== newStatus) {
      updateStatusMutation.mutate({ leadId: draggedLead.id, status: newStatus });
    }
    setDraggedLead(null);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-muted">Loading pipeline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Pipeline</h1>
          <p className="text-sm text-muted">
            Drag leads between columns to update status
          </p>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(column => {
          const leads = leadsByStatus[column.id] || [];
          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-72"
              onDrop={(e) => handleDrop(e, column.id)}
              onDragOver={handleDragOver}
            >
              {/* Column Header */}
              <div className={`${column.color} rounded-t-md px-3 py-2 flex items-center justify-between`}>
                <h3 className="font-medium text-sm text-gray-800">{column.title}</h3>
                <span className="text-xs text-gray-600 bg-white/50 px-2 py-0.5 rounded-full">
                  {leads.length}
                </span>
              </div>

              {/* Cards */}
              <div className={`${column.color} rounded-b-md p-2 min-h-[400px] space-y-2`}>
                {leads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onDragStart={handleDragStart}
                  />
                ))}
                {leads.length === 0 && (
                  <div className="text-center text-muted text-sm py-8">
                    No leads
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
