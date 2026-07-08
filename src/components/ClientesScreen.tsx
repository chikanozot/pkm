/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { Cliente, Atendimento } from "../types.js";
import { useAuth } from "../contexts/AuthContext.js";
import { 
  Search, Plus, Phone, Mail, MapPin, Edit, Trash2, X, Check, Eye, AlertCircle, Camera, Calendar, FileText, ToggleLeft, ToggleRight
} from "lucide-react";

export const ClientesScreen: React.FC = () => {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals / Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [fotoAntes, setFotoAntes] = useState("");
  const [fotoDepois, setFotoDepois] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) {
      console.log("[Diagnóstico Clientes] Nenhum usuário logado no aplicativo.");
      return;
    }
    setLoading(true);
    
    console.log("[Diagnóstico Clientes] >>> INICIANDO CARREGAMENTO DE CLIENTES <<<");
    console.log("[Diagnóstico Clientes] - Usuário atual do aplicativo:", user);
    console.log("[Diagnóstico Clientes] - user_id usado na consulta:", user.id);
    console.log("[Diagnóstico Clientes] - user.role:", user.role);

    try {
      // Log antes de executar a query
      console.log("[Diagnóstico Clientes] - Executando SELECT * FROM clientes WHERE user_id =", user.id);
      
      const dataClientes = await databaseService.getClientes(user.id);
      
      console.log("[Diagnóstico Clientes] - Retorno do Supabase (dataClientes):", dataClientes);
      console.log("[Diagnóstico Clientes] - Quantidade de clientes retornados:", dataClientes ? dataClientes.length : 0);
      
      if (dataClientes && dataClientes.length > 0) {
        console.log("[Diagnóstico Clientes] - Detalhes do primeiro cliente retornado:", {
          id: dataClientes[0].id,
          user_id: dataClientes[0].user_id,
          nome: dataClientes[0].nome,
          user_id_matches_current: dataClientes[0].user_id === user.id
        });
      } else {
        console.warn(
          "[Diagnóstico Clientes] - ATENÇÃO: Supabase retornou 0 clientes com sucesso (sem erro)." +
          "\nIsso indica fortemente que existe um bloqueio de RLS (Row Level Security) ativado na tabela 'clientes' no console do Supabase," +
          "\nou que os registros foram criados com um user_id diferente do ID do usuário atual do aplicativo."
        );
      }

      const dataAtendimentos = await databaseService.getAtendimentos(user.id);
      console.log("[Diagnóstico Clientes] - Quantidade de atendimentos retornados:", dataAtendimentos ? dataAtendimentos.length : 0);

      setClientes(dataClientes);
      setAtendimentos(dataAtendimentos);
    } catch (err: any) {
      console.error("[Diagnóstico Clientes] - Erro ao carregar dados do Supabase:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (cli: Cliente | null = null) => {
    if (cli) {
      setEditId(cli.id);
      setNome(cli.nome);
      setTelefone(cli.telefone);
      setWhatsapp(cli.whatsapp);
      setDataNascimento(cli.data_nascimento || "");
      setEmail(cli.email || "");
      setEndereco(cli.endereco || "");
      setObservacoes(cli.observacoes || "");
      setFotoAntes(cli.foto_antes || "");
      setFotoDepois(cli.foto_depois || "");
      setAtivo(cli.ativo);
    } else {
      setEditId(null);
      setNome("");
      setTelefone("");
      setWhatsapp("");
      setDataNascimento("");
      setEmail("");
      setEndereco("");
      setObservacoes("");
      setFotoAntes("");
      setFotoDepois("");
      setAtivo(true);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditId(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "antes" | "depois") => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (type === "antes") {
        setFotoAntes(base64String);
      } else {
        setFotoDepois(base64String);
      }
    };
    reader.readAsDataURL(file);
  };

  const parseAndNormalizeDate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    // Se o valor consistir apenas de caracteres de máscara como *, d, m, y, a, -, / ou espaços (por exemplo, "**", "**/**/****")
    if (/^[*\s/-]+$/.test(trimmed) || /^[a-zA-Z\s/-]+$/.test(trimmed)) {
      return null;
    }

    // Verifica se já está no formato YYYY-MM-DD
    const yyyymmddRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    if (yyyymmddRegex.test(trimmed)) {
      const match = trimmed.match(yyyymmddRegex);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1800 && year < 2100) {
          return trimmed;
        }
      }
      return null;
    }

    // Se estiver no formato DD/MM/YYYY ou DD-MM-YYYY (comum no Brasil)
    const ddmmyyyyRegex = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
    if (ddmmyyyyRegex.test(trimmed)) {
      const match = trimmed.match(ddmmyyyyRegex);
      if (match) {
        const day = match[1];
        const month = match[2];
        const year = match[3];
        return `${year}-${month}-${day}`;
      }
    }

    // Se for outro formato, tenta fazer o parse usando Date nativo
    const timestamp = Date.parse(trimmed);
    if (!isNaN(timestamp)) {
      const d = new Date(timestamp);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      console.log("[Diagnóstico Salvar Cliente] Nenhum usuário logado.");
      return;
    }

    const payload = {
      user_id: user.id,
      nome,
      telefone,
      whatsapp,
      data_nascimento: parseAndNormalizeDate(dataNascimento),
      email,
      endereco,
      observacoes,
      foto_antes: fotoAntes,
      foto_depois: fotoDepois,
      ativo
    };

    console.log("[Diagnóstico Salvar Cliente] >>> INICIANDO SALVAMENTO DE CLIENTE <<<");
    console.log("[Diagnóstico Salvar Cliente] - Payload enviado para o Supabase:", payload);

    try {
      if (editId) {
        console.log("[Diagnóstico Salvar Cliente] - Executando UPDATE para cliente ID:", editId);
        const result = await databaseService.updateCliente(editId, payload);
        console.log("[Diagnóstico Salvar Cliente] - Resultado do UPDATE:", result);
      } else {
        console.log("[Diagnóstico Salvar Cliente] - Executando INSERT");
        const result = await databaseService.insertCliente(payload);
        console.log("[Diagnóstico Salvar Cliente] - Resultado do INSERT:", result);
      }
      console.log("[Diagnóstico Salvar Cliente] - Salvamento realizado com sucesso! Chamando loadData() para recarregar a lista...");
      loadData();
      handleCloseForm();
    } catch (err: any) {
      console.error("[Diagnóstico Salvar Cliente] - Erro ao salvar cliente no Supabase:", err);
      console.error("[Supabase Save Client Error] Detailed error object:", err);
      
      const supabaseMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
      const supabaseCode = err?.code || "N/A";
      const supabaseDetails = err?.details || "N/A";
      const supabaseHint = err?.hint || "N/A";
      
      const detailedError = `Erro ao salvar dados do cliente.\n\n` +
        `- Mensagem Completa: ${supabaseMsg}\n` +
        `- Código do Erro: ${supabaseCode}\n` +
        `- Detalhes: ${supabaseDetails}\n` +
        `- Hint: ${supabaseHint}`;
        
      alert(detailedError);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Tem certeza que deseja excluir este cliente? Todos os atendimentos associados a ele também serão excluídos!");
    if (!confirmed) return;

    try {
      await databaseService.deleteCliente(id);
      loadData();
      if (selectedCliente?.id === id) {
        setIsDetailsOpen(false);
      }
    } catch (err) {
      console.error("Erro ao excluir cliente", err);
      alert("Erro ao excluir cliente.");
    }
  };

  const handleOpenDetails = (cli: Cliente) => {
    setSelectedCliente(cli);
    setIsDetailsOpen(true);
  };

  const filteredClientes = clientes.filter(cli => 
    cli.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cli.telefone.includes(searchTerm) ||
    cli.whatsapp.includes(searchTerm) ||
    (cli.email && cli.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getHistoryOfClient = (clientId: string) => {
    return atendimentos.filter(at => at.cliente_id === clientId);
  };

  const getServicosNomes = (at: Atendimento) => {
    if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
      return at.servicos_detalhes.map(s => s.nome).join(", ");
    }
    return at.servico?.nome || "Serviço Personalizado";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-stone-900">Clientes</h1>
          <p className="text-sm text-stone-500 mt-0.5">Cadastre e acompanhe o histórico completo de atendimentos e fotos antes/depois.</p>
        </div>
        <button
          onClick={() => handleOpenForm(null)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      {/* Search & Stats */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-stone-200/60 shadow-sm">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por nome, telefone, whatsapp ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
          />
        </div>
      </div>

      {/* Main List & Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Carregando carteira de clientes...</p>
        </div>
      ) : filteredClientes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="font-serif text-lg text-stone-800 font-medium">Nenhum cliente cadastrado</p>
          <p className="text-stone-500 text-sm mt-1 max-w-sm mx-auto">Comece a cadastrar suas clientes para poder agendar atendimentos e registrar fotos e dados.</p>
          <button
            onClick={() => handleOpenForm(null)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Cadastrar Primeiro Cliente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClientes.map((cli) => {
            const clientHistory = getHistoryOfClient(cli.id);
            return (
              <div 
                key={cli.id}
                className="bg-white rounded-2xl border border-stone-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Header Card */}
                <div className="p-5 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-lg border border-rose-100 uppercase shrink-0">
                    {cli.nome.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-stone-900 truncate text-base">{cli.nome}</h3>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${cli.ativo ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-stone-100 text-stone-500 border border-stone-200'}`}>
                        {cli.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      {cli.whatsapp || cli.telefone || "Sem telefone"}
                    </p>
                    {cli.email && (
                      <p className="text-xs text-stone-400 truncate flex items-center gap-1.5 mt-0.5">
                        <Mail className="w-3.5 h-3.5" />
                        {cli.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick Info & Photos Preview */}
                <div className="px-5 pb-3 pt-1 border-t border-stone-50 flex items-center justify-between text-xs text-stone-500">
                  <span>Atendimentos: <b>{clientHistory.length}</b></span>
                  {cli.data_nascimento && (
                    <span>Nasc: <b>{new Date(cli.data_nascimento).toLocaleDateString("pt-BR")}</b></span>
                  )}
                </div>

                {/* Photos strip */}
                {(cli.foto_antes || cli.foto_depois) && (
                  <div className="px-5 py-2 bg-stone-50/50 border-y border-stone-100 flex gap-2">
                    {cli.foto_antes && (
                      <div className="relative group overflow-hidden rounded-md border border-stone-200">
                        <img src={cli.foto_antes} className="w-10 h-10 object-cover" alt="Antes" />
                        <span className="absolute bottom-0 inset-x-0 bg-stone-900/60 text-[8px] text-white text-center py-0.5">Antes</span>
                      </div>
                    )}
                    {cli.foto_depois && (
                      <div className="relative group overflow-hidden rounded-md border border-stone-200">
                        <img src={cli.foto_depois} className="w-10 h-10 object-cover" alt="Depois" />
                        <span className="absolute bottom-0 inset-x-0 bg-rose-900/60 text-[8px] text-white text-center py-0.5">Depois</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="p-4 bg-stone-50/70 border-t border-stone-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenDetails(cli)}
                    className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-white rounded-lg border border-transparent hover:border-stone-200 shadow-sm transition-all text-xs flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ficha
                  </button>
                  <button
                    onClick={() => handleOpenForm(cli)}
                    className="p-1.5 text-stone-600 hover:text-stone-950 hover:bg-white rounded-lg border border-transparent hover:border-stone-200 shadow-sm transition-all text-xs flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Edit className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(cli.id)}
                    className="p-1.5 text-red-600 hover:text-red-700 hover:bg-white rounded-lg border border-transparent hover:border-red-100 shadow-sm transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAILS MODAL */}
      {isDetailsOpen && selectedCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold">{selectedCliente.nome}</h2>
                <p className="text-xs text-stone-300 mt-0.5">Ficha de Anamnese & Atendimentos</p>
              </div>
              <button 
                onClick={() => setIsDetailsOpen(false)}
                className="p-1.5 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Contact Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200/50">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-stone-700">
                    <Phone className="w-4 h-4 text-stone-400" />
                    <span>WhatsApp: <b>{selectedCliente.whatsapp || "Não informado"}</b></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-700">
                    <Mail className="w-4 h-4 text-stone-400" />
                    <span className="truncate">Email: <b>{selectedCliente.email || "Não informado"}</b></span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-stone-700">
                    <Calendar className="w-4 h-4 text-stone-400" />
                    <span>Nascimento: <b>{selectedCliente.data_nascimento ? new Date(selectedCliente.data_nascimento).toLocaleDateString("pt-BR") : "Não informada"}</b></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-700">
                    <MapPin className="w-4 h-4 text-stone-400" />
                    <span className="truncate">Endereço: <b>{selectedCliente.endereco || "Não informado"}</b></span>
                  </div>
                </div>
              </div>

              {/* Photos Gallery */}
              <div className="space-y-3">
                <h3 className="font-serif text-lg font-medium text-stone-800 border-b border-stone-100 pb-1 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-rose-500" /> Evolução de Procedimento
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Antes */}
                  <div className="border border-stone-200/80 rounded-xl p-3 bg-stone-50 flex flex-col items-center justify-center">
                    <span className="text-xs font-semibold text-stone-500 mb-2 uppercase">Antes do procedimento</span>
                    {selectedCliente.foto_antes ? (
                      <img src={selectedCliente.foto_antes} className="h-44 w-full object-cover rounded-lg border border-stone-200 shadow-inner" alt="Antes" />
                    ) : (
                      <div className="h-44 w-full rounded-lg bg-stone-100 border-2 border-dashed border-stone-200 flex items-center justify-center text-xs text-stone-400">
                        Sem foto de "Antes" registrada
                      </div>
                    )}
                  </div>

                  {/* Depois */}
                  <div className="border border-stone-200/80 rounded-xl p-3 bg-stone-50 flex flex-col items-center justify-center">
                    <span className="text-xs font-semibold text-rose-600 mb-2 uppercase">Depois do procedimento</span>
                    {selectedCliente.foto_depois ? (
                      <img src={selectedCliente.foto_depois} className="h-44 w-full object-cover rounded-lg border border-stone-200 shadow-inner" alt="Depois" />
                    ) : (
                      <div className="h-44 w-full rounded-lg bg-stone-100 border-2 border-dashed border-stone-200 flex items-center justify-center text-xs text-stone-400">
                        Sem foto de "Depois" registrada
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Observations */}
              {selectedCliente.observacoes && (
                <div className="p-4 bg-rose-50/40 rounded-xl border border-rose-100">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <FileText className="w-4 h-4" /> Observações e Ficha Técnica
                  </h4>
                  <p className="text-sm text-rose-950/80 leading-relaxed whitespace-pre-wrap">{selectedCliente.observacoes}</p>
                </div>
              )}

              {/* Appointment History */}
              <div className="space-y-3">
                <h3 className="font-serif text-lg font-medium text-stone-800 border-b border-stone-100 pb-1">Histórico de Atendimentos</h3>
                {getHistoryOfClient(selectedCliente.id).length === 0 ? (
                  <p className="text-sm text-stone-500 italic py-4">Nenhum atendimento realizado para esta cliente ainda.</p>
                ) : (
                  <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
                    {getHistoryOfClient(selectedCliente.id).map((at) => (
                      <div key={at.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-stone-50/50">
                        <div>
                          <p className="text-sm font-semibold text-stone-800">{getServicosNomes(at)}</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Data: <b>{new Date(at.data).toLocaleDateString("pt-BR")} às {at.hora}</b> • Duração: <b>{at.duracao} min</b>
                          </p>
                          {at.observacoes && (
                            <p className="text-xs text-stone-400 mt-1 italic">Obs: {at.observacoes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            at.status === "Concluído" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                            at.status === "Cancelado" ? "bg-red-50 text-red-600 border border-red-100" :
                            "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}>
                            {at.status}
                          </span>
                          <span className="text-sm font-semibold text-stone-900">R$ {at.valor_cobrado.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-2">
              <button 
                onClick={() => {
                  setIsDetailsOpen(false);
                  handleOpenForm(selectedCliente);
                }}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Editar Ficha
              </button>
              <button 
                onClick={() => setIsDetailsOpen(false)}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL (ADD / EDIT) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">{editId ? "Editar Cadastro" : "Adicionar Cliente"}</h2>
              <button onClick={handleCloseForm} className="p-1.5 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="Nome completo da cliente"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">WhatsApp / Celular *</label>
                  <input
                    type="text"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Telefone Fixo</label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="(11) 5555-5555"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Nascimento</label>
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="email@cliente.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Endereço</label>
                <input
                  type="text"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="Rua, número, complemento, bairro - Cidade"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Observações e Alergias</label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                  placeholder="Ficha de Anamnese: anote alergias, preferências de cor, sensibilidade, etc."
                />
              </div>

              {/* Photos Capture / Upload in base64 */}
              <div className="grid grid-cols-2 gap-4 border-t border-stone-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Foto Antes
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, "antes")}
                    className="hidden"
                    id="upload-antes"
                  />
                  <label
                    htmlFor="upload-antes"
                    className="block w-full border border-dashed border-stone-300 rounded-xl p-2 text-center bg-stone-50 hover:bg-stone-100/50 cursor-pointer text-xs font-medium text-stone-600 hover:border-stone-400 transition-colors"
                  >
                    {fotoAntes ? "Alterar Foto Antes" : "Enviar Foto Antes"}
                  </label>
                  {fotoAntes && (
                    <div className="mt-2 relative">
                      <img src={fotoAntes} className="h-20 w-full object-cover rounded-lg border" alt="Antes" />
                      <button type="button" onClick={() => setFotoAntes("")} className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded-full"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Foto Depois
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, "depois")}
                    className="hidden"
                    id="upload-depois"
                  />
                  <label
                    htmlFor="upload-depois"
                    className="block w-full border border-dashed border-stone-300 rounded-xl p-2 text-center bg-stone-50 hover:bg-stone-100/50 cursor-pointer text-xs font-medium text-stone-600 hover:border-stone-400 transition-colors"
                  >
                    {fotoDepois ? "Alterar Foto Depois" : "Enviar Foto Depois"}
                  </label>
                  {fotoDepois && (
                    <div className="mt-2 relative">
                      <img src={fotoDepois} className="h-20 w-full object-cover rounded-lg border" alt="Depois" />
                      <button type="button" onClick={() => setFotoDepois("")} className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded-full"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* Ativo toggle */}
              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <div>
                  <span className="text-xs font-bold text-stone-700 tracking-wide uppercase">Status do Cadastro</span>
                  <p className="text-[11px] text-stone-400">Clientes inativos não aparecem como sugestão nos agendamentos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className="text-stone-700 hover:text-stone-900 focus:outline-none cursor-pointer"
                >
                  {ativo ? <ToggleRight className="w-8 h-8 text-rose-600" /> : <ToggleLeft className="w-8 h-8 text-stone-300" />}
                </button>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
                >
                  {editId ? "Salvar Alterações" : "Salvar Cadastro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
