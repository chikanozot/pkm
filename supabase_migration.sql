-- =========================================================================
-- MIGRATION FOR RELATION-BASED MULTIPLE SERVICES PER APPOINTMENT (atendimento_servicos)
-- =========================================================================

-- 1. Garantir que o campo servico_id da tabela de atendimentos seja opcional/nullable,
-- permitindo múltiplos serviços sem depender de uma única chave estrangeira obrigatória.
ALTER TABLE public.atendimentos 
ALTER COLUMN servico_id DROP NOT NULL;

-- 2. Garantir que as colunas anteriores existem
ALTER TABLE public.servicos 
ADD COLUMN IF NOT EXISTS custo NUMERIC(10,2) DEFAULT 0.00 NOT NULL;

ALTER TABLE public.despesas 
ADD COLUMN IF NOT EXISTS atendimento_id UUID REFERENCES public.atendimentos(id) ON DELETE CASCADE;

-- 3. Criar a tabela de relacionamento 'atendimento_servicos' para suportar múltiplos serviços por atendimento se não existir
CREATE TABLE IF NOT EXISTS public.atendimento_servicos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    atendimento_id UUID REFERENCES public.atendimentos(id) ON DELETE CASCADE NOT NULL,
    servico_id UUID REFERENCES public.servicos(id) ON DELETE CASCADE NOT NULL,
    valor_aplicado NUMERIC(10,2) NOT NULL,
    custo_aplicado NUMERIC(10,2) NOT NULL,
    duracao_aplicada INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Criar índices para otimização de busca na nova tabela de relacionamento
CREATE INDEX IF NOT EXISTS idx_atendimento_servicos_atendimento_id ON public.atendimento_servicos(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_servicos_servico_id ON public.atendimento_servicos(servico_id);

-- 5. Habilitar RLS para 'atendimento_servicos'
ALTER TABLE public.atendimento_servicos ENABLE ROW LEVEL SECURITY;

-- 6. Criar política de RLS para 'atendimento_servicos' (remove se já existir para evitar erro de duplicação)
DROP POLICY IF EXISTS "Controle de acesso para atendimento_servicos" ON public.atendimento_servicos;

CREATE POLICY "Controle de acesso para atendimento_servicos"
ON public.atendimento_servicos FOR ALL USING (
    public.is_master_user() OR 
    EXISTS (
        SELECT 1 FROM public.atendimentos a 
        WHERE a.id = atendimento_servicos.atendimento_id 
          AND (a.user_id = public.current_app_user_id() OR public.is_master_user())
    )
) WITH CHECK (
    public.is_master_user() OR 
    EXISTS (
        SELECT 1 FROM public.atendimentos a 
        WHERE a.id = atendimento_servicos.atendimento_id 
          AND (a.user_id = public.current_app_user_id() OR public.is_master_user())
    )
);

-- 7. Migração de dados existentes de 'atendimentos' para 'atendimento_servicos'
-- Caso 7.1: Atendimentos que possuem dados em 'servicos_detalhes' do tipo array
-- Primeiro garantimos que a coluna servicos_detalhes exista para a migração ler, se for o caso
-- (se ela já existia com dados de um estado intermediário)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='atendimentos' AND column_name='servicos_detalhes'
    ) THEN
        INSERT INTO public.atendimento_servicos (atendimento_id, servico_id, valor_aplicado, custo_aplicado, duracao_aplicada, created_at)
        SELECT 
            a.id as atendimento_id,
            (m.elem->>'servico_id')::uuid as servico_id,
            (m.elem->>'valor')::numeric as valor_aplicado,
            COALESCE((m.elem->>'custo')::numeric, 0.00) as custo_aplicado,
            (m.elem->>'duracao')::integer as duracao_aplicada,
            a.created_at
        FROM public.atendimentos a,
        LATERAL jsonb_array_elements(a.servicos_detalhes) m(elem)
        WHERE jsonb_typeof(a.servicos_detalhes) = 'array' 
          AND jsonb_array_length(a.servicos_detalhes) > 0
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Caso 7.2: Atendimentos antigos que não possuem itens migrados ainda e têm o 'servico_id' direto na tabela 'atendimentos'
INSERT INTO public.atendimento_servicos (atendimento_id, servico_id, valor_aplicado, custo_aplicado, duracao_aplicada, created_at)
SELECT 
    a.id as atendimento_id,
    a.servico_id,
    a.valor_cobrado as valor_aplicado,
    COALESCE(a.custo, 0.00) as custo_aplicado,
    a.duracao as duracao_aplicada,
    a.created_at
FROM public.atendimentos a
WHERE NOT EXISTS (
    SELECT 1 FROM public.atendimento_servicos s WHERE s.atendimento_id = a.id
) AND a.servico_id IS NOT NULL
ON CONFLICT DO NOTHING;
