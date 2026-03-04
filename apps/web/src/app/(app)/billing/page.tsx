/**
 * Billing Page
 * 
 * Plan and usage management
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { billingApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/state/queryClient';
import { CreditCard, Package, TrendingUp, AlertCircle, Check } from 'lucide-react';

export default function BillingPage() {
  // Fetch plans
  const { data: plans } = useQuery({
    queryKey: queryKeys.plans(),
    queryFn: billingApi.plans,
  });

  // Fetch current subscription
  const { data: tenantPlan, isLoading } = useQuery({
    queryKey: queryKeys.tenantPlan(),
    queryFn: billingApi.tenantPlan,
  });

  const currentPlan = tenantPlan?.plan;
  const usage = tenantPlan?.usage;
  const subscription = tenantPlan?.subscription;

  // Calculate usage percentages
  const leadsUsage = currentPlan?.limits?.leads 
    ? Math.min(100, ((usage?.leads_count || 0) / currentPlan.limits.leads) * 100)
    : 0;
  const whatsappUsage = currentPlan?.limits?.whatsapp
    ? Math.min(100, ((usage?.whatsapp_count || 0) / currentPlan.limits.whatsapp) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text">Billing & Usage</h1>
        <p className="text-sm text-muted">Manage your plan and view usage</p>
      </div>

      {/* Current Plan Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-md bg-primary/10">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{currentPlan?.name || 'Loading...'}</h2>
              <p className="text-muted">
                ₹{(currentPlan?.price_monthly || 0).toLocaleString('en-IN')}/month
              </p>
              <p className={`text-sm mt-1 ${
                subscription?.status === 'active' ? 'text-success' : 
                subscription?.status === 'past_due' ? 'text-danger' : 'text-muted'
              }`}>
                Status: {subscription?.status || 'Unknown'}
              </p>
            </div>
          </div>
          <button className="btn-primary">
            Change Plan
          </button>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Leads Usage */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">Leads this month</span>
            <span className="font-medium">
              {usage?.leads_count || 0} / {currentPlan?.limits?.leads || '∞'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-full rounded-full ${leadsUsage > 90 ? 'bg-danger' : leadsUsage > 70 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, leadsUsage)}%` }}
            />
          </div>
          {leadsUsage > 80 && (
            <p className="text-xs text-warning mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {leadsUsage > 100 ? 'Limit exceeded!' : 'Approaching limit'}
            </p>
          )}
        </div>

        {/* WhatsApp Usage */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">WhatsApp messages</span>
            <span className="font-medium">
              {usage?.whatsapp_count || 0} / {currentPlan?.limits?.whatsapp || '∞'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-full rounded-full ${whatsappUsage > 90 ? 'bg-danger' : whatsappUsage > 70 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, whatsappUsage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="card p-4">
        <h3 className="font-medium mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans?.map((plan) => (
            <div 
              key={plan.id}
              className={`p-4 rounded-md border-2 ${
                currentPlan?.id === plan.id 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">{plan.name}</h4>
                {currentPlan?.id === plan.id && (
                  <span className="badge-hot">Current</span>
                )}
              </div>
              <p className="text-2xl font-bold mb-3">
                ₹{plan.price_monthly.toLocaleString('en-IN')}
                <span className="text-sm text-muted font-normal">/mo</span>
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  {plan.limits.leads === -1 ? 'Unlimited' : plan.limits.leads} leads
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  {plan.limits.whatsapp === -1 ? 'Unlimited' : plan.limits.whatsapp} WhatsApp
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  {plan.limits.agents} agents
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  {plan.features.analytics} analytics
                </li>
              </ul>
              {currentPlan?.id !== plan.id && (
                <button className="btn-secondary w-full mt-4">
                  {plan.price_monthly > (currentPlan?.price_monthly || 0) ? 'Upgrade' : 'Downgrade'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="card p-4">
        <h3 className="font-medium mb-4">Plan Features</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {currentPlan?.features && Object.entries(currentPlan.features).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              {value ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-gray-200" />
              )}
              <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
