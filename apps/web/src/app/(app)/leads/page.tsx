/**
 * Leads Page - Inbox/Table View
 * 
 * Main leads list with filters, search, and bulk actions
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, agentsApi } from '@/lib/api/endpoints';
import { queryKeys, invalidateLeadsQueries } from '@/lib/state/queryClient';
import type { Lead, LeadFilters, LeadStatus, IntentClass } from '@/types/entities';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Filter, 
  UserPlus,
  Calendar,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';

// Status options for filter
const STATUS_OPTIONS: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'visit_scheduled', label: 'Visit Scheduled' },
  { value: 'visit_completed', label: 'Visit Completed' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

// Intent class options
const INTENT_OPTIONS: { value: IntentClass | ''; label: string }[] = [
  { value: '', label: 'All Intent' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
];

// Status badge component
function StatusBadge({ status }: { status: LeadStatus }) {
  const statusClass = `status-${status.replace('_', '_')}`;
  return <span className={statusClass}>{status.replace('_', ' ')}</span>;
}

// Intent badge component
function IntentBadge({ intentClass }: { intentClass: IntentClass }) {
  if (intentClass === 'hot') return <span className="badge-hot">Hot</span>;
  if (intentClass === 'warm') return <span className="badge-warm">Warm</span>;
  return <span className="badge-cold">Cold</span>;
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  
  // Filters state
  const [filters, setFilters] = useState<LeadFilters>({
    limit: 50,
    offset: 0,
  });
  const [search, setSearch] = useState('');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  // Fetch leads
  const { data: leadsData, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.leads(filters),
    queryFn: () => leadsApi.list(filters),
  });

  // Fetch agents for filter dropdown
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents(),
    queryFn: agentsApi.list,
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: (leadId: string) => leadsApi.assign(leadId),
    onSuccess: () => {
      invalidateLeadsQueries();
      setSelectedLeads(new Set());
    },
  });

  // Apply search to filters
  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search, offset: 0 }));
  };

  // Handle filter change
  const handleFilterChange = (key: keyof LeadFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, offset: 0 }));
  };

  // Toggle lead selection
  const toggleLead = (id: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeads(newSelected);
  };

  // Select all visible leads
  const toggleAllLeads = () => {
    if (!leadsData?.data) return;
    const allIds = leadsData.data.map(l => l.id);
    const newSelected = new Set(selectedLeads);
    
    if (selectedLeads.size === allIds.length) {
      newSelected.clear();
    } else {
      allIds.forEach(id => newSelected.add(id));
    }
    setSelectedLeads(newSelected);
  };

  // Bulk assign
  const handleBulkAssign = async () => {
    for (const id of selectedLeads) {
      await assignMutation.mutateAsync(id);
    }
  };

  const leads = leadsData?.data || [];
  const pagination = leadsData?.pagination;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Leads</h1>
          <p className="text-sm text-muted">
            {pagination ? `${pagination.total} total leads` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, phone, email..."
                className="input pl-9"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="input w-40"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Intent Filter */}
          <select
            value={filters.intent_class || ''}
            onChange={(e) => handleFilterChange('intent_class', e.target.value)}
            className="input w-32"
          >
            {INTENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Agent Filter */}
          <select
            value={filters.agent_id || ''}
            onChange={(e) => handleFilterChange('agent_id', e.target.value)}
            className="input w-40"
          >
            <option value="">All Agents</option>
            {agents?.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <button onClick={handleSearch} className="btn-primary">
            <Filter className="w-4 h-4" />
            Apply
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedLeads.size > 0 && (
        <div className="card p-3 flex items-center gap-4 bg-primary/5 border-primary/20">
          <span className="text-sm font-medium">
            {selectedLeads.size} selected
          </span>
          <button onClick={handleBulkAssign} className="btn-secondary text-sm">
            <UserPlus className="w-4 h-4" />
            Auto-Assign
          </button>
          <button className="btn-secondary text-sm">
            <Calendar className="w-4 h-4" />
            Schedule Follow-up
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          // Skeleton loading
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton w-4 h-4" />
                <div className="skeleton h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-danger">
            Failed to load leads. Please try again.
          </div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-muted">
            No leads found. Adjust your filters or add new leads.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedLeads.size === leads.length}
                    onChange={toggleAllLeads}
                    className="rounded"
                  />
                </th>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Intent</th>
                <th>Agent</th>
                <th>Next Follow-up</th>
                <th>Updated</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr 
                  key={lead.id} 
                  className="cursor-pointer hover:bg-bg"
                  onClick={() => window.location.href = `/leads/${lead.id}`}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="font-medium">{lead.name || 'Unknown'}</td>
                  <td className="font-mono-data text-sm">{lead.phone}</td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <IntentBadge intentClass={lead.intent_class} />
                      <span className="text-xs text-muted">({lead.intent_score})</span>
                    </div>
                  </td>
                  <td className="text-muted">{lead.agent_name || '-'}</td>
                  <td className="text-muted text-sm">
                    {lead.next_follow_up_at 
                      ? new Date(lead.next_follow_up_at).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="text-muted text-sm">
                    {new Date(lead.updated_at).toLocaleDateString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="p-1 rounded hover:bg-bg">
                      <MoreHorizontal className="w-4 h-4 text-muted" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.total > filters.limit! && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-sm text-muted">
              Showing {filters.offset! + 1} - {Math.min(filters.offset! + filters.limit!, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(prev => ({ ...prev, offset: Math.max(0, prev.offset! - prev.limit!) }))}
                disabled={filters.offset === 0}
                className="btn-ghost"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, offset: prev.offset! + prev.limit! }))}
                disabled={filters.offset! + filters.limit! >= pagination.total}
                className="btn-ghost"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
