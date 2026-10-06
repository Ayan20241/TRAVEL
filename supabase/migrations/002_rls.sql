-- ============================================================
-- TourFlow AI — Migration 002: Row Level Security
-- Defense-in-depth: the backend ALSO enforces authorization server-side.
-- RLS is the second layer, protecting direct DB access.
-- ============================================================

-- Helper: is the caller staff?
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('OPERATOR','ADMIN')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: can the caller see this trip?
CREATE OR REPLACE FUNCTION public.can_see_trip(t trips) RETURNS BOOLEAN AS $$
  SELECT
    public.is_staff()
    OR t.traveler_id = auth.uid()
    OR (t.coordinator_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------- enable RLS everywhere ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE transportation ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE disruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE constraint_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
DROP POLICY IF EXISTS p_profiles_self ON profiles;
CREATE POLICY p_profiles_self ON profiles FOR ALL
  USING (id = auth.uid() OR public.is_staff())
  WITH CHECK (id = auth.uid() OR public.is_admin());
-- (role changes are additionally guarded: only admins via backend API)

-- ---------- destinations: public read ----------
DROP POLICY IF EXISTS p_destinations_read ON destinations;
CREATE POLICY p_destinations_read ON destinations FOR SELECT USING (true);
DROP POLICY IF EXISTS p_destinations_write ON destinations;
CREATE POLICY p_destinations_write ON destinations FOR ALL
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------- trips ----------
DROP POLICY IF EXISTS p_trips_select ON trips;
CREATE POLICY p_trips_select ON trips FOR SELECT USING (public.can_see_trip(trips));
DROP POLICY IF EXISTS p_trips_insert ON trips;
CREATE POLICY p_trips_insert ON trips FOR INSERT
  WITH CHECK (traveler_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS p_trips_update ON trips;
CREATE POLICY p_trips_update ON trips FOR UPDATE
  USING (public.can_see_trip(trips)) WITH CHECK (public.can_see_trip(trips));
DROP POLICY IF EXISTS p_trips_delete ON trips;
CREATE POLICY p_trips_delete ON trips FOR DELETE USING (public.can_see_trip(trips));

-- ---------- trip_preferences (follow the trip) ----------
DROP POLICY IF EXISTS p_prefs_all ON trip_preferences;
CREATE POLICY p_prefs_all ON trip_preferences FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_preferences.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_preferences.trip_id AND public.can_see_trip(t)));

-- ---------- itinerary items & dependencies (follow the trip) ----------
DROP POLICY IF EXISTS p_items_all ON itinerary_items;
CREATE POLICY p_items_all ON itinerary_items FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = itinerary_items.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = itinerary_items.trip_id AND public.can_see_trip(t)));

DROP POLICY IF EXISTS p_deps_all ON itinerary_dependencies;
CREATE POLICY p_deps_all ON itinerary_dependencies FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = itinerary_dependencies.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = itinerary_dependencies.trip_id AND public.can_see_trip(t)));

-- ---------- bookings / payments ----------
DROP POLICY IF EXISTS p_bookings_all ON bookings;
CREATE POLICY p_bookings_all ON bookings FOR ALL
  USING (traveler_id = auth.uid() OR public.is_staff()
         OR EXISTS (SELECT 1 FROM trips t WHERE t.id = bookings.trip_id AND t.coordinator_id = auth.uid())
         OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = bookings.vendor_id AND v.profile_id = auth.uid()))
  WITH CHECK (traveler_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS p_payments_all ON payments;
CREATE POLICY p_payments_all ON payments FOR ALL
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = payments.booking_id
                 AND (b.traveler_id = auth.uid() OR public.is_staff())))
  WITH CHECK (public.is_staff());

-- ---------- disruptions / evaluations / recovery (follow the trip) ----------
DROP POLICY IF EXISTS p_disruptions_all ON disruptions;
CREATE POLICY p_disruptions_all ON disruptions FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = disruptions.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = disruptions.trip_id AND public.can_see_trip(t)));

DROP POLICY IF EXISTS p_evaluations_all ON constraint_evaluations;
CREATE POLICY p_evaluations_all ON constraint_evaluations FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = constraint_evaluations.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = constraint_evaluations.trip_id AND public.can_see_trip(t)));

DROP POLICY IF EXISTS p_recovery_all ON recovery_options;
CREATE POLICY p_recovery_all ON recovery_options FOR ALL
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = recovery_options.trip_id AND public.can_see_trip(t)))
  WITH CHECK (EXISTS (SELECT 1 FROM trips t WHERE t.id = recovery_options.trip_id AND public.can_see_trip(t)));

-- ---------- catalog: vendors manage own rows, staff manage all ----------
DROP POLICY IF EXISTS p_vendors_select ON vendors;
CREATE POLICY p_vendors_select ON vendors FOR SELECT USING (true);
DROP POLICY IF EXISTS p_vendors_write ON vendors;
CREATE POLICY p_vendors_write ON vendors FOR ALL
  USING (public.is_staff() OR profile_id = auth.uid())
  WITH CHECK (public.is_staff() OR profile_id = auth.uid());

DROP POLICY IF EXISTS p_hotels_read ON hotels;
CREATE POLICY p_hotels_read ON hotels FOR SELECT USING (true);
DROP POLICY IF EXISTS p_hotels_write ON hotels;
CREATE POLICY p_hotels_write ON hotels FOR ALL
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS p_activities_read ON activities;
CREATE POLICY p_activities_read ON activities FOR SELECT USING (true);
DROP POLICY IF EXISTS p_activities_write ON activities;
CREATE POLICY p_activities_write ON activities FOR ALL
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS p_transport_read ON transportation;
CREATE POLICY p_transport_read ON transportation FOR SELECT USING (true);
DROP POLICY IF EXISTS p_transport_write ON transportation;
CREATE POLICY p_transport_write ON transportation FOR ALL
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ---------- notifications: owner only ----------
DROP POLICY IF EXISTS p_notifications_all ON notifications;
CREATE POLICY p_notifications_all ON notifications FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------- audit logs: staff read, backend writes (service role bypasses RLS) ----------
DROP POLICY IF EXISTS p_audit_select ON audit_logs;
CREATE POLICY p_audit_select ON audit_logs FOR SELECT USING (public.is_staff());

-- ---------- reviews: traveler owns, trip viewers read ----------
DROP POLICY IF EXISTS p_reviews_select ON reviews;
CREATE POLICY p_reviews_select ON reviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips t WHERE t.id = reviews.trip_id AND public.can_see_trip(t)));
DROP POLICY IF EXISTS p_reviews_insert ON reviews;
CREATE POLICY p_reviews_insert ON reviews FOR INSERT
  WITH CHECK (traveler_id = auth.uid());
