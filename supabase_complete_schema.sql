-- =========================================================================
-- COMPLETE SUPABASE SCHEMA & FUNCTIONS FOR LUMORA FLOW
-- =========================================================================

-- 1. Habilitar extensões necessárias para segurança e chaves únicas
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- =========================================================================
-- DROPAR FUNÇÕES ANTIGAS PARA EVITAR CONFLITOS DE ASSINATURA/RETORNO (42P13)
-- =========================================================================
drop function if exists public.authenticate_user(text, text) cascade;
drop function if exists public.create_system_user(text, text, text, text) cascade;
drop function if exists public.update_system_user(uuid, text, text, text, text) cascade;
drop function if exists public.get_system_users() cascade;
drop function if exists public.delete_system_user(uuid) cascade;
drop function if exists public.is_master_user() cascade;
drop function if exists public.current_app_user_id() cascade;

-- =========================================================================
-- 2. CRIAR TABELA DE USUÁRIOS PRIMEIRO (Para as funções poderem compilar e referenciar)
-- =========================================================================
create table if not exists public.users (
    id uuid default gen_random_uuid() primary key,
    username text unique not null,
    password_hash text not null,
    nome text not null,
    role text default 'user' not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Adicionar colunas do SaaS se não existirem
alter table public.users add column if not exists email text;
alter table public.users add column if not exists empresa text;
alter table public.users add column if not exists celular text;
alter table public.users add column if not exists foto_url text;
alter table public.users add column if not exists status text default 'Aguardando Assinatura';
alter table public.users add column if not exists ultimo_acesso timestamp with time zone;
alter table public.users add column if not exists situacao_pagamento text default 'Pendente';

-- Colunas de planos e assinaturas SaaS
alter table public.users add column if not exists plano_atual text default 'Plano Bronze';
alter table public.users add column if not exists plano_status text default 'Inativo';
alter table public.users add column if not exists plano_valor numeric(10,2) default 49.90;
alter table public.users add column if not exists plano_data_contratacao timestamp with time zone;
alter table public.users add column if not exists plano_data_renovacao timestamp with time zone;
alter table public.users add column if not exists plano_data_vencimento timestamp with time zone;
alter table public.users add column if not exists plano_gateway text default 'Manual';
alter table public.users add column if not exists plano_assinatura_id text;
alter table public.users add column if not exists plano_ultimo_pagamento timestamp with time zone;
alter table public.users add column if not exists plano_proximo_pagamento timestamp with time zone;

-- Ajustar a restrição de role se necessário
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('master', 'admin', 'cliente', 'user'));

-- Criar índices únicos case-insensitive e parciais
create unique index if not exists idx_users_username_lower on public.users (lower(username));
create unique index if not exists idx_users_email_uniq on public.users (email) where email is not null;
create unique index if not exists idx_users_celular_uniq on public.users (celular) where celular is not null;


-- =========================================================================
-- 3. CRIAÇÃO DE FUNÇÕES / PROCEDURES (RPCs)
-- =========================================================================

-- Função: Obter ID do usuário do app
create or replace function public.current_app_user_id()
returns uuid as $$
begin
  if current_setting('app.current_user_id', true) is not null and current_setting('app.current_user_id', true) <> '' then
    return current_setting('app.current_user_id', true)::uuid;
  end if;
  return auth.uid();
end;
$$ language plpgsql stable;

-- Função: Verificar se é usuário MASTER
create or replace function public.is_master_user()
returns boolean as $$
declare
  v_role text;
begin
  select role into v_role from public.users where id = public.current_app_user_id();
  return coalesce(v_role = 'master', false);
end;
$$ language plpgsql stable security definer;

-- Função: Autenticar usuário customizado
create or replace function public.authenticate_user(p_username text, p_password text)
returns table (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) as $$
begin
  return query
  select u.id, u.username, u.nome, u.role, u.created_at
  from public.users u
  where lower(u.username) = lower(p_username)
    and u.password_hash = crypt(p_password, u.password_hash);
end;
$$ language plpgsql security definer;

-- Função: Criar usuário do sistema
create or replace function public.create_system_user(p_username text, p_password text, p_nome text, p_role text default 'user')
returns table (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) as $$
declare
  v_user_id uuid;
begin
  insert into public.users (username, password_hash, nome, role)
  values (lower(p_username), crypt(p_password, gen_salt('bf', 8)), p_nome, p_role)
  returning public.users.id into v_user_id;

  return query
  select u.id, u.username, u.nome, u.role, u.created_at
  from public.users u
  where u.id = v_user_id;
end;
$$ language plpgsql security definer;

