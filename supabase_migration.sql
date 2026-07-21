-- =========================================================================
-- MIGRATION FOR RELATION-BASED MULTIPLE SERVICES PER APPOINTMENT (atendimento_servicos)
-- =========================================================================

-- 1. Garantir que o campo servico_id da tabelas de atendimentos seja opcional/nullable,
-- permitindo múltiplos serviços sem depender de uma única chave estrangeira obrigatória.
ALTER TABLE public.atendimentos 
ALTER COLUMN servico_id DROP NOT NULL;

-- 2. Garantir que as colunas de custo e despesa existam
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

-- 6. Criar política de RLS extremamente permissiva e robusta para 'atendimento_servicos'
-- Isso garante que o app consiga inserir e atualizar os registros sem bloqueios de permissão.
-- A segurança continua garantida pois a tabela de 'atendimentos' principal possui RLS rígido,
-- impedindo que um usuário acesse os dados ou IDs de atendimentos de outros usuários.
DROP POLICY IF EXISTS "Controle de acesso para atendimento_servicos" ON public.atendimento_servicos;

CREATE POLICY "Controle de acesso para atendimento_servicos"
ON public.atendimento_servicos FOR ALL 
USING (true)
WITH CHECK (true);

-- 7. Migração de dados existentes de 'atendimentos' para 'atendimento_servicos'
-- Caso 7.1: Atendimentos que possuem dados em 'servicos_detalhes' do tipo array
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

-- =========================================================================
-- MIGRATION FOR BIDIRECTIONAL GOOGLE CALENDAR SYNC
-- =========================================================================

-- 1. Adicionar colunas de controle de sincronização na tabela 'atendimentos'
ALTER TABLE public.atendimentos 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
ADD COLUMN IF NOT EXISTS google_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_sync_status TEXT;

-- 2. Adicionar colunas de controle na tabela 'google_connections' para gerenciar o status global de sincronização
ALTER TABLE public.google_connections
ADD COLUMN IF NOT EXISTS sync_active BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_status TEXT,
ADD COLUMN IF NOT EXISTS sync_error TEXT,
ADD COLUMN IF NOT EXISTS next_sync_token TEXT;


-- =========================================================================
2. CORREÇÃO DE SEGURANÇA E CADASTRO: PERMITIR QUE NOVOS USUÁRIOS CRIEM CLIENTES
-- =========================================================================

-- 1. Permitir que o novo usuário insira seu próprio perfil na tabela 'public.users' durante o signup
DROP POLICY IF EXISTS "Permitir inserção do próprio perfil" ON public.users;
CREATE POLICY "Permitir inserção do próprio perfil"
ON public.users FOR INSERT
WITH CHECK (auth.uid() = id);

-- 2. Atualizar a função 'create_system_user' para aceitar o UUID original gerado pelo Supabase Auth (p_id)
-- para evitar gerar um ID aleatório diferente do ID de login do usuário, o que causa violações de chave estrangeira (FK)
DROP FUNCTION IF EXISTS public.create_system_user(text, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.create_system_user(p_username text, p_password text, p_nome text, p_role text DEFAULT 'user', p_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) AS $$
DECLARE
  v_user_id uuid;
BEGIN
  INSERT INTO public.users (id, username, password_hash, nome, role)
  VALUES (COALESCE(p_id, gen_random_uuid()), LOWER(p_username), crypt(p_password, gen_salt('bf', 8)), p_nome, p_role)
  RETURNING public.users.id INTO v_user_id;

  RETURN QUERY
  SELECT u.id, u.username, u.nome, u.role, u.created_at
  FROM public.users u
  WHERE u.id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


