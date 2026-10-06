-- ============================================================
-- TourFlow AI — Migration 003: demo seed (destinations only)
-- Safe, idempotent demo content. No business logic depends on it.
-- ============================================================

INSERT INTO destinations (name, country, description, tags, avg_daily_cost, currency)
VALUES
  ('Paris','France','The City of Light — art, cuisine, and timeless boulevards.',
   '["history","food","museums","photography","culture"]', 12000, 'INR'),
  ('Kyoto','Japan','Temples, gardens, and centuries of tradition.',
   '["history","culture","nature","photography"]', 10000, 'INR'),
  ('Bali','Indonesia','Island of the Gods — beaches, temples, rice terraces.',
   '["nature","adventure","culture","photography"]', 7000, 'INR'),
  ('Rome','Italy','The Eternal City — ancient wonders and la dolce vita.',
   '["history","food","culture","photography"]', 11000, 'INR'),
  ('Dubai','UAE','Futuristic skyline, desert adventures, luxury shopping.',
   '["shopping","adventure","food","culture"]', 15000, 'INR')
ON CONFLICT DO NOTHING;
