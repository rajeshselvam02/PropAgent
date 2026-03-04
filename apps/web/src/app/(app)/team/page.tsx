/**
 * Team Management Page
 * 
 * User management for managers/admins
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/state/queryClient';
import type { User } from '@/types/entities';
import { UserPlus, MoreHorizontal, Shield, User as UserIcon } from 'lucide-react';

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Fetch team members
  const { data: users, isLoading } = useQuery({
    queryKey: queryKeys.team(),
    queryFn: teamApi.list,
  });

  // Disable user mutation
  const disableMutation = useMutation({
    mutationFn: (id: string) => teamApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.team() });
    },
  });

  // Enable user mutation
  const enableMutation = useMutation({
    mutationFn: (id: string) => teamApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.team() });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Team</h1>
          <p className="text-sm text-muted">
            {users?.length || 0} team members
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn-primary"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Team List */}
      {isLoading ? (
        <div className="card p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <UserIcon className="w-12 h-12 mx-auto text-muted mb-4" />
          <p>No team members yet</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: User) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-primary font-medium text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="text-muted">{user.email}</td>
                  <td>
                    <span className={`badge ${
                      user.role === 'admin' ? 'badge-hot' :
                      user.role === 'manager' ? 'badge-warm' :
                      'badge-cold'
                    }`}>
                      {user.role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-muted text-sm">
                    {user.last_login_at 
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td>
                    <button className="p-1 rounded hover:bg-bg">
                      <MoreHorizontal className="w-4 h-4 text-muted" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal (placeholder) */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Invite Team Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input type="text" className="input" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" className="input" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select className="input">
                  <option value="agent">Agent</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button className="btn-primary flex-1">
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
