-- =============================================
-- Run this SQL in Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > Paste & Run
-- =============================================

CREATE TABLE IF NOT EXISTS loan_requests (
  id SERIAL PRIMARY KEY,
  prediction_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  officer_name TEXT,
  officer_reason TEXT,
  officer_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS (backend uses service_role key which bypasses RLS anyway)
ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Service role full access on loan_requests"
  ON loan_requests FOR ALL
  USING (true)
  WITH CHECK (true);
