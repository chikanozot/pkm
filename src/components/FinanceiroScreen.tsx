/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { Despesa, Atendimento } from "../types.js";
import { useAuth } from "../contexts/AuthContext.js";
import { 
  Plus, Edit, Trash2, X, AlertCircle, TrendingDown, DollarSign, Calendar, FileText, Filter, Tag, CheckCircle2
} from "lucide-react";

export const FinanceiroScreen: React.FC = () => {
  const { user } = useAuth();
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState("Produtos");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().substring(0, 10));
  const [formaPagamento, setFormaPagamento] = useState("Pix");
  const [observacoes, setObservacoes] = useState("");

  const formatClienteNome = (nome?: string) => {
    if (!nome) return "Cliente Avulso";
    return nome.replace(/^\[EXCLUÍDO\]\s*/i, "");
  };

  // Filters State
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // First of current month
    return d.toISOString().substring(0, 10);
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });
  const [filterCategory, setFilterCategory] = useState("Todas");

  const getServicosNomes = (at: Atendimento) => {
    if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
      return at.servicos_detalhes.map(s => s.nome).join(", ");
    }
    return at.servico?.nome || "Aesthetics";
  };

  const categories = [
    "Aluguel", "Água", "Luz", "Internet", "Produtos", "Materiais", 
    "Funcionários", "Marketing", "Equipamentos", "Impostos", "Outras despesas"
  ];

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dataDespesas = await databaseService.getDespesas(user.id);
      const dataAtendimentos = await databaseService.getAtendimentos(user.id);
      setDespesas(dataDespesas);
      setAtendimentos(dataAtendimentos);
    } catch (err) {
      console.error("Erro ao carregar dados financeiros", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (des: Despesa | null = null) => {
    if (des) {
      setEditId(des.id);
      setCategoria(des.categoria);
      setDescricao(des.descricao);
      setValor(des.valor.toString());
      setData(des.data);
      setFormaPagamento(des.forma_pagamento);
      setObservacoes(des.observacoes || "");
    } else {
      setEditId(null);
      setCategoria("Produtos");
      setDescricao("");
      setValor("");
      setData(new Date().toISOString().substring(0, 10));
      setFormaPagamento("Pix");
      setObservacoes("");
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      user_id: user.id,
      categoria,
      descricao,
      valor: parseFloat(valor),
      data,
      forma_pagamento: formaPagamento,
      observacoes
    };

    try {
      if (editId) {
        await databaseService.updateDespesa(editId, payload);
      } else {
        await databaseService.insertDespesa(payload);
      }
      loadData();
      handleCloseForm();
    } catch (err) {
      console.error("Erro ao salvar despesa", err);
      alert("Erro ao salvar despesa.");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Excluir esta despesa permanentemente?");
    if (!confirmed) return;

    try {
      await databaseService.deleteDespesa(id);
      loadData();
    } catch (err) {
      console.error("Erro ao excluir despesa", err);
      alert("Erro ao excluir despesa.");
    }
  };

  // Filter listings
  const filteredDespesas = despesas.filter(d => {
    const inDate = d.data >= filterStartDate && d.data <= filterEndDate;
    const inCat = filterCategory === "Todas" || d.categoria === filterCategory;
    return inDate && inCat;
  });

  const filteredRevenues = atendimentos.filter(at => {
    const isPaid = at.pago;
    const inDate = at.data >= filterStartDate && at.data <= filterEndDate;
    return isPaid && inDate;
  });

  const totalDespesasFiltradas = filteredDespesas.reduce((acc, d) => acc + d.valor, 0);
  const totalReceitasFiltradas = filteredRevenues.reduce((acc, r) => acc + r.valor_recebido, 0);
  const saldoPeriodo = totalReceitasFiltradas - totalDespesasFiltradas;

  // Modern metrics requested by user:
  const totalRecebido = totalReceitasFiltradas;
  const totalGastoInsumos = filteredRevenues.reduce((acc, r) => acc + (r.custo || 0), 0);
  const lucroObtido = totalRecebido - totalGastoInsumos;
  const margemLucro = totalRecebido > 0 ? (lucroObtido / totalRecebido) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-stone-900">Fluxo Financeiro</h1>
          <p className="text-sm text-stone-500 mt-0.5">Registre despesas corporativas e audite a movimentação de caixa da sua clínica.</p>
        </div>
        <button
          onClick={() => handleOpenForm(null)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar Despesa
        </button>
      </div>

      {/* Date Period Selector */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-[10px] font-bold uppercase text-stone-500 tracking-wider mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> De:
          </label>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-stone-500 tracking-wider mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Até:
          </label>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-stone-500 tracking-wider mb-1.5 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Categoria Despesa:
          </label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none font-medium"
          >
            <option value="Todas">Todas as categorias</option>
            {categories.map((cat, idx) => (
              <option key={idx} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <button
          onClick={loadData}
          className="w-full py-2 bg-stone-900 hover:bg-stone-850 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-colors"
        >
          Atualizar Dados
        </button>
      </div>

      {/* Financial Summary for Selected Period */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Receitas Recebidas</span>
            <h3 className="text-2xl font-bold text-stone-900 mt-1">R$ {totalReceitasFiltradas.toFixed(2)}</h3>
            <p className="text-[10px] text-stone-400 mt-1 font-semibold">{filteredRevenues.length} faturamentos realizados</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Despesas Registradas</span>
            <h3 className="text-2xl font-bold text-stone-900 mt-1">R$ {totalDespesasFiltradas.toFixed(2)}</h3>
            <p className="text-[10px] text-stone-400 mt-1 font-semibold">{filteredDespesas.length} despesas lançadas</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className={`bg-white rounded-2xl border border-stone-200/60 shadow-sm p-5 flex items-center justify-between`}>
          <div>
            <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Resultado (Saldo)</span>
            <h3 className={`text-2xl font-bold mt-1 ${saldoPeriodo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              R$ {saldoPeriodo.toFixed(2)}
            </h3>
            <p className="text-[10px] text-stone-400 mt-1 font-semibold">Saldo líquido do período</p>
          </div>
          <div className={`p-3 rounded-xl border ${saldoPeriodo >= 0 ? "bg-emerald-50/50 text-emerald-600 border-emerald-100" : "bg-red-50/50 text-red-600 border-red-100"}`}>
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Indicadores de Rentabilidade dos Serviços */}
      <div className="space-y-3 bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm">
        <h3 className="font-serif text-sm font-semibold text-stone-800">Rentabilidade dos Serviços (Período)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-100">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Total Recebido</span>
            <span className="text-lg font-bold text-emerald-600 block mt-1">R$ {totalRecebido.toFixed(2)}</span>
            <span className="text-[9px] text-stone-450 font-medium">Faturamento bruto</span>
          </div>

          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-100">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Gasto com Insumos</span>
            <span className="text-lg font-bold text-red-600 block mt-1">R$ {totalGastoInsumos.toFixed(2)}</span>
            <span className="text-[9px] text-stone-450 font-medium">Custos operacionais directos</span>
          </div>

          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-100">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Lucro Obtido</span>
            <span className="text-lg font-bold text-stone-900 block mt-1">R$ {lucroObtido.toFixed(2)}</span>
            <span className="text-[9px] text-stone-450 font-medium">Resultado líquido direto</span>
          </div>

          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-100">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Margem de Lucro</span>
            <span className="text-lg font-bold text-rose-600 block mt-1">{margemLucro.toFixed(1)}%</span>
            <span className="text-[9px] text-stone-450 font-medium">Eficiência de serviços</span>
          </div>
        </div>
      </div>

      {/* Main Ledger Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Despesas Ledger */}
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-serif font-semibold text-stone-900">Diário de Despesas</h3>
            <span className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100 font-bold">Total: R$ {totalDespesasFiltradas.toFixed(2)}</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-stone-500 text-xs">Carregando livro caixa...</div>
          ) : filteredDespesas.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-xs italic">Nenhuma despesa lançada no período selecionado.</div>
          ) : (
            <div className="divide-y divide-stone-100 overflow-y-auto max-h-[450px]">
              {filteredDespesas.map((des) => (
                <div key={des.id} className="p-4 flex items-start justify-between gap-4 hover:bg-stone-50/50 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-800">{des.descricao}</span>
                      <span className="bg-stone-100 text-stone-600 border border-stone-200 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full">
                        {des.categoria}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-stone-500 font-medium">
                      <span>Ref: <b>{new Date(des.data + "T12:00:00").toLocaleDateString("pt-BR")}</b></span>
                      <span>Pagto: <b>{des.forma_pagamento}</b></span>
                    </div>
                    {des.observacoes && (
                      <p className="text-[10px] text-stone-400 italic">Obs: {des.observacoes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-600 shrink-0">
                      - R$ {des.valor.toFixed(2)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleOpenForm(des)}
                        className="p-1 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded transition-all cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(des.id)}
                        className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-100 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Faturamentos Ledger */}
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-serif font-semibold text-stone-900">Diário de Receitas (Concluídos)</h3>
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100 font-bold">Total: R$ {totalReceitasFiltradas.toFixed(2)}</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-stone-500 text-xs">Carregando livro caixa...</div>
          ) : filteredRevenues.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-xs italic">Nenhum faturamento registrado no período selecionado.</div>
          ) : (
            <div className="divide-y divide-stone-100 overflow-y-auto max-h-[450px]">
              {filteredRevenues.map((rev) => (
                <div key={rev.id} className="p-4 flex items-start justify-between gap-4 hover:bg-stone-50/50 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-800">{formatClienteNome(rev.cliente?.nome)}</span>
                      <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full">
                        {getServicosNomes(rev)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-stone-500 font-medium">
                      <span>Ref: <b>{new Date(rev.data + "T12:00:00").toLocaleDateString("pt-BR")}</b></span>
                      <span>Pagto: <b>{rev.forma_pagamento}</b></span>
                    </div>
                    {rev.fiado && (
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-bold uppercase">FIADO RECEBIDO</span>
                    )}
                  </div>

                  <span className="text-sm font-bold text-emerald-600 shrink-0">
                    + R$ {rev.valor_recebido.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EXPENSE FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">{editId ? "Editar Despesa" : "Lançar Despesa"}</h2>
              <button onClick={handleCloseForm} className="p-1.5 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Categoria da Despesa *
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                >
                  {categories.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Descrição / Finalidade *</label>
                <input
                  type="text"
                  required
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="Ex: Conta de Luz de Junho"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Valor Pago *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                    placeholder="Ex: 185.50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Forma de Pagamento *</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                >
                  <option value="Pix">Pix</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Observações Adicionais
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                  placeholder="Se necessário, anote observações do comprovante ou fornecedor."
                />
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
                  {editId ? "Salvar Alterações" : "Salvar Lançamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
