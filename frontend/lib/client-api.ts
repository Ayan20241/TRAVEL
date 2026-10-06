"use client";
// Client-component API helper: attaches the Supabase JWT automatically.
import { supabaseBrowser } from "./supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (data.session?.access_token) headers["Authorization"] = `Bearer ${data.session.access_token}`;
  const res = await fetch(`${BACKEND}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error?.message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// Shared TypeScript types mirroring the backend (see contracts/openapi.yaml)
export type Trip = {
  id: string; traveler_id: string; title: string; destination: string;
  start_date: string; end_date: string; duration_days: number;
  budget: number | null; currency: string; status: string; travel_style: string | null;
};
export type ItineraryItem = {
  id: string; trip_id: string; type: string; title: string; description: string | null;
  location: string | null; start_time: string; end_time: string; cost: number | null;
  currency: string; status: string; booked_status: string; is_fixed: boolean; sequence_order: number;
};
export type Disruption = {
  id: string; trip_id: string; type: string; source_item_id: string | null;
  delay_minutes: number; reason: string | null; status: string; created_at: string;
};
export type RecoveryOption = {
  id: string; action: string; title: string; description: string | null;
  estimated_cost_delta: number; experience_impact: string | null; feasibility: boolean;
  ai_rank: number | null; ai_reason: string | null; affected_items: string[];
  changes: Record<string, unknown>; selected: boolean;
};
export type Booking = {
  id: string; trip_id: string; service_type: string; service_name: string;
  status: string; amount: number | null; currency: string; reference_code: string | null;
  booked_at: string | null;
};
export type Destination = {
  id: string; name: string; country: string; description: string | null;
  image_url: string | null; tags: string[]; avg_daily_cost: number | null; currency: string;
};
export type Recommendation = {
  title: string; description: string; category: string; estimated_cost: number | null; score: number;
};
export type Pricing = {
  trip_id: string; currency: string; transportation: number; accommodation: number;
  activities: number; other: number; base_cost: number; additional_cost: number;
  discount: number; estimated_total: number; budget: number | null; within_budget: boolean | null;
};
export type TripPreferences = {
  budget: number | null; accommodation_preference: string | null;
  transportation_preference: string | null; interests: string[];
  activity_preferences: string[]; pace: string | null; travel_style: string | null; notes: string | null;
};
export type Dependency = {
  id: string; trip_id: string; source_item_id: string; target_item_id: string;
  dependency_type: string; minimum_required_buffer_minutes: number;
};
export type Impact = {
  evaluation_id: string; feasible: boolean; affected_items: Record<string, string>;
  broken_items: string[]; at_risk_items: string[]; violations: unknown[];
  warnings: unknown[]; explanation: string;
};
export type NotificationItem = {
  id: string; title: string; body: string | null; kind: string; read: boolean;
  trip_id: string | null; created_at: string;
};
export type Review = {
  id: string; trip_id: string; traveler_id: string; rating: number; comment: string | null; created_at: string;
};
export type Profile = {
  id: string; email: string; full_name: string | null; role: string; phone: string | null;
};
