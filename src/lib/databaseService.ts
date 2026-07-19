/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, isSupabaseConfigured } from "./supabase.js";
import { Cliente, Servico, Atendimento, Despesa, UserSession } from "../types.js";

// ==========================================
// SQL SCRIPT FOR SUPABASE (For User Reference)
// ==========================================
export const SUPABASE_SQL_SCHEMA = `-- 1. Habilitar a extensão pgcrypto para hash de senhas e uuid-ossp
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 2. Criar a Tabela de Usuários Customizada (Login sem e-mail)
create table public.users (
    id uuid default gen_random_uuid() primary key,
    username text unique not null,
    password_hash text not null,
    nome text not null,
    role text default 'user' not null check (role in ('master', 'user')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Criar índice único case-insensitive no username
create unique index if not exists idx_users_username_lower on public.users (lower(username));

-- 3. Função para obter o ID do usuário atual do sistema (Suporta RLS customizada)
create or replace function public.current_app_user_id()
returns uuid as $$
begin
  if current_setting('app.current_user_id', true) is not null and current_setting('app.current_user_id', true) <> '' then
    return current_setting('app.current_user_id', true)::uuid;
  end if;
  return auth.uid();
end;
$$ language plpgsql stable;

-- 4. Função para verificar se o usuário atual é Master
create or replace function public.is_master_user()
returns boolean as $$
declare
  v_role text;
begin
  select role into v_role from public.users where id = public.current_app_user_id();
  return coalesce(v_role = 'master', false);
end;
$$ language plpgsql stable security definer;

-- 5. Seed do usuário administrador MASTER inicial
-- Usuário: master_admin | Senha: [DEFINA_SUA_SENHA_AQUI]
insert into public.users (username, password_hash, nome, role)
values (
  'master_admin',
  crypt('SUA_SENHA_AQUI', gen_salt('bf', 8)),
  'Administrador Master',
  'master'
) on conflict (username) do update
set password_hash = crypt('SUA_SENHA_AQUI', gen_salt('bf', 8)), nome = 'Administrador Master', role = 'master';

-- 6. RPC para autenticar usuário (Sem expor hashes no cliente)
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

-- 7. RPC para criar usuário do sistema com senha criptografada (Usado pelo master)
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

-- 8. RPC para atualizar usuário do sistema (com senha opcional)
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


-- 8.1 RPC para obter todos os usuários (Segurança: Security Definer para ignorar RLS)
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


-- 8.2 RPC para excluir usuário em cascata (Segurança: Security Definer para ignorar restrições e RLS do cliente)
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


-- 9. Tabela de Clientes
create table public.clientes (
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

-- Habilitar RLS para clientes
alter table public.clientes enable row level security;

-- Políticas de Segurança (RLS) para clientes
create policy "Controle de acesso para clientes" 
on public.clientes for all using (public.is_master_user() or public.current_app_user_id() = user_id);


-- 10. Tabela de Serviços
create table public.servicos (
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

alter table public.servicos enable row level security;

create policy "Controle de acesso para serviços" 
on public.servicos for all using (public.is_master_user() or public.current_app_user_id() = user_id);


-- 11. Tabela de Atendimentos
create table public.atendimentos (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    cliente_id uuid references public.clientes(id) on delete cascade not null,
    servico_id uuid references public.servicos(id) on delete restrict not null,
    data date not null,
    hora text not null, -- HH:MM
    duracao integer not null, -- em minutos
    observacoes text,
    status text default 'Agendado'::text not null, -- 'Agendado', 'Concluído', 'Cancelado'
    
    -- Financeiro do Atendimento
    valor_cobrado numeric(10,2) not null,
    forma_pagamento text not null,
    data_pagamento date,
    pago boolean default false not null,
    fiado boolean default false not null,
    data_prevista_recebimento date,
    valor_recebido numeric(10,2) default 0.00 not null,
    desconto numeric(10,2) default 0.00 not null,
    acrescimos numeric(10,2) default 0.00 not null,
    
    -- Custos e Lucro
    custo numeric(10,2) default 0.00 not null,
    produtos_utilizados text[] default '{}'::text[],
    lucro_liquido numeric(10,2) not null,
    
    google_event_id text,
    google_calendar_id text,
    google_last_sync timestamp with time zone,
    google_sync_status text,
    servicos_detalhes jsonb default '[]'::jsonb not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.atendimentos enable row level security;

create policy "Controle de acesso para atendimentos" 
on public.atendimentos for all using (public.is_master_user() or public.current_app_user_id() = user_id);


-- 11.1 Tabela de Atendimento Serviços (Múltiplos Serviços por Atendimento)
create table public.atendimento_servicos (
    id uuid default gen_random_uuid() primary key,
    atendimento_id uuid references public.atendimentos(id) on delete cascade not null,
    servico_id uuid references public.servicos(id) on delete cascade not null,
    valor_aplicado numeric(10,2) not null,
    custo_aplicado numeric(10,2) not null,
    duracao_aplicada integer not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.atendimento_servicos enable row level security;

create policy "Controle de acesso para atendimento_servicos"
on public.atendimento_servicos for all using (
    public.is_master_user() or 
    exists (
        select 1 from public.atendimentos a 
        where a.id = atendimento_servicos.atendimento_id 
          and (a.user_id = public.current_app_user_id() or public.is_master_user())
    )
);


-- 12. Tabela de Despesas Gerais
create table public.despesas (
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

alter table public.despesas enable row level security;

create policy "Controle de acesso para despesas" 
on public.despesas for all using (public.is_master_user() or public.current_app_user_id() = user_id);


-- 13. Tabela de Conexões Google Calendar
create table public.google_connections (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    access_token text not null,
    refresh_token text not null,
    expiry_date bigint not null,
    lembretes_minutos integer default 30 not null,
    sync_active boolean default true not null,
    last_sync_at timestamp with time zone,
    sync_status text,
    sync_error text,
    next_sync_token text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_user_google_connection unique(user_id)
);

alter table public.google_connections enable row level security;

create policy "Controle de acesso para conexões google" 
on public.google_connections for all using (public.is_master_user() or public.current_app_user_id() = user_id);


-- Índices recomendados para otimização
create index idx_clientes_user on public.clientes(user_id);
create index idx_servicos_user on public.servicos(user_id);
create index idx_atendimentos_user on public.atendimentos(user_id);
create index idx_atendimentos_data on public.atendimentos(data);
create index idx_despesas_user on public.despesas(user_id);
create index idx_despesas_data on public.despesas(data);
`;

