/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { Servico } from "../types.js";
import { useAuth } from "../contexts/AuthContext.js";
import { Plus, Edit, Trash2, X, AlertCircle, ShoppingBag, Clock, DollarSign, FileText } from "lucide-react";

export const ServicosScreen: React.FC = () => {
  const { user } = useAuth();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [duracao, setDuracao] = useState("");
  const [descricao, setDescricao] = useState("");
  const [produtos, setProdutos] = useState<string[]>([]);
  const [newProduto, setNewProduto] = useState("");

  useEffect(() => {
    loadServicos();
  }, [user]);

  const loadServicos = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await databaseService.getServicos(user.id);
      setServicos(data);
    } catch (err) {
      console.error("Erro ao carregar serviços", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (srv: Servico | null = null) => {
    if (srv) {
      setEditId(srv.id);
      setNome(srv.nome);
      setValor(srv.valor.toString());
      setDuracao(srv.duracao.toString());
      setDescricao(srv.descricao || "");
      setProdutos(srv.produtos || []);
    } else {
      setEditId(null);
      setNome("");
      setValor("");
      setDuracao("");
      setDescricao("");
      setProdutos([]);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditId(null);
  };

  const handleAddProductTag = () => {
    if (!newProduto.trim()) return;
    if (!produtos.includes(newProduto.trim())) {
      setProdutos([...produtos, newProduto.trim()]);
    }
    setNewProduto("");
  };

  const handleRemoveProductTag = (index: number) => {
    setProdutos(produtos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      nome,
      valor: parseFloat(valor),
      duracao: parseInt(duracao),
      descricao,
      produtos
    };

    try {
      if (editId) {
        await databaseService.updateServico(editId, payload);
      } else {
        await databaseService.insertServico(payload);
      }
      loadServicos();
      handleCloseForm();
    } catch (err: any) {
      console.error("[Supabase Save Service Error] Detailed error object:", err);
      
      const supabaseMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
      const supabaseCode = err?.code || "N/A";
      const supabaseDetails = err?.details || "N/A";
      const supabaseHint = err?.hint || "N/A";
      
      const detailedError = `Erro ao salvar serviço.\n\n` +
        `- Mensagem Completa: ${supabaseMsg}\n` +
        `- Código do Erro: ${supabaseCode}\n` +
        `- Detalhes: ${supabaseDetails}\n` +
        `- Hint: ${supabaseHint}`;
        
      alert(detailedError);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Excluir este serviço? Ele não será apagado de atendimentos passados, mas não estará disponível para novos.");
    if (!confirmed) return;

    try {
      await databaseService.deleteServico(id);
      loadServicos();
    } catch (err) {
      console.error("Erro ao deletar serviço", err);
      alert("Erro ao excluir serviço.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-stone-900">Procedimentos & Serviços</h1>
          <p className="text-sm text-stone-500 mt-0.5">Defina seu catálogo de estética: valores, duração e insumos inclusos.</p>
        </div>
        <button
          onClick={() => handleOpenForm(null)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Procedimento
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Carregando catálogo de estética...</p>
        </div>
      ) : servicos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="font-serif text-lg text-stone-800 font-medium">Nenhum serviço cadastrado</p>
          <p className="text-stone-500 text-sm mt-1 max-w-sm mx-auto">Adicione seus procedimentos (ex: Design de Sobrancelha, Micropigmentação, etc.) para habilitar o agendamento.</p>
          <button
            onClick={() => handleOpenForm(null)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Cadastrar Primeiro Serviço
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {servicos.map((srv) => (
            <div 
              key={srv.id}
              className="bg-white rounded-2xl border border-stone-200/60 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-serif text-lg font-semibold text-stone-900 leading-tight">{srv.nome}</h3>
                  <span className="text-lg font-bold text-rose-600 shrink-0">
                    R$ {srv.valor.toFixed(2)}
                  </span>
                </div>

                <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
                  {srv.descricao || "Sem descrição fornecida."}
                </p>

                {/* Duration Badge */}
                <div className="flex items-center gap-1.5 text-xs text-stone-600 font-medium bg-stone-50 py-1.5 px-3 rounded-lg border border-stone-100 w-fit">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  <span>Duração: <b>{srv.duracao} minutos</b></span>
                </div>

                {/* Products List */}
                {srv.produtos && srv.produtos.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400 flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" /> Insumos / Produtos Usados
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {srv.produtos.map((p, idx) => (
                        <span key={idx} className="bg-stone-100 text-stone-600 border border-stone-200 text-[10px] px-2 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleOpenForm(srv)}
                  className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-50 rounded-lg border border-transparent hover:border-stone-200 shadow-sm transition-all text-xs flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Edit className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => handleDelete(srv.id)}
                  className="p-1.5 text-red-600 hover:text-red-700 hover:bg-stone-50 rounded-lg border border-transparent hover:border-red-100 shadow-sm transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">{editId ? "Editar Serviço" : "Cadastrar Procedimento"}</h2>
              <button onClick={handleCloseForm} className="p-1.5 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Nome do Procedimento *</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="Ex: Design de Sobrancelha com Henna"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Preço Padrão *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="Ex: 65.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Tempo Médio (min) *
                  </label>
                  <input
                    type="number"
                    required
                    value={duracao}
                    onChange={(e) => setDuracao(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="Ex: 45"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Descrição Detalhada
                </label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                  placeholder="Descreva as etapas do procedimento e cuidados recomendados."
                />
              </div>

              {/* Products tagging system */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5" /> Produtos / Insumos Utilizados
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProduto}
                    onChange={(e) => setNewProduto(e.target.value)}
                    className="block flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none"
                    placeholder="Ex: Pinça descartável"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddProductTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddProductTag}
                    className="px-3 py-2 bg-stone-900 text-white hover:bg-stone-850 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {produtos.map((prod, index) => (
                    <span 
                      key={index} 
                      className="bg-stone-50 border border-stone-200 text-stone-700 text-xs px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm"
                    >
                      {prod}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveProductTag(index)}
                        className="text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {produtos.length === 0 && (
                    <p className="text-[11px] text-stone-400 italic">Nenhum produto listado ainda.</p>
                  )}
                </div>
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
                  {editId ? "Salvar Alterações" : "Salvar Serviço"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