-- Função: Atualizar usuário do sistema
create or replace function public.update_system_user(p_id uuid, p_username text, p_password text, p_nome text, p_role text)
returns table (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) as $$
begin
  if p_password is not null and p_password <> '' then
    update public.users
    set username = lower(p_username),
        password_hash = crypt(p_password, gen_salt('bf', 8)),
        nome = p_nome,
        role = p_role
    where public.users.id = p_id;
  else
    update public.users
    set username = lower(p_username),
        nome = p_nome,
        role = p_role
    where public.users.id = p_id;
  end if;

  return query
  select u.id, u.username, u.nome, u.role, u.created_at
  from public.users u
  where u.id = p_id;
end;
$$ language plpgsql security definer;

-- Função: Obter todos os usuários do sistema (Seguro para painel admin)
create or replace function public.get_system_users()
returns table (
  id uuid,
  username text,
  nome text,
  role text,
  created_at timestamp with time zone
) as $$
begin
  return query
  select u.id, u.username, u.nome, u.role, u.created_at
  from public.users u
  order by u.created_at desc;
end;
$$ language plpgsql security definer;

-- Função: Excluir usuário em cascata
create or replace function public.delete_system_user(p_user_id uuid)
returns boolean as $$
begin
  -- Excluir de atendimentos se a tabela existir
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'atendimentos') then
    execute 'delete from public.atendimentos where user_id = $1' using p_user_id;
  end if;

  -- Excluir de servicos se a tabela existir
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'servicos') then
    execute 'delete from public.servicos where user_id = $1' using p_user_id;
  end if;

  -- Excluir de clientes se a tabela existir
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clientes') then
    execute 'delete from public.clientes where user_id = $1' using p_user_id;
  end if;

  -- Excluir de despesas se a tabela existir
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'despesas') then
    execute 'delete from public.despesas where user_id = $1' using p_user_id;
  end if;

  -- Excluir de google_connections se a tabela existir
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'google_connections') then
    execute 'delete from public.google_connections where user_id = $1' using p_user_id;
  end if;

  -- Por fim, excluir o registro do usuário
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    execute 'delete from public.users where id = $1' using p_user_id;
  end if;

  return true;
end;
$$ language plpgsql security definer;


-- =========================================================================
-- 4. CRIAÇÃO / AJUSTE DAS OUTRAS TABELAS DO SISTEMA
-- =========================================================================

