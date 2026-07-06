/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { Atendimento, Despesa, Cliente, Servico } from "../types.js";
import { useAuth } from "../contexts/AuthContext.js";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Award, Download, Calendar, Filter, Sparkles, CheckCircle2
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);

  // Period filter state
  const [periodType, setPeriodType] = useState<"hoje" | "semana" | "mes" | "ano" | "personalizado">("mes");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // first of current month
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dataAt = await databaseService.getAtendimentos(user.id);
      const dataDe = await databaseService.getDespesas(user.id);
      const dataCl = await databaseService.getClientes(user.id);
      const dataSv = await databaseService.getServicos(user.id);

      setAtendimentos(dataAt);
      setDespesas(dataDe);
      setClientes(dataCl);
      setServicos(dataSv);
    } catch (err) {
      console.error("Erro ao carregar dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper date logic
  const isWithinPeriod = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const today = new Date();
    today.setHours(0,0,0,0);

    if (periodType === "hoje") {
      const dStr = d.toISOString().substring(0, 10);
      const tStr = today.toISOString().substring(0, 10);
      return dStr === tStr;
    }

    if (periodType === "semana") {
      const firstDayOfWeek = new Date(today);
      firstDayOfWeek.setDate(today.getDate() - today.getDay());
      const lastDayOfWeek = new Date(firstDayOfWeek);
      lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
      return d >= firstDayOfWeek && d <= lastDayOfWeek;
    }

    if (periodType === "mes") {
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }

    if (periodType === "ano") {
      return d.getFullYear() === today.getFullYear();
    }

    if (periodType === "personalizado") {
      return dateStr >= startDate && dateStr <= endDate;
    }

    return false;
  };

  // Filter items
  const activeAtendimentos = atendimentos.filter(at => isWithinPeriod(at.data));
  const activeDespesas = despesas.filter(de => isWithinPeriod(de.data));

  // Compute KPIs
  const totalReceitas = activeAtendimentos
    .filter(at => at.status === "Concluído" && at.pago)
    .reduce((acc, at) => acc + at.valor_recebido, 0);

  const totalDespesas = activeDespesas.reduce((acc, de) => acc + de.valor, 0);
  const lucroLiquido = totalReceitas - totalDespesas;

  const totalAtendimentosConcluidos = activeAtendimentos.filter(at => at.status === "Concluído").length;
  const totalAtendimentosReagendados = activeAtendimentos.filter(at => at.status === "Agendado").length;
  const totalAtendimentosCancelados = activeAtendimentos.filter(at => at.status === "Cancelado").length;

  // Chart Data 1: Revenue vs. Expenses Comparison (by category/group)
  const getRevenuesVsExpensesChartData = () => {
    // Group values by date
    const groups: { [key: string]: { receitas: number; despesas: number } } = {};
    
    activeAtendimentos.forEach(at => {
      if (at.status === "Concluído" && at.pago) {
        const key = at.data;
        if (!groups[key]) groups[key] = { receitas: 0, despesas: 0 };
        groups[key].receitas += at.valor_recebido;
      }
    });

    activeDespesas.forEach(de => {
      const key = de.data;
      if (!groups[key]) groups[key] = { receitas: 0, despesas: 0 };
      groups[key].despesas += de.valor;
    });

    return Object.keys(groups)
      .sort()
      .map(key => {
        const d = new Date(key + "T12:00:00");
        return {
          name: d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
          Receitas: parseFloat(groups[key].receitas.toFixed(2)),
          Despesas: parseFloat(groups[key].despesas.toFixed(2))
        };
      })
      .slice(-10); // show last 10 days of activities
  };

  // Chart Data 2: Appointments status distribution
  const statusData = [
    { name: "Concluídos", value: totalAtendimentosConcluidos, color: "#10b981" },
    { name: "Agendados", value: totalAtendimentosReagendados, color: "#f59e0b" },
    { name: "Cancelados", value: totalAtendimentosCancelados, color: "#ef4444" }
  ].filter(s => s.value > 0);

  // Chart Data 3: Top services demand
  const getTopServicesData = () => {
    const counts: { [key: string]: number } = {};
    activeAtendimentos.forEach(at => {
      const srvName = at.servico?.nome || "Personalizado";
      counts[srvName] = (counts[srvName] || 0) + 1;
    });

    return Object.keys(counts)
      .map(name => ({ name, quantidade: counts[name] }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  };

  // EXPORT PDF REPORT USING jsPDF
  const handleExportPDF = () => {
    if (!user) return;
    const doc = new jsPDF();
    const primaryColor: [number, number, number] = [225, 29, 72]; // rose-600
    const darkColor: [number, number, number] = [28, 25, 23]; // stone-900

    // Title / Header
    doc.setFillColor(28, 25, 23);
    doc.rect(0, 0, 210, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("ATELIÊ DE SOBRANCELHAS", 15, 20);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Profissional: ${user.nome}  |  Email: ${user.email}`, 15, 28);
    doc.text(`Relatório Financeiro: Período ${periodType.toUpperCase()}`, 15, 34);

    // Summary Cards block
    doc.setTextColor(28, 25, 23);
    doc.setFontSize(12);
    doc.setFont("Helvetica", "bold");
    doc.text("RESUMO FINANCEIRO DO PERÍODO", 15, 55);

    autoTable(doc, {
      startY: 60,
      head: [["Métrica", "Valor Total (R$)"]],
      body: [
        ["Total de Receitas (Atendimentos Recebidos)", `R$ ${totalReceitas.toFixed(2)}`],
        ["Total de Despesas (Lançamentos de Custos)", `R$ ${totalDespesas.toFixed(2)}`],
        ["Resultado Líquido (Lucro do Período)", `R$ ${lucroLiquido.toFixed(2)}`],
        ["Quantidade de Atendimentos Realizados", `${totalAtendimentosConcluidos}`]
      ],
      theme: "grid",
      headStyles: { fillColor: primaryColor },
      styles: { fontSize: 10 }
    });

    // Despesas Table list
    doc.setFont("Helvetica", "bold");
    doc.text("DEMONSTRATIVO DETALHADO DE DESPESAS", 15, (doc as any).lastAutoTable.finalY + 15);

    const despesasRows = activeDespesas.map(d => [
      new Date(d.data).toLocaleDateString("pt-BR"),
      d.categoria,
      d.descricao,
      d.forma_pagamento,
      `R$ ${d.valor.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Data", "Categoria", "Descrição", "Forma Pagto", "Valor (R$)"]],
      body: despesasRows.length > 0 ? despesasRows : [["-", "Sem despesas registradas", "-", "-", "R$ 0.00"]],
      theme: "striped",
      headStyles: { fillColor: darkColor },
      styles: { fontSize: 9 }
    });

    // Receitas Table List
    doc.setFont("Helvetica", "bold");
    doc.text("DEMONSTRATIVO DETALHADO DE RECEITAS (ATENDIMENTOS)", 15, (doc as any).lastAutoTable.finalY + 15);

    const receitasRows = activeAtendimentos
      .filter(at => at.status === "Concluído" && at.pago)
      .map(at => [
        new Date(at.data).toLocaleDateString("pt-BR"),
        at.cliente?.nome || "Cliente Avulso",
        at.servico?.nome || "Serviço",
        at.forma_pagamento || "Pix",
        `R$ ${at.valor_recebido.toFixed(2)}`
      ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Data", "Cliente", "Procedimento", "Forma Pagto", "Valor Recebido (R$)"]],
      body: receitasRows.length > 0 ? receitasRows : [["-", "Sem receitas registradas", "-", "-", "R$ 0.00"]],
      theme: "striped",
      headStyles: { fillColor: darkColor },
      styles: { fontSize: 9 }
    });

    // Save
    doc.save(`financeiro_clinica_${periodType}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Visão Geral - PKM Embelezamento
            </span>
          </div>
          <h1 className="font-serif text-3xl font-medium text-stone-900 mt-1">Olá, {user?.nome || "Profissional"}</h1>
          <p className="text-sm text-stone-500 mt-0.5">Veja a saúde financeira e o desempenho da sua clínica estética.</p>
        </div>

        {/* Period selection widgets */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 border border-stone-200/50 rounded-xl shadow-sm">
          {[
            { id: "hoje", label: "Hoje" },
            { id: "semana", label: "Semana" },
            { id: "mes", label: "Mês" },
            { id: "ano", label: "Ano" },
            { id: "personalizado", label: "Período" }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriodType(item.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${periodType === item.id ? 'bg-rose-600 text-white shadow-md' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Period picker conditional fields */}
      {periodType === "personalizado" && (
        <div className="bg-white p-4 rounded-xl border border-stone-200/60 shadow-sm flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> De:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Até:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
            />
          </div>
          <button
            onClick={loadData}
            className="px-3.5 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-colors"
          >
            Filtrar
          </button>
        </div>
      )}

      {/* Primary KPI Metrics row */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Calculando métricas financeiras...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* KPI 1 */}
            <div className="bg-white rounded-2xl border border-stone-200/60 p-5 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Receitas Brutas</span>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">R$ {totalReceitas.toFixed(2)}</h3>
                <p className="text-[10px] text-stone-400 mt-1 font-semibold">{totalAtendimentosConcluidos} procedimentos pagos</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white rounded-2xl border border-stone-200/60 p-5 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Despesas Totais</span>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">R$ {totalDespesas.toFixed(2)}</h3>
                <p className="text-[10px] text-stone-400 mt-1 font-semibold">{activeDespesas.length} despesas lançadas</p>
              </div>
              <div className="p-3 bg-stone-100 text-stone-600 rounded-xl border border-stone-200">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white rounded-2xl border border-stone-200/60 p-5 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Lucro Líquido</span>
                <h3 className={`text-2xl font-bold mt-1 ${lucroLiquido >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  R$ {lucroLiquido.toFixed(2)}
                </h3>
                <p className="text-[10px] text-stone-400 mt-1 font-semibold">Saldo financeiro final</p>
              </div>
              <div className={`p-3 rounded-xl border ${lucroLiquido >= 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}>
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white rounded-2xl border border-stone-200/60 p-5 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Clientes Atendidos</span>
                <h3 className="text-2xl font-bold text-stone-900 mt-1">{totalAtendimentosConcluidos}</h3>
                <p className="text-[10px] text-stone-400 mt-1 font-semibold">Total de {clientes.length} na carteira</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Business intelligence charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Revenue x Expenses */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-semibold text-stone-900">Histórico de Fluxo de Caixa</h3>
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">últimos dias ativos</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getRevenuesVsExpensesChartData()}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Receitas" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="#a8a29e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Status breakdown donut */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-semibold text-stone-900">Status dos Horários</h3>
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Distribuição</span>
              </div>
              
              {statusData.length === 0 ? (
                <p className="text-xs text-stone-400 italic text-center py-12">Sem dados de atendimentos no período.</p>
              ) : (
                <div className="h-44 flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  <div className="absolute text-center space-y-0.5">
                    <span className="text-xs text-stone-400 uppercase font-bold">Total</span>
                    <p className="text-xl font-extrabold text-stone-800">
                      {statusData.reduce((acc, s) => acc + s.value, 0)}
                    </p>
                  </div>
                </div>
              )}

              {/* Status color keys */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold border-t border-stone-50 pt-3">
                <div className="text-emerald-600">
                  <span>Concluídos</span>
                  <p className="text-base text-stone-800 font-bold">{totalAtendimentosConcluidos}</p>
                </div>
                <div className="text-amber-600">
                  <span>Agendados</span>
                  <p className="text-base text-stone-800 font-bold">{totalAtendimentosReagendados}</p>
                </div>
                <div className="text-red-500">
                  <span>Cancelados</span>
                  <p className="text-base text-stone-800 font-bold">{totalAtendimentosCancelados}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 3: Top services horizontal bars */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
              <h3 className="font-serif font-semibold text-stone-900">Procedimentos Mais Solicitados</h3>
              {getTopServicesData().length === 0 ? (
                <p className="text-xs text-stone-400 italic text-center py-12">Sem procedimentos agendados no período.</p>
              ) : (
                <div className="space-y-3.5">
                  {getTopServicesData().map((item, idx) => {
                    const maxQty = Math.max(...getTopServicesData().map(i => i.quantidade));
                    const percentage = (item.quantidade / maxQty) * 100;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-stone-800">{item.name}</span>
                          <span className="text-stone-500">{item.quantidade} atendimentos</span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2">
                          <div 
                            className="bg-rose-600 h-2 rounded-full transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions & PDF Exports Panel */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <h3 className="font-serif font-semibold text-stone-900 flex items-center gap-1.5">
                  <Award className="w-5 h-5 text-rose-600" /> Relatórios PDF
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Gere e exporte relatórios financeiros completos de contabilidade, contendo as receitas de atendimentos concluídos de forma detalhada e as despesas corporativas lançadas.
                </p>
              </div>

              <div className="space-y-2.5 pt-4">
                <button
                  onClick={handleExportPDF}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" /> Exportar Demonstrativo PDF
                </button>
                <button
                  onClick={() => window.print()}
                  className="w-full py-2 bg-stone-100 border border-stone-200 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Calendar className="w-4 h-4 text-stone-500" /> Imprimir Visão de Tela
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
