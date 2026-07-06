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

// ==========================================
// HIGH-FIDELITY LOCAL DATABASE ENGINE (FALLBACK)
// ==========================================

const MOCK_SERVICES: Servico[] = [
  {
    id: "s1",
    user_id: "demo-user",
    nome: "Design de Sobrancelha Simples",
    valor: 45.00,
    duracao: 30,
    descricao: "Mapeamento facial e retirada de excessos com pinça.",
    produtos: ["Linha de algodão", "Pinça", "Adstringente"],
    created_at: new Date().toISOString()
  },
  {
    id: "s2",
    user_id: "demo-user",
    nome: "Design com Henna",
    valor: 65.00,
    duracao: 45,
    descricao: "Design personalizado com aplicação de henna para preenchimento de falhas.",
    produtos: ["Henna profissional", "Dappen", "Pincel de precisão"],
    created_at: new Date().toISOString()
  },
  {
    id: "s3",
    user_id: "demo-user",
    nome: "Micropigmentação Shadow",
    valor: 380.00,
    duracao: 120,
    descricao: "Efeito sombreado pixel de alta durabilidade e acabamento natural.",
    produtos: ["Agulha de micropigmentação", "Pigmento orgânico", "Anestésico em gel"],
    created_at: new Date().toISOString()
  },
  {
    id: "s4",
    user_id: "demo-user",
    nome: "Lash Lifting",
    valor: 120.00,
    duracao: 60,
    descricao: "Curvatura e hidratação profunda dos cílios naturais.",
    produtos: ["Molde de silicone", "Gel de permanente", "Passo 2 fixador", "Nutrição de queratina"],
    created_at: new Date().toISOString()
  },
  {
    id: "s5",
    user_id: "demo-user",
    nome: "Brown Lamination",
    valor: 110.00,
    duracao: 50,
    descricao: "Alinhamento e nutrição dos fios da sobrancelha, proporcionando volume e preenchimento.",
    produtos: ["Kit Brow Lamination", "Escovinha descartável", "Película aderente"],
    created_at: new Date().toISOString()
  }
];