// Mock data arrays removed to comply with Vercel production requirements.
const MOCK_SERVICES: Servico[] = [];

const MOCK_CLIENTS: Cliente[] = [];
const MOCK_EXPENSES: Despesa[] = [];
const MOCK_APPOINTMENTS: Atendimento[] = [];

function initLocalDatabase() {
  // Mock local database initialization removed to comply with Vercel production requirements.
}

const checkSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Erro: O banco de dados Supabase não está configurado. Por favor, adicione as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações do seu projeto.");
  }
};

export const databaseService = {
  // ==========================================
  // CLIENTS SERVICE
  // ==========================================
  async getClientes(userId: string, role?: string): Promise<Cliente[]> {
    checkSupabase();
    let query = supabase.from("clientes").select("*");
    if (role !== "master") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.order("nome", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async insertCliente(cliente: Omit<Cliente, "id" | "created_at">): Promise<Cliente> {
    checkSupabase();
    const { data, error } = await supabase
      .from("clientes")
      .insert([cliente])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateCliente(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    checkSupabase();
    const { data, error } = await supabase
      .from("clientes")
      .update(cliente)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteCliente(id: string): Promise<boolean> {
    checkSupabase();
    
    // Buscar o nome atual do cliente
    const { data: client, error: fetchErr } = await supabase
      .from("clientes")
      .select("nome")
      .eq("id", id)
      .single();

    if (fetchErr || !client) {
      throw fetchErr || new Error("Cliente não encontrado.");
    }

    const currentName = client.nome;
    const newName = currentName.startsWith("[EXCLUÍDO] ") ? currentName : `[EXCLUÍDO] ${currentName}`;

    // Soft-delete: atualizar o nome com o prefixo [EXCLUÍDO] e desativar o cliente (ativo = false)
    const { error: updateErr } = await supabase
      .from("clientes")
      .update({ nome: newName, ativo: false })
      .eq("id", id);

    if (updateErr) throw updateErr;
    return true;
  },

  // ==========================================
  // SERVICES SERVICE
  // ==========================================
  async getServicos(userId: string, role?: string): Promise<Servico[]> {
    checkSupabase();
    let query = supabase.from("servicos").select("*");
    if (role !== "master") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.order("nome", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async insertServico(servico: Omit<Servico, "id" | "created_at">): Promise<Servico> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("servicos")
        .insert([servico])
        .select()
        .single();

      if (error) {
        // If the column 'custo' does not exist in the database, retry without it
        if (error.code === "42703" || (error.message && error.message.includes("custo"))) {
          console.warn("Column 'custo' does not exist in 'servicos' table. Retrying insert without 'custo'.");
          const { custo, ...servicoWithoutCusto } = servico as any;
          const { data: retryData, error: retryError } = await supabase
            .from("servicos")
            .insert([servicoWithoutCusto])
            .select()
            .single();
          if (retryError) throw retryError;
          return retryData;
        }
        throw error;
      }
      return data;
    } catch (err: any) {
      if (err.code === "42703" || (err.message && err.message.includes("custo"))) {
        console.warn("Column 'custo' does not exist in 'servicos' table. Retrying insert without 'custo' via catch.");
        const { custo, ...servicoWithoutCusto } = servico as any;
        const { data: retryData, error: retryError } = await supabase
          .from("servicos")
          .insert([servicoWithoutCusto])
          .select()
          .single();
        if (retryError) throw retryError;
        return retryData;
      }
      throw err;
    }
  },

  async updateServico(id: string, servico: Partial<Servico>): Promise<Servico> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("servicos")
        .update(servico)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "42703" || (error.message && error.message.includes("custo"))) {
          console.warn("Column 'custo' does not exist in 'servicos' table. Retrying update without 'custo'.");
          const { custo, ...servicoWithoutCusto } = servico as any;
          const { data: retryData, error: retryError } = await supabase
            .from("servicos")
            .update(servicoWithoutCusto)
            .eq("id", id)
            .select()
            .single();
          if (retryError) throw retryError;
          return retryData;
        }
        throw error;
      }
      return data;
    } catch (err: any) {
      if (err.code === "42703" || (err.message && err.message.includes("custo"))) {
        console.warn("Column 'custo' does not exist in 'servicos' table. Retrying update without 'custo' via catch.");
        const { custo, ...servicoWithoutCusto } = servico as any;
        const { data: retryData, error: retryError } = await supabase
          .from("servicos")
          .update(servicoWithoutCusto)
          .eq("id", id)
          .select()
          .single();
        if (retryError) throw retryError;
        return retryData;
      }
      throw err;
    }
  },

  async deleteServico(id: string): Promise<boolean> {
    checkSupabase();
    const { error } = await supabase
      .from("servicos")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  // ==========================================
  // APPOINTMENTS SERVICE
  // ==========================================
  async getAtendimentos(userId: string, role?: string): Promise<Atendimento[]> {
    checkSupabase();
    let query = supabase.from("atendimentos").select(`
        *,
        cliente:clientes(*),
        servico:servicos(*),
        atendimento_servicos:atendimento_servicos(*, servico:servicos(*))
      `);
    if (role !== "master") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query
      .order("data", { ascending: false })
      .order("hora", { ascending: false });

    if (error) throw error;
    
    // Map data to ensure servicos_detalhes is fully synchronized from atendimento_servicos table
    const mapped = (data || []).map((at: any) => {
      if (at.atendimento_servicos && Array.isArray(at.atendimento_servicos) && at.atendimento_servicos.length > 0) {
        at.servicos_detalhes = at.atendimento_servicos.map((as: any) => ({
          servico_id: as.servico_id,
          nome: as.servico?.nome || "Serviço",
          valor: Number(as.valor_aplicado),
          duracao: Number(as.duracao_aplicada),
          custo: Number(as.custo_aplicado)
        }));
      }
      return at as Atendimento;
    });

    return mapped;
  },

  async insertAtendimento(atendimento: Omit<Atendimento, "id" | "created_at">): Promise<Atendimento> {
    checkSupabase();
    // Sync with Google Agenda if connected
    let googleEventId = (atendimento as any).google_event_id || undefined;
    try {
      const isGoogleEnabledResponse = await fetch(`/api/auth/google/status?userId=${atendimento.user_id}`);
      const isGoogleEnabled = await isGoogleEnabledResponse.json();
      
      if (isGoogleEnabled.connected && atendimento.status === "Agendado" && !googleEventId) {
        // Fetch clients and services to build clean description
        const clients = await this.getClientes(atendimento.user_id);
        const services = await this.getServicos(atendimento.user_id);
        const client = clients.find(c => c.id === atendimento.cliente_id);
        const service = services.find(s => s.id === atendimento.servico_id);

        let servicesText = "";
        if (atendimento.servicos_detalhes && Array.isArray(atendimento.servicos_detalhes) && atendimento.servicos_detalhes.length > 0) {
          servicesText = atendimento.servicos_detalhes.map(s => `• ${s.nome}`).join("\n");
        } else {
          servicesText = `• ${service?.nome || "Atendimento"}`;
        }

        const startDateTime = `${atendimento.data}T${atendimento.hora}:00`;
        // Calculate end dateTime
        const startTime = new Date(startDateTime);
        const endTime = new Date(startTime.getTime() + (atendimento.duracao || 30) * 60 * 1000);
        const endDateTime = endTime.toISOString();

        const syncResponse = await fetch("/api/calendar/event/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: atendimento.user_id,
            summary: `Estética: ${client?.nome || "Cliente"}`,
            description: `Atendimento de Estética e Sobrancelhas\n\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\n\nServiços:\n${servicesText}\n\nObservações: ${atendimento.observacoes || ""}`,
            startDateTime,
            endDateTime,
          }),
        });
        const syncData = await syncResponse.json();
        if (syncData.success && syncData.eventId) {
          googleEventId = syncData.eventId;
        }
      }
    } catch (e) {
      console.error("Failed to automatically create Google Calendar event:", e);
    }

    const { cliente, servico, servicos_detalhes, atendimento_servicos, ...pureAtendimento } = atendimento as any;
    const docToInsert = {
      ...pureAtendimento,
      google_event_id: googleEventId,
      google_calendar_id: googleEventId ? "primary" : (pureAtendimento.google_calendar_id || null),
      google_last_sync: googleEventId ? new Date().toISOString() : (pureAtendimento.google_last_sync || null),
      google_sync_status: googleEventId ? "synced" : (pureAtendimento.google_sync_status || null)
    };

    const { data, error } = await supabase
      .from("atendimentos")
      .insert([docToInsert])
      .select()
      .single();

    if (error) throw error;

    // Insert associated services into the atendimento_servicos table if they exist
    if (atendimento.servicos_detalhes && Array.isArray(atendimento.servicos_detalhes) && atendimento.servicos_detalhes.length > 0) {
      const servicesToInsert = atendimento.servicos_detalhes.map(s => ({
        atendimento_id: data.id,
        servico_id: s.servico_id,
        valor_aplicado: s.valor,
        custo_aplicado: s.custo,
        duracao_aplicada: s.duracao
      }));
      const { error: servicesError } = await supabase
        .from("atendimento_servicos")
        .insert(servicesToInsert);
      if (servicesError) {
        console.error("Error inserting into atendimento_servicos:", servicesError);
      }
    }

    try {
      await this.syncAutomaticExpense(data.id, data.user_id, data.cliente_id, data.custo, data.data, data.status, data.forma_pagamento);
    } catch (e) {
      console.error("Error syncing automatic expense for inserted appointment:", e);
    }
    return data;
  },

  async updateAtendimento(id: string, atendimento: Partial<Atendimento>, professionalId: string): Promise<Atendimento> {
    checkSupabase();
    // 1. Fetch current appointment to get google_event_id
    let currentApp: Atendimento | null = null;
    const { data: fetchApp, error: fetchError } = await supabase.from("atendimentos").select("*").eq("id", id).single();
    if (fetchError) throw fetchError;
    currentApp = fetchApp;

    let googleEventId = currentApp?.google_event_id;

    // Sync updates to Google Agenda
    if (currentApp && googleEventId) {
      try {
        const nextStatus = atendimento.status ?? currentApp.status;
        const nextData = atendimento.data ?? currentApp.data;
        const nextHora = atendimento.hora ?? currentApp.hora;
        const nextDuracao = atendimento.duracao ?? currentApp.duracao;
        
        const clients = await this.getClientes(professionalId);
        const services = await this.getServicos(professionalId);
        const client = clients.find(c => c.id === (atendimento.cliente_id ?? currentApp?.cliente_id));
        const service = services.find(s => s.id === (atendimento.servico_id ?? currentApp?.servico_id));

        if (nextStatus === "Cancelado") {
          // Exclude cancelled events
          await fetch("/api/calendar/event/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: professionalId, eventId: googleEventId })
          });
          googleEventId = ""; // Clear ID
        } else {
          // Update event
          const startDateTime = `${nextData}T${nextHora}:00`;
          const startTime = new Date(startDateTime);
          const endTime = new Date(startTime.getTime() + (nextDuracao || 30) * 60 * 1000);
          const endDateTime = endTime.toISOString();

          const nextServicosDetalhes = atendimento.servicos_detalhes ?? currentApp?.servicos_detalhes;
          let servicesText = "";
          if (nextServicosDetalhes && Array.isArray(nextServicosDetalhes) && nextServicosDetalhes.length > 0) {
            servicesText = nextServicosDetalhes.map(s => `• ${s.nome}`).join("\n");
          } else {
            servicesText = `• ${service?.nome || "Atendimento"}`;
          }

          await fetch("/api/calendar/event/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: professionalId,
              eventId: googleEventId,
              summary: `Estética: ${client?.nome || "Cliente"}`,
              description: `Atendimento de Estética e Sobrancelhas\n\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\n\nServiços:\n${servicesText}\n\nObservações: ${(atendimento.observacoes ?? currentApp.observacoes) || ""}\nStatus: ${nextStatus}`,
              startDateTime,
              endDateTime
            })
          });
        }
      } catch (err) {
        console.error("Failed to sync Google Agenda event on update:", err);
      }
    } else if (currentApp && !googleEventId && (atendimento.status === "Agendado" || (currentApp.status === "Agendado" && !atendimento.status))) {
      // If it wasn't connected, but is connected now, let's try creating an event
      try {
        const isGoogleEnabledResponse = await fetch(`/api/auth/google/status?userId=${professionalId}`);
        const isGoogleEnabled = await isGoogleEnabledResponse.json();

        if (isGoogleEnabled.connected) {
          const nextData = atendimento.data ?? currentApp.data;
          const nextHora = atendimento.hora ?? currentApp.hora;
          const nextDuracao = atendimento.duracao ?? currentApp.duracao;
          const nextClientId = atendimento.cliente_id ?? currentApp.cliente_id;
          const nextServicoId = atendimento.servico_id ?? currentApp.servico_id;
          const nextValor = atendimento.valor_cobrado ?? currentApp.valor_cobrado;

          const clients = await this.getClientes(professionalId);
          const services = await this.getServicos(professionalId);
          const client = clients.find(c => c.id === nextClientId);
          const service = services.find(s => s.id === nextServicoId);

          const startDateTime = `${nextData}T${nextHora}:00`;
          const startTime = new Date(startDateTime);
          const endTime = new Date(startTime.getTime() + nextDuracao * 60 * 1000);
          const endDateTime = endTime.toISOString();

          const nextServicosDetalhes = atendimento.servicos_detalhes ?? currentApp?.servicos_detalhes;
          let servicesText = "";
          if (nextServicosDetalhes && Array.isArray(nextServicosDetalhes) && nextServicosDetalhes.length > 0) {
            servicesText = nextServicosDetalhes.map(s => `• ${s.nome}`).join("\n");
          } else {
            servicesText = `• ${service?.nome || "Atendimento"}`;
          }

          const syncResponse = await fetch("/api/calendar/event/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: professionalId,
              summary: `Estética: ${client?.nome || "Cliente"}`,
              description: `Atendimento de Estética e Sobrancelhas\n\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\n\nServiços:\n${servicesText}`,
              startDateTime,
              endDateTime
            })
          });
          const syncData = await syncResponse.json();
          if (syncData.success && syncData.eventId) {
            googleEventId = syncData.eventId;
          }
        }
      } catch (e) {
        console.error("Failed to sync new calendar event on update:", e);
      }
    }

    const { cliente, servico, servicos_detalhes, atendimento_servicos, ...pureAtendimento } = atendimento as any;
    const docToUpdate = {
      ...pureAtendimento,
      google_event_id: googleEventId,
      google_calendar_id: googleEventId ? "primary" : (atendimento.google_calendar_id || null),
      google_last_sync: googleEventId ? new Date().toISOString() : null,
      google_sync_status: googleEventId ? "synced" : null
    };

    const { data, error } = await supabase
      .from("atendimentos")
      .update(docToUpdate)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Clear and update associated services in atendimento_servicos table if they were updated
    if (atendimento.servicos_detalhes && Array.isArray(atendimento.servicos_detalhes)) {
      // Clear existing first
      const { error: deleteError } = await supabase
        .from("atendimento_servicos")
        .delete()
        .eq("atendimento_id", id);
      
      if (deleteError) {
        console.error("Error deleting from atendimento_servicos on update:", deleteError);
      }

      if (atendimento.servicos_detalhes.length > 0) {
        const servicesToInsert = atendimento.servicos_detalhes.map(s => ({
          atendimento_id: id,
          servico_id: s.servico_id,
          valor_aplicado: s.valor,
          custo_aplicado: s.custo,
          duracao_aplicada: s.duracao
        }));
        const { error: servicesError } = await supabase
          .from("atendimento_servicos")
          .insert(servicesToInsert);
        if (servicesError) {
          console.error("Error inserting into atendimento_servicos on update:", servicesError);
        }
      }
    }

    try {
      await this.syncAutomaticExpense(data.id, data.user_id, data.cliente_id, data.custo, data.data, data.status, data.forma_pagamento);
    } catch (e) {
      console.error("Error syncing automatic expense for updated appointment:", e);
    }
    return data;
  },

  async syncAutomaticExpense(appointmentId: string, userId: string, clientId: string, custo: number, date: string, status: string, formaPagamento: string = "Pix"): Promise<void> {
    checkSupabase();
    try {
      if (status !== "Concluído" || custo <= 0) {
        // If the appointment is not completed or has no cost, check if there's an existing automatic expense to delete
        const { data: existing, error: selectErr } = await supabase.from("despesas").select("id").eq("atendimento_id", appointmentId);
        if (selectErr) {
          if (selectErr.code === "42703" || (selectErr.message && selectErr.message.includes("atendimento_id"))) {
            console.warn("Column 'atendimento_id' does not exist in 'despesas' table. Skipping automatic expense deletion.");
            return;
          }
          throw selectErr;
        }
        if (existing && existing.length > 0) {
          for (const exp of existing) {
            await supabase.from("despesas").delete().eq("id", exp.id);
          }
        }
        return;
      }

      // 1. Fetch client name
      let clientNome = "Cliente";
      try {
        const { data: client } = await supabase.from("clientes").select("nome").eq("id", clientId).single();
        if (client) {
          clientNome = client.nome;
        }
      } catch (e) {
        console.error("Error fetching client name for automatic expense:", e);
      }

      // 2. Check if expense already exists for this appointment
      const { data: existing, error: selectErr } = await supabase.from("despesas").select("id").eq("atendimento_id", appointmentId);
      if (selectErr) {
        if (selectErr.code === "42703" || (selectErr.message && selectErr.message.includes("atendimento_id"))) {
          console.warn("Column 'atendimento_id' does not exist in 'despesas' table. Retrying sync as standard expense (without link).");
          // Just insert a new expense without link if we don't have one today
          const despesaPayload = {
            user_id: userId,
            categoria: "Insumos de atendimento",
            descricao: `Insumos utilizados no atendimento de ${clientNome}`,
            valor: custo,
            data: date,
            forma_pagamento: formaPagamento || "Pix",
            observacoes: "Gerado automaticamente ao finalizar atendimento (sem link)."
          };
          await supabase.from("despesas").insert([despesaPayload]);
          return;
        }
        throw selectErr;
      }
      
      const despesaPayload = {
        user_id: userId,
        categoria: "Insumos de atendimento",
        descricao: `Insumos utilizados no atendimento de ${clientNome}`,
        valor: custo,
        data: date,
        forma_pagamento: formaPagamento || "Pix",
        observacoes: "Gerado automaticamente ao finalizar atendimento.",
        atendimento_id: appointmentId
      };

      if (existing && existing.length > 0) {
        // Update existing expense
        await supabase.from("despesas").update(despesaPayload).eq("atendimento_id", appointmentId);
      } else {
        // Insert new expense
        await supabase.from("despesas").insert([despesaPayload]);
      }
    } catch (err: any) {
      if (err.code === "42703" || (err.message && err.message.includes("atendimento_id"))) {
        console.warn("Caught 'atendimento_id' column error in catch block. Inserting without 'atendimento_id'.");
        try {
          let clientNome = "Cliente";
          const { data: client } = await supabase.from("clientes").select("nome").eq("id", clientId).single();
          if (client) clientNome = client.nome;
          
          const despesaPayload = {
            user_id: userId,
            categoria: "Insumos de atendimento",
            descricao: `Insumos utilizados no atendimento de ${clientNome}`,
            valor: custo,
            data: date,
            forma_pagamento: formaPagamento || "Pix",
            observacoes: "Gerado automaticamente ao finalizar atendimento (sem link)."
          };
          await supabase.from("despesas").insert([despesaPayload]);
        } catch (innerErr) {
          console.error("Failed to insert unlinked automatic expense:", innerErr);
        }
      } else {
        console.error("Error in syncAutomaticExpense:", err);
      }
    }
  },

  async deleteAtendimento(id: string, professionalId: string): Promise<boolean> {
    checkSupabase();
    // 1. Fetch to get Google event id
    const { data, error: fetchError } = await supabase.from("atendimentos").select("*").eq("id", id).single();
    if (fetchError) throw fetchError;
    const currentApp = data;

    if (currentApp?.google_event_id) {
      try {
        await fetch("/api/calendar/event/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: professionalId, eventId: currentApp.google_event_id })
        });
      } catch (err) {
        console.error("Failed to delete from Google Agenda:", err);
      }
    }

    const { error } = await supabase
      .from("atendimentos")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  // ==========================================
  // EXPENSES SERVICE
  // ==========================================
  async getDespesas(userId: string, role?: string): Promise<Despesa[]> {
    checkSupabase();
    let query = supabase.from("despesas").select("*");
    if (role !== "master") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.order("data", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async insertDespesa(despesa: Omit<Despesa, "id" | "created_at">): Promise<Despesa> {
    checkSupabase();
    const { data, error } = await supabase
      .from("despesas")
      .insert([despesa])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateDespesa(id: string, despesa: Partial<Despesa>): Promise<Despesa> {
    checkSupabase();
    const { data, error } = await supabase
      .from("despesas")
      .update(despesa)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDespesa(id: string): Promise<boolean> {
    checkSupabase();
    const { error } = await supabase
      .from("despesas")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  // ==========================================
  // USERS MANAGEMENT SERVICE (Master Only)
  // ==========================================
  async getSystemUsers(): Promise<any[]> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Direct select on users failed, trying RPC...", error);
        const { data: rpcData, error: rpcErr } = await supabase.rpc("get_system_users");
        if (!rpcErr && rpcData) return rpcData;
        throw error;
      }
      return data || [];
    } catch (err) {
      console.error("Erro ao carregar usuários", err);
      return [];
    }
  },

  async getUserProfile(userId: string): Promise<any | null> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Erro ao obter perfil do usuário", err);
      return null;
    }
  },

  async updateUserProfile(userId: string, payload: any): Promise<any | null> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", userId)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Erro ao atualizar perfil do usuário", err);
      throw err;
    }
  },

  async insertSystemUser(payload: { 
    id?: string; 
    username: string; 
    password_hash: string; 
    nome: string; 
    role: string; 
    email?: string; 
    celular?: string; 
    empresa?: string; 
    status?: string;
    created_by?: string;
    must_change_password?: boolean;
    observacoes_admin?: string;
    plano_atual?: string;
    plano_status?: string;
    plano_valor?: number;
    plano_data_contratacao?: string;
    plano_data_renovacao?: string;
    plano_data_vencimento?: string;
    plano_gateway?: string;
    plano_ultimo_pagamento?: string;
    plano_proximo_pagamento?: string;
    situacao_pagamento?: string;
  }): Promise<any> {
    checkSupabase();
    try {
      // Direct insert into the table to support newly added columns
      const insertObj: any = {
        username: payload.username.toLowerCase(),
        password_hash: payload.password_hash ? payload.password_hash : "auth_managed",
        nome: payload.nome,
        role: payload.role,
        email: payload.email || null,
        celular: payload.celular || null,
        empresa: payload.empresa || null,
        status: payload.status || "Aguardando Assinatura",
        plano_atual: payload.plano_atual || "Plano Bronze",
        plano_status: payload.plano_status || "Inativo"
      };
      
      if (payload.id) insertObj.id = payload.id;
      if (payload.created_by) insertObj.created_by = payload.created_by;
      if (payload.must_change_password !== undefined) insertObj.must_change_password = payload.must_change_password;
      if (payload.observacoes_admin) insertObj.observacoes_admin = payload.observacoes_admin;
      if (payload.plano_valor !== undefined) insertObj.plano_valor = payload.plano_valor;
      if (payload.plano_data_contratacao) insertObj.plano_data_contratacao = payload.plano_data_contratacao;
      if (payload.plano_data_renovacao) insertObj.plano_data_renovacao = payload.plano_data_renovacao;
      if (payload.plano_data_vencimento) insertObj.plano_data_vencimento = payload.plano_data_vencimento;
      if (payload.plano_gateway) insertObj.plano_gateway = payload.plano_gateway;
      if (payload.plano_ultimo_pagamento) insertObj.plano_ultimo_pagamento = payload.plano_ultimo_pagamento;
      if (payload.plano_proximo_pagamento) insertObj.plano_proximo_pagamento = payload.plano_proximo_pagamento;
      if (payload.situacao_pagamento) insertObj.situacao_pagamento = payload.situacao_pagamento;

      const { data, error } = await supabase
        .from("users")
        .insert([insertObj])
        .select()
        .single();

      if (!error) return data;
      console.warn("Direct insert user failed, falling back to RPC...", error);
    } catch (err) {
      console.warn("Direct insert user failed, falling back to RPC...", err);
    }

    const { data, error: rpcError } = await supabase.rpc("create_system_user", {
      p_username: payload.username,
      p_password: payload.password_hash,
      p_nome: payload.nome,
      p_role: payload.role
    });

    if (rpcError) throw rpcError;
    return data && data[0];
  },

  async updateSystemUser(id: string, payload: { username: string; password_hash?: string; nome: string; role: string; email?: string; celular?: string; empresa?: string; status?: string; plano_atual?: string; plano_status?: string; plano_valor?: number; plano_data_vencimento?: string }): Promise<any> {
    checkSupabase();
    try {
      // Direct update to support new columns
      const updateData: any = {
        username: payload.username.toLowerCase(),
        nome: payload.nome,
        role: payload.role,
      };
      if (payload.email !== undefined) updateData.email = payload.email;
      if (payload.celular !== undefined) updateData.celular = payload.celular;
      if (payload.empresa !== undefined) updateData.empresa = payload.empresa;
      if (payload.status !== undefined) updateData.status = payload.status;
      if (payload.plano_atual !== undefined) updateData.plano_atual = payload.plano_atual;
      if (payload.plano_status !== undefined) updateData.plano_status = payload.plano_status;
      if (payload.plano_valor !== undefined) updateData.plano_valor = payload.plano_valor;
      if (payload.plano_data_vencimento !== undefined) updateData.plano_data_vencimento = payload.plano_data_vencimento;

      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (!error) return data;
      console.warn("Direct update user failed, falling back to RPC...", error);
    } catch (err) {
      console.warn("Direct update user failed, falling back to RPC...", err);
    }

    const { data, error: rpcError } = await supabase.rpc("update_system_user", {
      p_id: id,
      p_username: payload.username,
      p_password: payload.password_hash || "",
      p_nome: payload.nome,
      p_role: payload.role
    });

    if (rpcError) throw rpcError;
    return data && data[0];
  },

  async deleteSystemUser(id: string): Promise<boolean> {
    checkSupabase();
    
    try {
      // Tenta excluir chamando a função RPC (roda com segurança 'security definer' contornando cache do schema cache e RLS)
      const { data, error: rpcError } = await supabase.rpc("delete_system_user", {
        p_user_id: id
      });
      if (!rpcError) {
        return true;
      }
      console.warn("RPC delete_system_user falhou ou não existe, tentando fallback...", rpcError);
    } catch (err) {
      console.warn("Falha de execução ao chamar RPC delete_system_user, tentando fallback...", err);
    }

    // FALLBACK SEGURO: Excluir o usuário diretamente da tabela "users".
    const { error: errUser } = await supabase
      .from("users")
      .delete()
      .eq("id", id);
    if (errUser) throw errUser;

    return true;
  },

  // ==========================================
  // SAAS CONFIGURATION & SETTINGS
  // ==========================================
  async getSaaSSettings(): Promise<any> {
    checkSupabase();
    const defaultSettings = {
      id: "00000000-0000-0000-0000-000000000001",
      saas_name: "LUMORA Flow",
      logo_url: "",
      plano_bronze_valor: 49.90,
      plano_prata_valor: 99.90,
      plano_ouro_valor: 149.90,
      dias_garantia: 7,
      garantia_ativa: true,
      novos_cadastros_ativos: true,
      mensagem_inicial: "Seja bem-vindo ao LUMORA Flow!",
      limite_clientes_bronze: 50,
      limite_clientes_prata: 200,
      limite_clientes_ouro: 99999,
      mercado_pago_public_key: "",
      mercado_pago_access_token: "",
      whatsapp_api_key: "",
      google_calendar_client_id: "",
      google_calendar_client_secret: "",
      configuracoes_gerais: {}
    };

    try {
      const { data, error } = await supabase
        .from("saas_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("saas_settings table query failed. Maybe migration was not run yet.", error);
        return defaultSettings;
      }
      return data || defaultSettings;
    } catch (err) {
      console.warn("Error getting saas_settings, using fallback", err);
      return defaultSettings;
    }
  },

  async updateSaaSSettings(id: string, settings: any): Promise<any> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("saas_settings")
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Error updating saas_settings", err);
      throw err;
    }
  },

  // ==========================================
  // SAAS LOGS / HISTORY
  // ==========================================
  async getSaaSLogs(): Promise<any[]> {
    checkSupabase();
    try {
      const { data, error } = await supabase
        .from("saas_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("saas_logs table query failed. Maybe migration was not run yet.", error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn("Error getting saas_logs", err);
      return [];
    }
  },

  async logSaaSAction(payload: { admin_id?: string; admin_nome?: string; acao: string; user_id?: string; user_nome?: string }): Promise<boolean> {
    checkSupabase();
    try {
      const { error } = await supabase
        .from("saas_logs")
        .insert([{
          admin_id: payload.admin_id || null,
          admin_nome: payload.admin_nome || "Sistema",
          acao: payload.acao,
          user_id: payload.user_id || null,
          user_nome: payload.user_nome || null
        }]);

      if (error) {
        console.warn("Failed to insert log. saas_logs table might not exist.", error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("Error logging SaaS action", err);
      return false;
    }
  }
};;
