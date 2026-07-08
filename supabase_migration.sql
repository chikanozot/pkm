-- MIGRATION FOR ADDING SERVICE COST, LINKED EXPENSES, AND MULTIPLE SERVICES PER APPOINTMENT

-- 1. Add 'custo' column to 'servicos' table (if not exists)
ALTER TABLE public.servicos 
ADD COLUMN IF NOT EXISTS custo NUMERIC(10,2) DEFAULT 0.00 NOT NULL;

-- 2. Add 'atendimento_id' column to 'despesas' table (if not exists)
ALTER TABLE public.despesas 
ADD COLUMN IF NOT EXISTS atendimento_id UUID REFERENCES public.atendimentos(id) ON DELETE CASCADE;

-- 3. Add 'servicos_detalhes' column to 'atendimentos' table (if not exists) to support multiple services
ALTER TABLE public.atendimentos 
ADD COLUMN IF NOT EXISTS servicos_detalhes JSONB DEFAULT '[]'::jsonb NOT NULL;

-- 4. Document or update RLS policies if necessary
-- Note: Existing RLS policies automatically apply because they use "current_app_user_id() = user_id".