const MOCK_CLIENTS: Cliente[] = [
  {
    id: "c1",
    user_id: "demo-user",
    nome: "Ana Souza",
    telefone: "(11) 98765-4321",
    whatsapp: "(11) 98765-4321",
    data_nascimento: "1994-05-15",
    email: "ana.souza@gmail.com",
    endereco: "Av. Paulista, 1000 - Bela Vista, São Paulo - SP",
    observacoes: "Pele sensível. Prefere henna em tom castanho claro e bem suave.",
    foto_antes: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200",
    foto_depois: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    ativo: true,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "c2",
    user_id: "demo-user",
    nome: "Beatriz Costa",
    telefone: "(11) 99123-4567",
    whatsapp: "(11) 99123-4567",
    data_nascimento: "1988-11-22",
    email: "beatriz.c@outlook.com",
    endereco: "Rua Augusta, 450 - Consolação, São Paulo - SP",
    observacoes: "Tem falha na cauda da sobrancelha esquerda devido a cicatriz.",
    foto_antes: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=200",
    foto_depois: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    ativo: true,
    created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "c3",
    user_id: "demo-user",
    nome: "Camila Ribeiro",
    telefone: "(11) 97766-5544",
    whatsapp: "(11) 97766-5544",
    data_nascimento: "1999-02-08",
    email: "camila.ribeiro@yahoo.com",
    endereco: "Rua Pamplona, 1200 - Jardim Paulista, São Paulo - SP",
    observacoes: "Alérgica a alguns tipos de maquiagem. Testar henna antes.",
    foto_antes: "",
    foto_depois: "",
    ativo: true,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "c4",
    user_id: "demo-user",
    nome: "Juliana Mendes",
    telefone: "(11) 96543-2109",
    whatsapp: "(11) 96543-2109",
    data_nascimento: "1991-09-30",
    email: "ju.mendes@gmail.com",
    endereco: "Rua Oscar Freire, 800 - Cerqueira César, São Paulo - SP",
    observacoes: "Cliente super pontual. Gosta da sobrancelha bem arqueada.",
    foto_antes: "",
    foto_depois: "",
    ativo: true,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "c5",
    user_id: "demo-user",
    nome: "Gabriela Santos (Inadimplente)",
    telefone: "(11) 95544-3322",
    whatsapp: "(11) 95544-3322",
    data_nascimento: "1995-07-12",
    email: "gabriela.santos@gmail.com",
    endereco: "Rua da Consolação, 2000 - Centro, São Paulo - SP",
    observacoes: "Tem um atendimento marcado como Fiado pendente de pagamento.",
    foto_antes: "",
    foto_depois: "",
    ativo: false,
    created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const MOCK_EXPENSES: Despesa[] = [
  {
    id: "e1",
    user_id: "demo-user",
    categoria: "Aluguel",
    descricao: "Aluguel da sala comercial",
    valor: 1200.00,
    data: new Date().toISOString().substring(0, 7) + "-05", // 5th of current month
    forma_pagamento: "Pix",
    observacoes: "Pago em dia.",
    created_at: new Date().toISOString()
  },
  {
    id: "e2",
    user_id: "demo-user",
    categoria: "Luz",
    descricao: "Energia elétrica da clínica",
    valor: 185.50,
    data: new Date().toISOString().substring(0, 7) + "-10",
    forma_pagamento: "Boleto",
    observacoes: "",
    created_at: new Date().toISOString()
  },
  {
    id: "e3",
    user_id: "demo-user",
    categoria: "Internet",
    descricao: "Banda larga fibra ótica",
    valor: 99.90,
    data: new Date().toISOString().substring(0, 7) + "-12",
    forma_pagamento: "Boleto",
    observacoes: "",
    created_at: new Date().toISOString()
  },
  {
    id: "e4",
    user_id: "demo-user",
    categoria: "Produtos",
    descricao: "Lote de henna e agulhas de micropigmentação",
    valor: 250.00,
    data: new Date().toISOString().substring(0, 7) + "-02",
    forma_pagamento: "Cartão de Crédito",
    observacoes: "Fornecedor BrowExpress.",
    created_at: new Date().toISOString()
  },
  {
    id: "e5",
    user_id: "demo-user",
    categoria: "Marketing",
    descricao: "Impulsionamento Instagram Ads",
    valor: 150.00,
    data: new Date().toISOString().substring(0, 7) + "-08",
    forma_pagamento: "Cartão de Crédito",
    observacoes: "Campanha especial dia dos namorados.",
    created_at: new Date().toISOString()
  }
];

const MOCK_APPOINTMENTS: Atendimento[] = [
  {
    id: "a1",
    user_id: "demo-user",
    cliente_id: "c1",
    servico_id: "s2", // Design com Henna (65.00)
    data: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // 3 days ago
    hora: "10:00",
    duracao: 45,
    observacoes: "Ficou ótimo, cliente adorou o tom.",
    status: "Concluído",
    valor_cobrado: 65.00,
    forma_pagamento: "Pix",
    data_pagamento: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    pago: true,
    fiado: false,
    valor_recebido: 65.00,
    desconto: 0,
    acrescimos: 0,
    custo: 12.00,
    produtos_utilizados: ["Henna profissional", "Dappen"],
    lucro_liquido: 53.00,
    created_at: new Date().toISOString()
  },
  {
    id: "a2",
    user_id: "demo-user",
    cliente_id: "c2",
    servico_id: "s3", // Micropigmentação Shadow (380.00)
    data: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // Yesterday
    hora: "14:00",
    duracao: 120,
    observacoes: "Primeira sessão realizada com sucesso. Retorno marcado para 30 dias.",
    status: "Concluído",
    valor_cobrado: 380.00,
    forma_pagamento: "Cartão de Crédito",
    data_pagamento: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    pago: true,
    fiado: false,
    valor_recebido: 380.00,
    desconto: 0,
    acrescimos: 0,
    custo: 45.00,
    produtos_utilizados: ["Agulha de micropigmentação", "Pigmento orgânico", "Anestésico em gel"],
    lucro_liquido: 335.00,
    created_at: new Date().toISOString()
  },
  {
    id: "a3",
    user_id: "demo-user",
    cliente_id: "c3",
    servico_id: "s1", // Design Simples (45.00)
    data: new Date().toISOString().substring(0, 10), // Today
    hora: "09:00",
    duracao: 30,
    observacoes: "Marcar retorno para 15 dias.",
    status: "Agendado",
    valor_cobrado: 45.00,
    forma_pagamento: "Pix",
    pago: false,
    fiado: false,
    valor_recebido: 0,
    desconto: 0,
    acrescimos: 0,
    custo: 5.00,
    produtos_utilizados: ["Pinça", "Adstringente"],
    lucro_liquido: 40.00,
    created_at: new Date().toISOString()
  },
  {
    id: "a4",
    user_id: "demo-user",
    cliente_id: "c4",
    servico_id: "s4", // Lash Lifting (120.00)
    data: new Date().toISOString().substring(0, 10), // Today
    hora: "11:30",
    duracao: 60,
    observacoes: "",
    status: "Agendado",
    valor_cobrado: 120.00,
    forma_pagamento: "Cartão de Débito",
    pago: false,
    fiado: false,
    valor_recebido: 0,
    desconto: 0,
    acrescimos: 0,
    custo: 20.00,
    produtos_utilizados: ["Molde de silicone", "Gel de permanente"],
    lucro_liquido: 100.00,
    created_at: new Date().toISOString()
  },
  {
    id: "a5",
    user_id: "demo-user",
    cliente_id: "c5",
    servico_id: "s2", // Design com Henna (65.00)
    data: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // 10 days ago
    hora: "16:00",
    duracao: 45,
    observacoes: "Cliente esqueceu a carteira. Solicitou pagar fiado até o quinto dia útil.",
    status: "Concluído",
    valor_cobrado: 65.00,
    forma_pagamento: "Fiado",
    pago: false,
    fiado: true,
    data_prevista_recebimento: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    valor_recebido: 0,
    desconto: 0,
    acrescimos: 0,
    custo: 12.00,
    produtos_utilizados: ["Henna profissional"],
    lucro_liquido: 53.00,
    created_at: new Date().toISOString()
  },
  {
    id: "a6",
    user_id: "demo-user",
    cliente_id: "c1",
    servico_id: "s5", // Brow Lamination (110.00)
    data: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // In 2 days
    hora: "15:00",
    duracao: 50,
    observacoes: "Quer testar o alinhamento de fios para ver se gosta.",
    status: "Agendado",
    valor_cobrado: 110.00,
    forma_pagamento: "Pix",
    pago: false,
    fiado: false,
    valor_recebido: 0,
    desconto: 0,
    acrescimos: 0,
    custo: 15.00,
    produtos_utilizados: ["Kit Brow Lamination"],
    lucro_liquido: 95.00,
    created_at: new Date().toISOString()
  }
];

function initLocalDatabase() {
  if (!localStorage.getItem("estetica_services")) {
    localStorage.setItem("estetica_services", JSON.stringify(MOCK_SERVICES));
  }
  if (!localStorage.getItem("estetica_clients")) {
    localStorage.setItem("estetica_clients", JSON.stringify(MOCK_CLIENTS));
  }
  if (!localStorage.getItem("estetica_expenses")) {
    localStorage.setItem("estetica_expenses", JSON.stringify(MOCK_EXPENSES));
  }
  if (!localStorage.getItem("estetica_appointments")) {
    localStorage.setItem("estetica_appointments", JSON.stringify(MOCK_APPOINTMENTS));
  }
}

// Ensure local db is initialized
initLocalDatabase();

// LocalStorage helpers
const getLocal = (key: string) => JSON.parse(localStorage.getItem(key) || "[]");
const setLocal = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

const getUserIdForLocal = (id: string) => {
  if (id === "00000000-0000-0000-0000-000000000002") return "demo-user";
  if (id === "00000000-0000-0000-0000-000000000001") return "master-id";
  return id;
};

// ==========================================
// DB SERVICE METHODS (BRIDGED DIRECTLY FOR SUPABASE & MOCK)
// ==========================================

export const databaseService = {
  // ==========================================
  // CLIENTS SERVICE
  // ==========================================
  async getClientes(userId: string, role?: string): Promise<Cliente[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase.from("clientes").select("*");
      if (role !== "master") {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.order("nome", { ascending: true });

      if (error) throw error;
      return data || [];
    } else {
      const all = getLocal("estetica_clients");
      const normalizedId = getUserIdForLocal(userId);
      return all.filter((c: Cliente) => role === "master" || c.user_id === normalizedId || normalizedId === "demo-user");
    }
  },

  async insertCliente(cliente: Omit<Cliente, "id" | "created_at">): Promise<Cliente> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("clientes")
        .insert([cliente])
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_clients");
      const newCliente: Cliente = {
        ...cliente,
        id: "c-" + Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      };
      all.push(newCliente);
      setLocal("estetica_clients", all);
      return newCliente;
    }
  },

  async updateCliente(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("clientes")
        .update(cliente)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_clients");
      const idx = all.findIndex((c: Cliente) => c.id === id);
      if (idx === -1) throw new Error("Client not found");
      const updated = { ...all[idx], ...cliente };
      all[idx] = updated;
      setLocal("estetica_clients", all);
      return updated;
    }
  },

  async deleteCliente(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("clientes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    } else {
      const all = getLocal("estetica_clients");
      const filtered = all.filter((c: Cliente) => c.id !== id);
      setLocal("estetica_clients", filtered);
      
      // Cascade delete appointments of this client
      const appointments = getLocal("estetica_appointments");
      const filteredApps = appointments.filter((a: Atendimento) => a.cliente_id !== id);
      setLocal("estetica_appointments", filteredApps);

      return true;
    }
  },

  // ==========================================
  // SERVICES SERVICE
  // ==========================================
  async getServicos(userId: string, role?: string): Promise<Servico[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase.from("servicos").select("*");
      if (role !== "master") {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.order("nome", { ascending: true });

      if (error) throw error;
      return data || [];
    } else {
      const all = getLocal("estetica_services");
      const normalizedId = getUserIdForLocal(userId);
      return all.filter((s: Servico) => role === "master" || s.user_id === normalizedId || normalizedId === "demo-user");
    }
  },

  async insertServico(servico: Omit<Servico, "id" | "created_at">): Promise<Servico> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("servicos")
        .insert([servico])
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_services");
      const newServico: Servico = {
        ...servico,
        id: "s-" + Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      };
      all.push(newServico);
      setLocal("estetica_services", all);
      return newServico;
    }
  },

  async updateServico(id: string, servico: Partial<Servico>): Promise<Servico> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("servicos")
        .update(servico)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_services");
      const idx = all.findIndex((s: Servico) => s.id === id);
      if (idx === -1) throw new Error("Service not found");
      const updated = { ...all[idx], ...servico };
      all[idx] = updated;
      setLocal("estetica_services", all);
      return updated;
    }
  },

  async deleteServico(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("servicos")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    } else {
      const all = getLocal("estetica_services");
      const filtered = all.filter((s: Servico) => s.id !== id);
      setLocal("estetica_services", filtered);
      return true;
    }
  },

  // ==========================================
  // APPOINTMENTS SERVICE
  // ==========================================
  async getAtendimentos(userId: string, role?: string): Promise<Atendimento[]> {
    if (isSupabaseConfigured && supabase) {
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
    } else {
      const appointments = getLocal("estetica_appointments");
      const clients = getLocal("estetica_clients");
      const services = getLocal("estetica_services");

      const normalizedId = getUserIdForLocal(userId);
      const filtered = appointments.filter((a: Atendimento) => role === "master" || a.user_id === normalizedId || normalizedId === "demo-user");
      
      return filtered.map((app: Atendimento) => {
        return {
          ...app,
          cliente: clients.find((c: Cliente) => c.id === app.cliente_id),
          servico: services.find((s: Servico) => s.id === app.servico_id)
        };
      });
    }
  },

  async insertAtendimento(atendimento: Omit<Atendimento, "id" | "created_at">): Promise<Atendimento> {
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

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("atendimentos")
        .insert([docToInsert])
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_appointments");
      const newAtendimento: Atendimento = {
        ...docToInsert,
        id: "a-" + Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      };
      all.push(newAtendimento);
      setLocal("estetica_appointments", all);
      
      // Load joins for return
      const clients = getLocal("estetica_clients");
      const services = getLocal("estetica_services");
      return {
        ...newAtendimento,
        cliente: clients.find((c: Cliente) => c.id === newAtendimento.cliente_id),
        servico: services.find((s: Servico) => s.id === newAtendimento.servico_id)
      };
    }
  },

  async updateAtendimento(id: string, atendimento: Partial<Atendimento>, professionalId: string): Promise<Atendimento> {
    // 1. Fetch current appointment to get google_event_id
    let currentApp: Atendimento | null = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from("atendimentos").select("*").eq("id", id).single();
      currentApp = data;
    } else {
      const all = getLocal("estetica_appointments");
      currentApp = all.find((a: Atendimento) => a.id === id) || null;
    }

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

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("atendimentos")
        .update(docToUpdate)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_appointments");
      const idx = all.findIndex((a: Atendimento) => a.id === id);
      if (idx === -1) throw new Error("Appointment not found");
      const updated = { ...all[idx], ...docToUpdate };
      all[idx] = updated;
      setLocal("estetica_appointments", all);

      const clients = getLocal("estetica_clients");
      const services = getLocal("estetica_services");
      return {
        ...updated,
        cliente: clients.find((c: Cliente) => c.id === updated.cliente_id),
        servico: services.find((s: Servico) => s.id === updated.servico_id)
      };
    }
  },

  async deleteAtendimento(id: string, professionalId: string): Promise<boolean> {
    // 1. Fetch to get Google event id
    let currentApp: Atendimento | null = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from("atendimentos").select("*").eq("id", id).single();
      currentApp = data;
    } else {
      const all = getLocal("estetica_appointments");
      currentApp = all.find((a: Atendimento) => a.id === id) || null;
    }

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

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("atendimentos")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    } else {
      const all = getLocal("estetica_appointments");
      const filtered = all.filter((a: Atendimento) => a.id !== id);
      setLocal("estetica_appointments", filtered);
      return true;
    }
  },

  // ==========================================
  // EXPENSES SERVICE
  // ==========================================
  async getDespesas(userId: string, role?: string): Promise<Despesa[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase.from("despesas").select("*");
      if (role !== "master") {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.order("data", { ascending: false });

      if (error) throw error;
      return data || [];
    } else {
      const all = getLocal("estetica_expenses");
      const normalizedId = getUserIdForLocal(userId);
      return all.filter((e: Despesa) => role === "master" || e.user_id === normalizedId || normalizedId === "demo-user");
    }
  },

  async insertDespesa(despesa: Omit<Despesa, "id" | "created_at">): Promise<Despesa> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("despesas")
        .insert([despesa])
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_expenses");
      const newDespesa: Despesa = {
        ...despesa,
        id: "e-" + Math.random().toString(36).substr(2, 9),
        created_at: new Date().toISOString()
      };
      all.push(newDespesa);
      setLocal("estetica_expenses", all);
      return newDespesa;
    }
  },

  async updateDespesa(id: string, despesa: Partial<Despesa>): Promise<Despesa> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("despesas")
        .update(despesa)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const all = getLocal("estetica_expenses");
      const idx = all.findIndex((e: Despesa) => e.id === id);
      if (idx === -1) throw new Error("Expense not found");
      const updated = { ...all[idx], ...despesa };
      all[idx] = updated;
      setLocal("estetica_expenses", all);
      return updated;
    }
  },

  async deleteDespesa(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("despesas")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    } else {
      const all = getLocal("estetica_expenses");
      const filtered = all.filter((e: Despesa) => e.id !== id);
      setLocal("estetica_expenses", filtered);
      return true;
    }
  },

  // ==========================================
  // USERS MANAGEMENT SERVICE (Master Only)
  // ==========================================
  async getSystemUsers(): Promise<any[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, nome, role, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } else {
      const all = getLocal("estetica_users") || [];
      if (all.length === 0) {
        // Se vazio, adicione o master padrão no mockup
        const defaultMaster = { id: "master-id", username: "zotgod", nome: "Master Admin", role: "master", created_at: new Date().toISOString() };
        all.push(defaultMaster);
        setLocal("estetica_users", all);
      }
      return all;
    }
  },

  async insertSystemUser(payload: { username: string; password_hash: string; nome: string; role: string }): Promise<any> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("create_system_user", {
        p_username: payload.username,
        p_password: payload.password_hash,
        p_nome: payload.nome,
        p_role: payload.role
      });

      if (error) throw error;
      return data && data[0];
    } else {
      const all = getLocal("estetica_users") || [];
      const newUser = {
        id: "u-" + Math.random().toString(36).substr(2, 9),
        username: payload.username,
        nome: payload.nome,
        role: payload.role,
        created_at: new Date().toISOString()
      };
      all.push(newUser);
      setLocal("estetica_users", all);
      return newUser;
    }
  },

  async updateSystemUser(id: string, payload: { username: string; password_hash?: string; nome: string; role: string }): Promise<any> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc("update_system_user", {
        p_id: id,
        p_username: payload.username,
        p_password: payload.password_hash || "",
        p_nome: payload.nome,
        p_role: payload.role
      });

      if (error) throw error;
      return data && data[0];
    } else {
      const all = getLocal("estetica_users") || [];
      const idx = all.findIndex((u: any) => u.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], username: payload.username, nome: payload.nome, role: payload.role };
        setLocal("estetica_users", all);
        return all[idx];
      }
      return null;
    }
  },

  async deleteSystemUser(id: string): Promise<boolean> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    } else {
      const all = getLocal("estetica_users") || [];
      const filtered = all.filter((u: any) => u.id !== id);
      setLocal("estetica_users", filtered);
      return true;
    }
  }
};
