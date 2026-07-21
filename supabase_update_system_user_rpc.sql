-- =========================================================================
-- SCRIPT DE ATUALIZAÇÃO DO SUPABASE PARA O PAINEL ADMINISTRATIVO (SaaS)
-- =========================================================================
-- Este script atualiza as funções RPC de segurança no banco de dados para
-- permitir a ativação manual de planos, alterações de status e listagem de
-- usuários a partir de qualquer tipo de login (seja Supabase Auth ou Login de
-- Usuário Customizado) com total segurança.

-- 1. ATUALIZAR FUNÇÃO: update_system_user
-- Suporta a atualização de todos os campos do SaaS/financeiros de forma dinâmica.
-- Garante que o administrador que executa a alteração possui papel 'master'.
CREATE OR REPLACE FUNCTION public.update_system_user(
  p_id uuid,
  p_username text,
  p_password text,
  p_nome text,
  p_role text,
  p_email text DEFAULT NULL,
  p_celular text DEFAULT NULL,
  p_empresa text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_plano_atual text DEFAULT NULL,
  p_plano_status text DEFAULT NULL,
  p_plano_valor numeric DEFAULT NULL,
  p_plano_data_vencimento timestamp with time zone DEFAULT NULL,
  p_plano_data_contratacao timestamp with time zone DEFAULT NULL,
  p_plano_data_renovacao timestamp with time zone DEFAULT NULL,
  p_plano_gateway text DEFAULT NULL,
  p_plano_ultimo_pagamento timestamp with time zone DEFAULT NULL,
  p_plano_proximo_pagamento timestamp with time zone DEFAULT NULL,
  p_situacao_pagamento text DEFAULT NULL,
  p_observacoes_admin text DEFAULT NULL,
  p_must_change_password boolean DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) AS $$
BEGIN
  -- Segurança: Valida se quem está solicitando a alteração é MASTER
  IF p_admin_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = p_admin_id AND role = 'master'
    ) THEN
      RAISE EXCEPTION 'Acesso negado. Apenas administradores MASTER podem atualizar usuários.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'master'
    ) THEN
      RAISE EXCEPTION 'Acesso negado. Apenas administradores MASTER podem atualizar usuários.';
    END IF;
  END IF;

  -- Executa a atualização
  IF p_password IS NOT NULL AND p_password <> '' THEN
    UPDATE public.users
    SET username = LOWER(p_username),
        password_hash = crypt(p_password, gen_salt('bf', 8)),
        nome = p_nome,
        role = p_role,
        email = COALESCE(p_email, email),
        celular = COALESCE(p_celular, celular),
        empresa = COALESCE(p_empresa, empresa),
        status = COALESCE(p_status, status),
        plano_atual = COALESCE(p_plano_atual, plano_atual),
        plano_status = COALESCE(p_plano_status, plano_status),
        plano_valor = COALESCE(p_plano_valor, plano_valor),
        plano_data_vencimento = COALESCE(p_plano_data_vencimento, plano_data_vencimento),
        plano_data_contratacao = COALESCE(p_plano_data_contratacao, plano_data_contratacao),
        plano_data_renovacao = COALESCE(p_plano_data_renovacao, plano_data_renovacao),
        plano_gateway = COALESCE(p_plano_gateway, plano_gateway),
        plano_ultimo_pagamento = COALESCE(p_plano_ultimo_pagamento, plano_ultimo_pagamento),
        plano_proximo_pagamento = COALESCE(p_plano_proximo_pagamento, plano_proximo_pagamento),
        situacao_pagamento = COALESCE(p_situacao_pagamento, situacao_pagamento),
        observacoes_admin = COALESCE(p_observacoes_admin, observacoes_admin),
        must_change_password = COALESCE(p_must_change_password, must_change_password)
    WHERE public.users.id = p_id;
  ELSE
    UPDATE public.users
    SET username = LOWER(p_username),
        nome = p_nome,
        role = p_role,
        email = COALESCE(p_email, email),
        celular = COALESCE(p_celular, celular),
        empresa = COALESCE(p_empresa, empresa),
        status = COALESCE(p_status, status),
        plano_atual = COALESCE(p_plano_atual, plano_atual),
        plano_status = COALESCE(p_plano_status, plano_status),
        plano_valor = COALESCE(p_plano_valor, plano_valor),
        plano_data_vencimento = COALESCE(p_plano_data_vencimento, plano_data_vencimento),
        plano_data_contratacao = COALESCE(p_plano_data_contratacao, plano_data_contratacao),
        plano_data_renovacao = COALESCE(p_plano_data_renovacao, plano_data_renovacao),
        plano_gateway = COALESCE(p_plano_gateway, plano_gateway),
        plano_ultimo_pagamento = COALESCE(p_plano_ultimo_pagamento, plano_ultimo_pagamento),
        plano_proximo_pagamento = COALESCE(p_plano_proximo_pagamento, plano_proximo_pagamento),
        situacao_pagamento = COALESCE(p_situacao_pagamento, situacao_pagamento),
        observacoes_admin = COALESCE(p_observacoes_admin, observacoes_admin),
        must_change_password = COALESCE(p_must_change_password, must_change_password)
    WHERE public.users.id = p_id;
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.nome, u.role, u.created_at
  FROM public.users u
  WHERE u.id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. ATUALIZAR FUNÇÃO: get_system_users
-- Permite listar os usuários no painel validando a identidade MASTER por ID do admin.
CREATE OR REPLACE FUNCTION public.get_system_users(p_admin_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone,
  email text,
  empresa text,
  celular text,
  foto_url text,
  status text,
  ultimo_acesso timestamp with time zone,
  situacao_pagamento text,
  plano_atual text,
  plano_status text,
  plano_valor numeric,
  plano_data_contratacao timestamp with time zone,
  plano_data_renovacao timestamp with time zone,
  plano_data_vencimento timestamp with time zone,
  plano_gateway text,
  plano_assinatura_id text,
  plano_ultimo_pagamento timestamp with time zone,
  plano_proximo_pagamento timestamp with time zone,
  created_by text,
  observacoes_admin text,
  must_change_password boolean
) AS $$
BEGIN
  -- Segurança: Valida se quem está solicitando a listagem é MASTER
  IF p_admin_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = p_admin_id AND role = 'master'
    ) THEN
      RAISE EXCEPTION 'Acesso negado. Apenas o usuário MASTER pode listar todos os usuários.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'master'
    ) THEN
      RAISE EXCEPTION 'Acesso negado. Apenas o usuário MASTER pode listar todos os usuários.';
    END IF;
  END IF;

  RETURN QUERY
  SELECT 
    u.id, 
    u.username, 
    u.nome, 
    u.role, 
    u.created_at,
    u.email,
    u.empresa,
    u.celular,
    u.foto_url,
    u.status,
    u.ultimo_acesso,
    u.situacao_pagamento,
    u.plano_atual,
    u.plano_status,
    u.plano_valor::numeric,
    u.plano_data_contratacao,
    u.plano_data_renovacao,
    u.plano_data_vencimento,
    u.plano_gateway,
    u.plano_assinatura_id,
    u.plano_ultimo_pagamento,
    u.plano_proximo_pagamento,
    u.created_by,
    u.observacoes_admin,
    u.must_change_password
  FROM public.users u
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