-- Tabela de Clientes
create table if not exists public.clientes (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    nome text not null,
    telefone text,
    whatsapp text,
    data_nascimento date,
    email text,
    endereco text,
    observacoes text,
    foto_antes text,
    foto_depois text,
    ativo boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Serviços
create table if not exists public.servicos (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    nome text not null,
    valor numeric(10,2) not null,
    custo numeric(10,2) default 0.00 not null,
    duracao integer not null, -- em minutos
    descricao text,
    produtos text[] default '{}'::text[],
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.servicos add column if not exists custo numeric(10,2) default 0.00 not null;

-- Tabela de Atendimentos (Agendamentos)
create table if not exists public.atendimentos (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    cliente_id uuid references public.clientes(id) on delete cascade not null,
    servico_id uuid references public.servicos(id) on delete restrict,
    data date not null,
    hora text not null, -- HH:MM
    duracao integer not null, -- em minutos
    observacoes text,
    status text default 'Agendado'::text not null, -- 'Agendado', 'Concluído', 'Cancelado'
    valor_cobrado numeric(10,2) not null,
    forma_pagamento text not null,
    data_pagamento date,
    pago boolean default false not null,
    fiado boolean default false not null,
    data_prevista_recebimento date,
    valor_recebido numeric(10,2) default 0.00 not null,
    desconto numeric(10,2) default 0.00 not null,
    acrescimos numeric(10,2) default 0.00 not null,
    custo numeric(10,2) default 0.00 not null,
    produtos_utilizados text[] default '{}'::text[],
    lucro_liquido numeric(10,2) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.atendimentos alter column servico_id drop not null;

-- Adicionar colunas de controle extras e google sync
alter table public.atendimentos add column if not exists google_event_id text;
alter table public.atendimentos add column if not exists google_calendar_id text;
alter table public.atendimentos add column if not exists google_last_sync timestamp with time zone;
alter table public.atendimentos add column if not exists google_sync_status text;
alter table public.atendimentos add column if not exists servicos_detalhes jsonb default '[]'::jsonb not null;

-- Tabela Atendimento Serviços (Múltiplos Serviços por Atendimento)
create table if not exists public.atendimento_servicos (
    id uuid default gen_random_uuid() primary key,
    atendimento_id uuid references public.atendimentos(id) on delete cascade not null,
    servico_id uuid references public.servicos(id) on delete cascade not null,
    valor_aplicado numeric(10,2) not null,
    custo_aplicado numeric(10,2) not null,
    duracao_aplicada integer not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Despesas Gerais
create table if not exists public.despesas (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    categoria text not null,
    descricao text not null,
    valor numeric(10,2) not null,
    data date not null,
    forma_pagamento text not null,
    observacoes text,
    atendimento_id uuid references public.atendimentos(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.despesas add column if not exists atendimento_id uuid references public.atendimentos(id) on delete cascade;

-- Tabela de Conexões Google Calendar
create table if not exists public.google_connections (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    access_token text not null,
    refresh_token text not null,
    expiry_date bigint not null,
    lembretes_minutos integer default 30 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_user_google_connection unique(user_id)
);

alter table public.google_connections add column if not exists sync_active boolean default true not null;
alter table public.google_connections add column if not exists last_sync_at timestamp with time zone;
alter table public.google_connections add column if not exists sync_status text;
alter table public.google_connections add column if not exists sync_error text;
alter table public.google_connections add column if not exists next_sync_token text;

-- Tabela de Configurações do SaaS (public.saas_settings)
create table if not exists public.saas_settings (
    id uuid default gen_random_uuid() primary key,
    saas_name text default 'LUMORA Flow' not null,
    logo_url text,
    plano_bronze_valor numeric(10,2) default 49.90 not null,
    plano_prata_valor numeric(10,2) default 99.90 not null,
    plano_ouro_valor numeric(10,2) default 149.90 not null,
    dias_garantia integer default 7 not null,
    garantia_ativa boolean default true not null,
    novos_cadastros_ativos boolean default true not null,
    mensagem_inicial text default 'Seja bem-vindo ao LUMORA Flow!' not null,
    limite_clientes_bron integer default 50 not null,
    limite_clientes_prata integer default 200 not null,
    limite_clientes_ouro integer default 99999 not null,
    mercado_pago_public_key text,
    mercado_pago_access_token text,
    whatsapp_api_key text,
    google_calendar_client_id text,
    google_calendar_client_secret text,
    configuracoes_gerais jsonb default '{}'::jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Renomear a coluna se por acaso foi criada com erro de digitação antes
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name='saas_settings' and column_name='limite_clientes_bron'
  ) then
    alter table public.saas_settings rename column limite_clientes_bron to limite_clientes_bronze;
  else
    alter table public.saas_settings add column if not exists limite_clientes_bronze integer default 50 not null;
  end if;
end $$;

-- Inserir configuração padrão inicial se a tabela estiver vazia
insert into public.saas_settings (id, saas_name)
select '00000000-0000-0000-0000-000000000001', 'LUMORA Flow'
where not exists (select 1 from public.saas_settings)
on conflict do nothing;

-- Tabela de Logs Administrativos do SaaS
create table if not exists public.saas_logs (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    admin_id uuid,
    admin_nome text,
    acao text not null,
    user_id uuid,
    user_nome text
);


-- =========================================================================
-- 5. ATIVAR SEGURANÇA E POLÍTICAS DE ACESSO (RLS)
-- =========================================================================

-- Clientes
alter table public.clientes enable row level security;
drop policy if exists "Controle de acesso para clientes" on public.clientes;
create policy "Controle de acesso para clientes" 
on public.clientes for all using (public.is_master_user() or public.current_app_user_id() = user_id);

-- Serviços
alter table public.servicos enable row level security;
drop policy if exists "Controle de acesso para serviços" on public.servicos;
create policy "Controle de acesso para serviços" 
on public.servicos for all using (public.is_master_user() or public.current_app_user_id() = user_id);

-- Atendimentos
alter table public.atendimentos enable row level security;
drop policy if exists "Controle de acesso para atendimentos" on public.atendimentos;
create policy "Controle de acesso para atendimentos" 
on public.atendimentos for all using (public.is_master_user() or public.current_app_user_id() = user_id);

-- Atendimento Serviços
alter table public.atendimento_servicos enable row level security;
drop policy if exists "Controle de acesso para atendimento_servicos" on public.atendimento_servicos;
create policy "Controle de acesso para atendimento_servicos"
on public.atendimento_servicos for all 
using (true)
with check (true);

-- Despesas
alter table public.despesas enable row level security;
drop policy if exists "Controle de acesso para despesas" on public.despesas;
create policy "Controle de acesso para despesas" 
on public.despesas for all using (public.is_master_user() or public.current_app_user_id() = user_id);

-- Conexões Google Calendar
alter table public.google_connections enable row level security;
drop policy if exists "Controle de acesso para conexões google" on public.google_connections;
create policy "Controle de acesso para conexões google" 
on public.google_connections for all using (public.is_master_user() or public.current_app_user_id() = user_id);

-- Configurações do SaaS
alter table public.saas_settings enable row level security;
drop policy if exists "Permitir leitura de saas_settings para todos" on public.saas_settings;
create policy "Permitir leitura de saas_settings para todos"
on public.saas_settings for select using (true);

drop policy if exists "Controle total de saas_settings para master" on public.saas_settings;
create policy "Controle total de saas_settings para master"
on public.saas_settings for all using (public.is_master_user() or exists (
    select 1 from public.users u 
    where u.id = auth.uid() and u.role = 'master'
));

-- Logs Administrativos
alter table public.saas_logs enable row level security;
drop policy if exists "Controle total de saas_logs para master" on public.saas_logs;
create policy "Controle total de saas_logs para master"
on public.saas_logs for all using (public.is_master_user() or exists (
    select 1 from public.users u 
    where u.id = auth.uid() and u.role = 'master'
));


-- =========================================================================
-- 6. CRIAÇÃO DE ÍNDICES RECOMENDADOS
-- =========================================================================
create index if not exists idx_clientes_user on public.clientes(user_id);
create index if not exists idx_servicos_user on public.servicos(user_id);
create index if not exists idx_atendimentos_user on public.atendimentos(user_id);
create index if not exists idx_atendimentos_data on public.atendimentos(data);
create index if not exists idx_despesas_user on public.despesas(user_id);
create index if not exists idx_despesas_data on public.despesas(data);
create index if not exists idx_atendimento_servicos_atendimento_id on public.atendimento_servicos(atendimento_id);
create index if not exists idx_atendimento_servicos_servico_id on public.atendimento_servicos(servico_id);


-- =========================================================================
-- 7. SEED DOS USUÁRIOS MASTER (ADMINISTRADORES GLOBAIS)
-- =========================================================================

-- 1. Usuário MASTER padrão: 'master_admin' (Mude a senha ao colocar em produção)
insert into public.users (username, password_hash, nome, role, status, plano_status, plano_atual)
values (
  'master_admin',
  crypt('SUA_SENHA_AQUI', gen_salt('bf', 8)),
  'Administrador Master',
  'master',
  'Assinatura Ativa',
  'Ativo',
  'Plano Ouro'
) on conflict (username) do update
set password_hash = crypt('SUA_SENHA_AQUI', gen_salt('bf', 8)), 
    nome = 'Administrador Master', 
    role = 'master',
    status = 'Assinatura Ativa',
    plano_status = 'Ativo',
    plano_atual = 'Plano Ouro';

-- 2. Usuário MASTER secundário: 'zotgod'
insert into public.users (username, password_hash, nome, role, status, plano_status, plano_atual)
values (
  'zotgod',
  crypt('SUA_SENHA_AQUI', gen_salt('bf', 8)),
  'Zotgod Master',
  'master',
  'Assinatura Ativa',
  'Ativo',
  'Plano Ouro'
) on conflict (username) do update
set role = 'master', 
    status = 'Assinatura Ativa', 
    plano_status = 'Ativo', 
    plano_atual = 'Plano Ouro';


-- =========================================================================
-- 8. MIGRAÇÃO AUTOMÁTICA DE DADOS EXISTENTES (ATENDIMENTOS -> MÚLTIPLOS SERVIÇOS)
-- =========================================================================
do $$
begin
    if exists (
        select 1 from information_schema.columns 
        where table_name='atendimentos' and column_name='servicos_detalhes'
    ) then
        insert into public.atendimento_servicos (atendimento_id, servico_id, valor_aplicado, custo_aplicado, duracao_aplicada, created_at)
        select 
            a.id as atendimento_id,
            (m.elem->>'servico_id')::uuid as servico_id,
            (m.elem->>'valor')::numeric as valor_aplicado,
            coalesce((m.elem->>'custo')::numeric, 0.00) as custo_aplicado,
            (m.elem->>'duracao')::integer as duracao_aplicada,
            a.created_at
        from public.atendimentos a,
        lateral jsonb_array_elements(a.servicos_detalhes) m(elem)
        where jsonb_typeof(a.servicos_detalhes) = 'array' 
          and jsonb_array_length(a.servicos_detalhes) > 0
        on conflict do nothing;
    end if;
end $$;

-- Inserir atendimentos antigos que tenham servico_id direto e ainda não foram migrados
insert into public.atendimento_servicos (atendimento_id, servico_id, valor_aplicado, custo_aplicado, duracao_aplicada, created_at)
select 
    a.id as atendimento_id,
    a.servico_id,
    a.valor_cobrado as valor_aplicado,
    coalesce(a.custo, 0.00) as custo_aplicado,
    a.duracao as duracao_aplicada,
    a.created_at
from public.atendimentos a
where not exists (
    select 1 from public.atendimento_servicos s where s.atendimento_id = a.id
) and a.servico_id is not null
on conflict do nothing;
