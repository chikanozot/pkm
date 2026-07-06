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
-- Usuário: zotgod | Senha: Caio1993
insert into public.users (username, password_hash, nome, role)
values (
  'zotgod',
  crypt('Caio1993', gen_salt('bf', 8)),
  'Administrador Master',
  'master'
) on conflict (username) do update
set password_hash = crypt('Caio1993', gen_salt('bf', 8)), nome = 'Administrador Master', role = 'master';

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
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.atendimentos enable row level security;

create policy "Controle de acesso para atendimentos" 
on public.atendimentos for all using (public.is_master_user() or public.current_app_user_id() = user_id);


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
    const { error } = await supabase
      .from("clientes")
      .delete()
      .eq("id", id);

    if (error) throw error;
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
    const { data, error } = await supabase
      .from("servicos")
      .insert([servico])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateServico(id: string, servico: Partial<Servico>): Promise<Servico> {
    checkSupabase();
    const { data, error } = await supabase
      .from("servicos")
      .update(servico)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
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
        servico:servicos(*)
      `);
    if (role !== "master") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query
      .order("data", { ascending: false })
      .order("hora", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async insertAtendimento(atendimento: Omit<Atendimento, "id" | "created_at">): Promise<Atendimento> {
    checkSupabase();
    // Sync with Google Agenda if connected
    let googleEventId = undefined;
    try {
      const isGoogleEnabledResponse = await fetch(`/api/auth/google/status?userId=${atendimento.user_id}`);
      const isGoogleEnabled = await isGoogleEnabledResponse.json();
      
      if (isGoogleEnabled.connected && atendimento.status === "Agendado") {
        // Fetch clients and services to build clean description
        const clients = await this.getClientes(atendimento.user_id);
        const services = await this.getServicos(atendimento.user_id);
        const client = clients.find(c => c.id === atendimento.cliente_id);
        const service = services.find(s => s.id === atendimento.servico_id);

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
            summary: `Estética: ${client?.nome || "Cliente"} - ${service?.nome || "Atendimento"}`,
            description: `Atendimento de Estética e Sobrancelhas\nServiço: ${service?.nome || "Personalizado"}\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\nValor: R$ ${atendimento.valor_cobrado.toFixed(2)}\nObservações: ${atendimento.observacoes || ""}`,
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

    const docToInsert = {
      ...atendimento,
      google_event_id: googleEventId
    };

    const { data, error } = await supabase
      .from("atendimentos")
      .insert([docToInsert])
      .select()
      .single();

    if (error) throw error;
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

          await fetch("/api/calendar/event/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: professionalId,
              eventId: googleEventId,
              summary: `Estética: ${client?.nome || "Cliente"} - ${service?.nome || "Atendimento"}`,
              description: `Atendimento de Estética e Sobrancelhas\nServiço: ${service?.nome || ""}\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\nObservações: ${(atendimento.observacoes ?? currentApp.observacoes) || ""}\nStatus: ${nextStatus}`,
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

          const syncResponse = await fetch("/api/calendar/event/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: professionalId,
              summary: `Estética: ${client?.nome || "Cliente"} - ${service?.nome || "Atendimento"}`,
              description: `Atendimento de Estética e Sobrancelhas\nServiço: ${service?.nome || ""}\nCliente: ${client?.nome || ""}\nWhatsApp: ${client?.whatsapp || ""}\nValor: R$ ${nextValor.toFixed(2)}`,
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

    const docToUpdate = {
      ...atendimento,
      google_event_id: googleEventId
    };

    const { data, error } = await supabase
      .from("atendimentos")
      .update(docToUpdate)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
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
    const { data, error } = await supabase
      .from("users")
      .select("id, username, nome, role, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async insertSystemUser(payload: { username: string; password_hash: string; nome: string; role: string }): Promise<any> {
    checkSupabase();
    const { data, error } = await supabase.rpc("create_system_user", {
      p_username: payload.username,
      p_password: payload.password_hash,
      p_nome: payload.nome,
      p_role: payload.role
    });

    if (error) throw error;
    return data && data[0];
  },

  async updateSystemUser(id: string, payload: { username: string; password_hash?: string; nome: string; role: string }): Promise<any> {
    checkSupabase();
    const { data, error } = await supabase.rpc("update_system_user", {
      p_id: id,
      p_username: payload.username,
      p_password: payload.password_hash || "",
      p_nome: payload.nome,
      p_role: payload.role
    });

    if (error) throw error;
    return data && data[0];
  },

  async deleteSystemUser(id: string): Promise<boolean> {
    checkSupabase();
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};;
