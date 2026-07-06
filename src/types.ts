/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Cliente {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  whatsapp: string;
  data_nascimento: string; // YYYY-MM-DD
  email: string;
  endereco: string;
  observacoes: string;
  foto_antes: string; // URL or Base64
  foto_depois: string; // URL or Base64
  ativo: boolean;
  created_at: string;
}

export interface Servico {
  id: string;
  user_id: string;
  nome: string;
  valor: number;
  duracao: number; // in minutes
  descricao: string;
  produtos: string[];
  created_at: string;
}

export type AtendimentoStatus = "Agendado" | "Concluído" | "Cancelado";

export interface Atendimento {
  id: string;
  user_id: string;
  cliente_id: string;
  servico_id: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM
  duracao: number; // in minutes
  observacoes: string;
  status: AtendimentoStatus;
  
  // Financeiro do Atendimento
  valor_cobrado: number;
  forma_pagamento: string; // "Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Fiado"
  data_pagamento?: string; // YYYY-MM-DD
  pago: boolean;
  fiado: boolean;
  data_prevista_recebimento?: string; // YYYY-MM-DD
  valor_recebido: number;
  desconto: number;
  acrescimos: number;
  
  // Custos e Lucro
  custo: number;
  produtos_utilizados: string[];
  lucro_liquido: number;
  
  // Sync
  google_event_id?: string;
  created_at: string;
  
  // Joined fields for display
  cliente?: Cliente;
  servico?: Servico;
}

export interface Despesa {
  id: string;
  user_id: string;
  categoria: string; // "Aluguel", "Água", "Luz", "Internet", "Produtos", "Materiais", "Funcionários", "Marketing", "Equipamentos", "Impostos", "Outros"
  descricao: string;
  valor: number;
  data: string; // YYYY-MM-DD
  forma_pagamento: string;
  observacoes: string;
  created_at: string;
}

export interface GoogleConnection {
  connected: boolean;
  remindersMinutes: number;
}

export interface UserSession {
  id: string;
  username: string;
  nome: string;
  role: "master" | "user";
  email?: string;
}
