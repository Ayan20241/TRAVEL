-- ============================================================
-- TourFlow AI — Migration 001: enums + core tables
-- Apply in Supabase SQL editor (in order) or via Supabase CLI.
-- ============================================================

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('TRAVELER','OPERATOR','COORDINATOR','VENDOR','ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trip_status AS ENUM ('DRAFT','PLANNING','READY','BOOKED','IN_PROGRESS','DISRUPTED','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_type AS ENUM ('FLIGHT','TRAIN','BUS','TRANSFER','HOTEL','ACTIVITY','EVENT','RESTAURANT','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE item_status AS ENUM ('PLANNED','CONFIRMED','AT_RISK','BROKEN','CANCELLED','COMPLETED','REBOOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_status AS ENUM ('PLANNED','PENDING','CONFIRMED','CANCELLED','REBOOKED','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE disruption_type AS ENUM ('FLIGHT_DELAY','FLIGHT_CANCELLATION','TRAIN_DELAY','HOTEL_UNAVAILABLE','ACTIVITY_CANCELLED','TRANSFER_UNAVAILABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE disruption_status AS ENUM ('OPEN','ANALYZED','RECOVERY_PROPOSED','RESOLVED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE recovery_action AS ENUM ('RESCHEDULE_ITEM','CHANGE_TRANSFER','MOVE_RESTAURANT','REPLACE_ACTIVITY','CANCEL_OPTIONAL_ACTIVITY','REPLACE_TRANSPORT','MODIFY_TIMING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dependency_type AS ENUM ('SEQUENTIAL','SPATIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('PENDING','PAID','FAILED','REFUNDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- profiles (id == auth.users.id) ----------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'TRAVELER',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- destinations ----------
CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  avg_daily_cost NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_destinations_country ON destinations(country);

-- ---------- trips ----------
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traveler_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  coordinator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INT NOT NULL CHECK (duration_days >= 1),
  budget NUMERIC(14,2) CHECK (budget IS NULL OR budget >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status trip_status NOT NULL DEFAULT 'DRAFT',
  travel_style TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_trips_traveler ON trips(traveler_id);
CREATE INDEX IF NOT EXISTS ix_trips_status ON trips(status);

-- ---------- trip_preferences ----------
CREATE TABLE IF NOT EXISTS trip_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  budget NUMERIC(14,2),
  accommodation_preference TEXT,
  transportation_preference TEXT,
  interests JSONB NOT NULL DEFAULT '[]',
  activity_preferences JSONB NOT NULL DEFAULT '[]',
  pace TEXT,
  travel_style TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- vendors / hotels / activities / transportation ----------
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  city TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rating NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vendors_service_type ON vendors(service_type);

CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT,
  stars INT CHECK (stars IS NULL OR (stars BETWEEN 1 AND 7)),
  price_per_night NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  amenities JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_hotels_city ON hotels(city);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  category TEXT,
  duration_minutes INT,
  price NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_activities_city ON activities(city);

CREATE TABLE IF NOT EXISTS transportation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  origin TEXT,
  destination TEXT,
  price NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- itinerary ----------
CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  cost NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status item_status NOT NULL DEFAULT 'PLANNED',
  booked_status booking_status NOT NULL DEFAULT 'PLANNED',
  is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  booking_id UUID, -- FK added after bookings table exists
  sequence_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS ix_itinerary_trip ON itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS ix_itinerary_trip_seq ON itinerary_items(trip_id, sequence_order);

CREATE TABLE IF NOT EXISTS itinerary_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  source_item_id UUID NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  dependency_type dependency_type NOT NULL DEFAULT 'SEQUENTIAL',
  minimum_required_buffer_minutes INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dependency_pair UNIQUE (source_item_id, target_item_id),
  CHECK (source_item_id <> target_item_id)
);
CREATE INDEX IF NOT EXISTS ix_dependency_trip ON itinerary_dependencies(trip_id);

-- ---------- bookings / payments ----------
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  traveler_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  reference_code TEXT,
  status booking_status NOT NULL DEFAULT 'PLANNED',
  amount NUMERIC(12,2),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  booked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS ix_bookings_traveler ON bookings(traveler_id);

-- now the deferred FK
DO $$ BEGIN
  ALTER TABLE itinerary_items ADD CONSTRAINT fk_itinerary_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'PENDING',
  provider TEXT,
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- disruptions / evaluations / recovery ----------
CREATE TABLE IF NOT EXISTS disruptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type disruption_type NOT NULL,
  source_item_id UUID REFERENCES itinerary_items(id) ON DELETE SET NULL,
  original_start_time TIMESTAMPTZ,
  new_start_time TIMESTAMPTZ,
  delay_minutes INT NOT NULL DEFAULT 0,
  reason TEXT,
  status disruption_status NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_disruptions_trip ON disruptions(trip_id);

CREATE TABLE IF NOT EXISTS constraint_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  disruption_id UUID REFERENCES disruptions(id) ON DELETE SET NULL,
  feasible BOOLEAN NOT NULL DEFAULT TRUE,
  violations JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  affected_items JSONB NOT NULL DEFAULT '{}',
  broken_items JSONB NOT NULL DEFAULT '[]',
  at_risk_items JSONB NOT NULL DEFAULT '[]',
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_evaluations_trip ON constraint_evaluations(trip_id);

CREATE TABLE IF NOT EXISTS recovery_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  disruption_id UUID NOT NULL REFERENCES disruptions(id) ON DELETE CASCADE,
  action recovery_action NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_cost_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  experience_impact TEXT,
  feasibility BOOLEAN NOT NULL DEFAULT FALSE,
  ai_rank INT,
  affected_items JSONB NOT NULL DEFAULT '[]',
  changes JSONB NOT NULL DEFAULT '{}',
  reason TEXT,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ,
  selected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_recovery_disruption ON recovery_options(disruption_id);

-- ---------- notifications / audit / reviews ----------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_state JSONB NOT NULL DEFAULT '{}',
  new_state JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  traveler_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_reviews_trip ON reviews(trip_id);

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','destinations','trips','trip_preferences','vendors','hotels',
    'activities','transportation','itinerary_items','itinerary_dependencies','bookings','payments',
    'disruptions','constraint_evaluations','recovery_options','notifications','reviews']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ---------- auto-create profile on signup ----------
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'TRAVELER')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
