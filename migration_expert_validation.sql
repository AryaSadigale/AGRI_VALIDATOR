-- ============================================================
-- MIGRATION: Multi-Expert Rulebook Validation Support
-- Run this in Supabase SQL Editor:
-- Supabase Dashboard > SQL Editor > New Query > Paste & Run
-- ============================================================

-- Optional summary columns on the existing prediction table.
-- The backend already works without these columns, but once added it will
-- automatically store richer final validation results.
ALTER TABLE public.prediction_history
  ADD COLUMN IF NOT EXISTS expert_advisory TEXT,
  ADD COLUMN IF NOT EXISTS final_risk TEXT,
  ADD COLUMN IF NOT EXISTS final_decision TEXT,
  ADD COLUMN IF NOT EXISTS final_decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS farmer_explanation TEXT,
  ADD COLUMN IF NOT EXISTS expert_consensus JSONB;

-- One row per expert PDF/source per prediction.
CREATE TABLE IF NOT EXISTS public.expert_rulebook_validations (
  id SERIAL PRIMARY KEY,
  prediction_id INTEGER NOT NULL REFERENCES public.prediction_history(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('Low', 'Medium', 'High')),
  confidence NUMERIC(5, 3) DEFAULT 0,
  applicable BOOLEAN DEFAULT TRUE,
  matched_rules JSONB DEFAULT '[]'::jsonb,
  advisory TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_rulebook_validations_prediction_id
  ON public.expert_rulebook_validations(prediction_id);

CREATE INDEX IF NOT EXISTS idx_expert_rulebook_validations_source_id
  ON public.expert_rulebook_validations(source_id);

CREATE INDEX IF NOT EXISTS idx_prediction_history_final_risk
  ON public.prediction_history(final_risk);

-- Keep RLS enabled. Backend uses service_role, but policies make dashboard
-- experimentation easier if you later query this table directly.
ALTER TABLE public.expert_rulebook_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on expert_rulebook_validations"
  ON public.expert_rulebook_validations;

CREATE POLICY "Service role full access on expert_rulebook_validations"
  ON public.expert_rulebook_validations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- DONE
-- New API responses can now be persisted:
-- prediction_history.final_risk
-- prediction_history.final_decision
-- prediction_history.final_decision_reason
-- prediction_history.farmer_explanation
-- prediction_history.expert_consensus
-- expert_rulebook_validations rows for all three PDF expert sources
-- ============================================================
