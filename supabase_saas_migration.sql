-- =========================================================================
-- MIGRATION FOR PROFESSIONAL SAAS AUTHENTICATION & MANAGEMENT
-- =========================================================================

-- 1. ADICIONAR NOVAS COLUNAS NA TABELA DE USUÁRIOS (public.users)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS empresa TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS celular TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Aguardando Assinatura';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS situacao_pagamento TEXT DEFAULT 'Pendente';

-- Colunas de planos e assinaturas
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_atual TEXT DEFAULT 'Plano Bronze';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_status TEXT DEFAULT 'Inativo';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_valor NUMERIC(10,2) DEFAULT 49.90;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_data_contratacao TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_data_renovacao TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_data_vencimento TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_gateway TEXT DEFAULT 'Manual';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_assinatura_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_ultimo_pagamento TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano_proximo_pagamento TIMESTAMP WITH TIME ZONE;

-- 2. AJUSTAR A VALIDAÇÃO DO PAPEL DO USUÁRIO (role)
-- Remove a restrição antiga se existir e cria a nova com os papéis MASTER, ADMIN, CLIENTE
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('master', 'admin', 'cliente', 'user'));

-- 3. CRIAR ÍNDICES ÚNICOS PARCIAIS PARA EMAIL E CELULAR
-- Garante que email e celular sejam únicos quando preenchidos (ignora nulos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_uniq ON public.users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_celular_uniq ON public.users (celular) WHERE celular IS NOT NULL;

-- 4. CRIAR TABELA DE CONFIGURAÇÕES DO SAAS (public.saas_settings)
CREATE TABLE IF NOT EXISTS public.saas_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    saas_name TEXT DEFAULT 'LUMORA Flow' NOT NULL,
    logo_url TEXT,
    plano_bronze_valor NUMERIC(10,2) DEFAULT 49.90 NOT NULL,
    plano_prata_valor NUMERIC(10,2) DEFAULT 99.90 NOT NULL,
    plano_ouro_valor NUMERIC(10,2) DEFAULT 149.90 NOT NULL,
    dias_garantia INTEGER DEFAULT 7 NOT NULL,
    garantia_ativa BOOLEAN DEFAULT TRUE NOT NULL,
    novos_cadastros_ativos BOOLEAN DEFAULT TRUE NOT NULL,
    mensagem_inicial TEXT DEFAULT 'Seja bem-vindo ao LUMORA Flow!' NOT NULL,
    limite_clientes_bronze INTEGER DEFAULT 50 NOT NULL,
    limite_clientes_prata INTEGER DEFAULT 200 NOT NULL,
    limite_clientes_ouro INTEGER DEFAULT 99999 NOT NULL,
    mercado_pago_public_key TEXT,
    mercado_pago_access_token TEXT,
    whatsapp_api_key TEXT,
    google_calendar_client_id TEXT,
    google_calendar_client_secret TEXT,
    configuracoes_gerais JSONB DEFAULT '{}'::JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir configuração padrão inicial se a tabela estiver vazia
INSERT INTO public.saas_settings (id, saas_name)
SELECT '00000000-0000-0000-0000-000000000001', 'LUMORA Flow'
WHERE NOT EXISTS (SELECT 1 FROM public.saas_settings)
ON CONFLICT DO NOTHING;

-- 5. CRIAR TABELA DE LOGS DE ATIVIDADES ADMINISTRATIVAS (public.saas_logs)
CREATE TABLE IF NOT EXISTS public.saas_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    admin_id UUID,
    admin_nome TEXT,
    acao TEXT NOT NULL,
    user_id UUID,
    user_nome TEXT
);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS) E CRIAR POLÍTICAS
ALTER TABLE public.saas_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de saas_settings para todos" ON public.saas_settings;
CREATE POLICY "Permitir leitura de saas_settings para todos"
ON public.saas_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Controle total de saas_settings para master" ON public.saas_settings;
CREATE POLICY "Controle total de saas_settings para master"
ON public.saas_settings FOR ALL USING (public.is_master_user() OR EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() AND u.role = 'master'
));

DROP POLICY IF EXISTS "Controle total de saas_logs para master" ON public.saas_logs;
CREATE POLICY "Controle total de saas_logs para master"
ON public.saas_logs FOR ALL USING (public.is_master_user() OR EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() AND u.role = 'master'
));

-- 7. ATUALIZAR STATUS DO USUÁRIO MASTER 'zotgod'
-- Garante que o administrador master zotgod existente tenha papel 'master' e status 'Assinatura Ativa'
UPDATE public.users 
SET role = 'master', status = 'Assinatura Ativa', plano_status = 'Ativo', plano_atual = 'Plano Ouro'
WHERE username = 'zotgod';
