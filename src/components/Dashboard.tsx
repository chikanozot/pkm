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
  TrendingUp, TrendingDown, DollarSign, Users, Award, Download, Calendar, Filter, Sparkles, CheckCircle2,
  Clock, AlertTriangle, Check, X, AlertCircle, ArrowRight, User, Briefcase
} from "lucide-react";

export const Dashboard: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);

  const getServicosNomes = (at: Atendimento) => {
    if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
      return at.servicos_detalhes.map(s => s.nome).join(", ");
    }
    return at.servico?.nome || "Serviço Personalizado";
  };
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Live time state
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Modal states
  const [selectedAptDetails, setSelectedAptDetails] = useState<Atendimento | null>(null);

  const [finalizeApt, setFinalizeApt] = useState<Atendimento | null>(null);
  const [finalizeValorCobrado, setFinalizeValorCobrado] = useState(0);
  const [finalizeFormaPagamento, setFinalizeFormaPagamento] = useState("Pix");
  const [finalizeDesconto, setFinalizeDesconto] = useState(0);
  const [finalizeAcrescimos, setFinalizeAcrescimos] = useState(0);

  const [rescheduleApt, setRescheduleApt] = useState<Atendimento | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");

  const [cancelApt, setCancelApt] = useState<Atendimento | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    loadData();
    if (user) {
      const syncCalendar = async () => {
        try {
          const res = await fetch("/api/calendar/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && (data.imported > 0 || data.updated > 0 || data.cancelled > 0)) {
              console.log(`[Google Sync] Importados: ${data.imported}, Atualizados: ${data.updated}, Cancelados: ${data.cancelled}`);
              const dataAt = await databaseService.getAtendimentos(user.id, user.role);
              setAtendimentos(dataAt);
            }
          }
        } catch (e) {
          console.error("Erro na sincronização automática do Google Calendar:", e);
        }
      };
      syncCalendar();
    }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dataAt = await databaseService.getAtendimentos(user.id, user.role);
      const dataDe = await databaseService.getDespesas(user.id, user.role);
      const dataCl = await databaseService.getClientes(user.id);
      const dataSv = await databaseService.getServicos(user.id);

      // Load system users if user is master for multi-professional mapping
      let usersList: any[] = [];
      if (user.role === "master") {
        try {
          usersList = await databaseService.getSystemUsers();
        } catch (e) {
          console.error("Erro ao carregar usuários do sistema", e);
        }
      }

      setAtendimentos(dataAt);
      setDespesas(dataDe);
      setClientes(dataCl);
      setServicos(dataSv);
      setSystemUsers(usersList);
    } catch (err) {
      console.error("Erro ao carregar dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  const formatClienteNome = (nome?: string) => {
    if (!nome) return "Cliente Avulso";
    return nome.replace(/^\[EXCLUÍDO\]\s*/i, "");
  };

  // Helper date logic
  const parseLocal = (dateStr: string, timeStr?: string) => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = (timeStr || "12:00").split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes || 0, 0);
  };

  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const isAppointmentDelayed = (at: Atendimento) => {
    const now = new Date();
    const start = parseLocal(at.data, at.hora);
    const end = new Date(start.getTime() + (at.duracao || 30) * 60 * 1000);
    return now.getTime() > end.getTime();
  };

  const getRelativeTimeString = (dateStr: string, timeStr: string) => {
    const aptDate = parseLocal(dateStr, timeStr);
    const now = new Date();
    const diffMs = aptDate.getTime() - now.getTime();
    
    if (diffMs < 0) {
      return "Já iniciado";
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    const isToday = now.toDateString() === aptDate.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = tomorrow.toDateString() === aptDate.toDateString();

    if (isToday) {
      if (diffMinutes < 60) {
        return `em ${diffMinutes} ${diffMinutes === 1 ? "minuto" : "minutos"}`;
      }
      return `em ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
    } else if (isTomorrow) {
      return `amanhã às ${timeStr}`;
    } else {
      const dOptions: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${aptDate.toLocaleDateString("pt-BR", dOptions)} às ${timeStr}`;
    }
  };

  const getUpcomingAppointments = () => {
    const now = new Date();
    return atendimentos
      .filter(at => {
        if (at.status !== "Agendado") return false;
        const aptDate = parseLocal(at.data, at.hora);
        return aptDate.getTime() > now.getTime();
      })
      .sort((a, b) => {
        const dateA = parseLocal(a.data, a.hora);
        const dateB = parseLocal(b.data, b.hora);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 3);
  };

  const getPastAppointments = () => {
    return atendimentos
      .filter(at => at.status === "Concluído")
      .sort((a, b) => {
        const dateA = parseLocal(a.data, a.hora);
        const dateB = parseLocal(b.data, b.hora);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);
  };

  const getIncompleteOrActiveAppointments = () => {
    const now = new Date();
    return atendimentos
      .filter(at => {
        if (at.status !== "Agendado") return false;
        const aptDate = parseLocal(at.data, at.hora);
        return aptDate.getTime() <= now.getTime();
      })
      .sort((a, b) => {
        const dateA = parseLocal(a.data, a.hora);
        const dateB = parseLocal(b.data, b.hora);
        return dateA.getTime() - dateB.getTime();
      });
  };

  const getProfessionalName = (userId: string) => {
    if (userId === user?.id) return user.nome;
    const found = systemUsers.find(u => u.id === userId);
    return found ? found.nome : "Profissional";
  };

  // Quick action modal handlers
  const handleOpenFinalize = (at: Atendimento) => {
    setFinalizeApt(at);
    
    const hasMultiple = at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0;
    const totalServicosValor = hasMultiple
      ? at.servicos_detalhes!.reduce((sum, s) => sum + Number(s.valor || 0), 0)
      : (at.servico?.valor || 0);

    setFinalizeValorCobrado(at.valor_cobrado || totalServicosValor);
    setFinalizeFormaPagamento(at.forma_pagamento || "Pix");
    setFinalizeDesconto(0);
    setFinalizeAcrescimos(0);
  };

  const handleConfirmFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !finalizeApt) return;

    try {
      const valorRecebido = finalizeValorCobrado - finalizeDesconto + finalizeAcrescimos;
      
      const hasMultiple = finalizeApt.servicos_detalhes && Array.isArray(finalizeApt.servicos_detalhes) && finalizeApt.servicos_detalhes.length > 0;
      const totalServicosCusto = hasMultiple
        ? finalizeApt.servicos_detalhes!.reduce((sum, s) => sum + Number(s.custo || 0), 0)
        : (finalizeApt.servico?.custo || 0);

      const totalServicosProdutos = hasMultiple
        ? finalizeApt.servicos_detalhes!.reduce((acc, s) => {
            const orig = servicos.find(origS => origS.id === s.servico_id);
            if (orig && orig.produtos) {
              orig.produtos.forEach(p => {
                if (!acc.includes(p)) acc.push(p);
              });
            }
            return acc;
          }, [] as string[])
        : (finalizeApt.servico?.produtos || []);

      const custo = finalizeApt.custo || totalServicosCusto;
      const lucroLiquido = valorRecebido - custo;
      const produtos = finalizeApt.produtos_utilizados && finalizeApt.produtos_utilizados.length > 0
        ? finalizeApt.produtos_utilizados
        : totalServicosProdutos;

      await databaseService.updateAtendimento(finalizeApt.id, {
        status: "Concluído",
        pago: true,
        valor_cobrado: finalizeValorCobrado,
        valor_recebido: valorRecebido,
        desconto: finalizeDesconto,
        acrescimos: finalizeAcrescimos,
        forma_pagamento: finalizeFormaPagamento,
        data_pagamento: getTodayDateStr(),
        custo: custo,
        produtos_utilizados: produtos,
        lucro_liquido: lucroLiquido
      }, user.id);

      setFinalizeApt(null);
      await loadData();
    } catch (err) {
      console.error("Erro ao finalizar atendimento:", err);
    }
  };

  const handleOpenReschedule = (at: Atendimento) => {
    setRescheduleApt(at);
    setRescheduleDate(at.data);
    setRescheduleTime(at.hora);
    setRescheduleNotes(at.observacoes || "");
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !rescheduleApt) return;

    try {
      const dateFormatted = new Date().toLocaleDateString("pt-BR");
      const timeFormatted = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const historyLog = `\n[Histórico: Reagendado em ${dateFormatted} às ${timeFormatted} de ${rescheduleApt.data} ${rescheduleApt.hora} para ${rescheduleDate} ${rescheduleTime}]`;
      const finalNotes = rescheduleNotes + historyLog;

      await databaseService.updateAtendimento(rescheduleApt.id, {
        data: rescheduleDate,
        hora: rescheduleTime,
        observacoes: finalNotes
      }, user.id);

      setRescheduleApt(null);
      await loadData();
    } catch (err) {
      console.error("Erro ao reagendar:", err);
    }
  };

  const handleOpenCancel = (at: Atendimento) => {
    setCancelApt(at);
    setCancelReason("");
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cancelApt) return;

    try {
      const dateFormatted = new Date().toLocaleDateString("pt-BR");
      const historyLog = `\n[Histórico: Cancelado em ${dateFormatted}. Motivo: ${cancelReason || "Não informado"}]`;
      const finalNotes = (cancelApt.observacoes || "") + historyLog;

      await databaseService.updateAtendimento(cancelApt.id, {
        status: "Cancelado",
        observacoes: finalNotes
      }, user.id);

      setCancelApt(null);
      await loadData();
    } catch (err) {
      console.error("Erro ao cancelar atendimento:", err);
    }
  };

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
      if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
        at.servicos_detalhes.forEach(s => {
          counts[s.nome] = (counts[s.nome] || 0) + 1;
        });
      } else {
        const srvName = at.servico?.nome || "Personalizado";
        counts[srvName] = (counts[srvName] || 0) + 1;
      }
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
      new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR"),
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
        new Date(at.data + "T12:00:00").toLocaleDateString("pt-BR"),
        formatClienteNome(at.cliente?.nome),
        getServicosNomes(at),
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

  // Calculate quick daily statistics
  const todayStr = getTodayDateStr();
  const todayApts = atendimentos.filter(at => at.data === todayStr);
  const totalToday = todayApts.length;
  const completedToday = todayApts.filter(at => at.status === "Concluído").length;
  const pendingTotal = atendimentos.filter(at => at.status === "Agendado").length;
  
  const upcomingApts = getUpcomingAppointments();
  const pastApts = getPastAppointments();
  const incompleteApts = getIncompleteOrActiveAppointments();

  const nextAptStr = upcomingApts.length > 0 
    ? `${formatClienteNome(upcomingApts[0].cliente?.nome)} - ${upcomingApts[0].hora}`
    : "Nenhum";

  const revenueToday = todayApts
    .filter(at => at.status === "Concluído")
    .reduce((acc, at) => acc + (at.valor_recebido || 0), 0);

  const profitToday = todayApts
    .filter(at => at.status === "Concluído")
    .reduce((acc, at) => acc + (at.lucro_liquido || 0), 0);

  const uniqueClientsToday = new Set(
    todayApts
      .filter(at => at.status === "Concluído")
      .map(at => at.cliente_id)
  ).size;

  const formattedDate = currentTime.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = currentTime.toLocaleTimeString("pt-BR");

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Visão Geral - LUMORA Flow
            </span>
          </div>
          <h1 className="font-serif text-3xl font-medium text-stone-900 mt-1">Olá, {user?.nome || "Profissional"}</h1>
          <p className="text-sm text-stone-500 mt-0.5">Veja a saúde financeira e o desempenho da sua clínica estética.</p>
        </div>

        {/* Actions & Clock */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Standout "+ Novo Agendamento" Button */}
          <button
            onClick={() => {
              if (onNavigate) {
                onNavigate("agenda");
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("pkm-open-new-appointment"));
                }, 150);
              }
            }}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Calendar className="w-4 h-4" />
            + Novo Agendamento
          </button>

          {/* Live Clock Card */}
          <div className="bg-stone-900 text-stone-100 px-5 py-3 rounded-2xl border border-stone-800 shadow-sm flex items-center justify-between gap-6 min-w-[280px]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-stone-800 rounded-xl text-rose-500">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-stone-400">Rotina em Tempo Real</p>
              <h4 className="font-serif text-xs font-semibold text-white capitalize">
                {formattedDate}
              </h4>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-lg font-bold tracking-tight text-rose-400">
              {formattedTime}
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* Indicadores Rápidos do Dia */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xs font-bold uppercase text-stone-400 tracking-wider">Atividade Operacional de Hoje</h3>
          <span className="text-[10px] font-semibold text-stone-500 font-mono">Data: {new Date().toLocaleDateString("pt-BR")}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Atendimentos</span>
            <span className="text-lg font-bold text-stone-800 block mt-1">{totalToday}</span>
            <span className="text-[8px] text-stone-400 font-medium">Agendados hoje</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Concluídos</span>
            <span className="text-lg font-bold text-emerald-600 block mt-1">{completedToday}</span>
            <span className="text-[8px] text-stone-400 font-medium">Finalizados hoje</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Fila Pendente</span>
            <span className="text-lg font-bold text-amber-600 block mt-1">{pendingTotal}</span>
            <span className="text-[8px] text-stone-400 font-medium">Total pendentes</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between lg:col-span-1">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Próximo Cliente</span>
            <span className="text-xs font-bold text-stone-800 block mt-1 truncate" title={nextAptStr}>{nextAptStr}</span>
            <span className="text-[8px] text-stone-400 font-medium">Fila de espera</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Receita de Hoje</span>
            <span className="text-lg font-bold text-rose-600 block mt-1">R$ {revenueToday.toFixed(0)}</span>
            <span className="text-[8px] text-stone-400 font-medium">Faturamento bruto</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Lucro Estimado</span>
            <span className={`text-lg font-bold block mt-1 ${profitToday >= 0 ? "text-emerald-600" : "text-red-500"}`}>R$ {profitToday.toFixed(0)}</span>
            <span className="text-[8px] text-stone-400 font-medium">Líquido do dia</span>
          </div>
          <div className="bg-stone-50/55 p-3 rounded-xl border border-stone-100 flex flex-col justify-between">
            <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider block">Clientes Únicos</span>
            <span className="text-lg font-bold text-blue-600 block mt-1">{uniqueClientsToday}</span>
            <span className="text-[8px] text-stone-400 font-medium">Atendidos hoje</span>
          </div>
        </div>
      </div>

      {/* ATENDIMENTOS EM ANDAMENTO OU PENDENTES DE CONCLUSÃO (PRIORIDADE MÁXIMA) */}
      {incompleteApts.length > 0 && (
        <div className="space-y-3 bg-stone-50 p-5 rounded-2xl border border-rose-200/60 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <h2 className="font-serif text-lg font-bold text-stone-900">
              Atendimento em Andamento ({incompleteApts.length})
            </h2>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">Esses horários já começaram e aguardam encerramento definitivo.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {incompleteApts.map((at) => {
              const isDelayed = isAppointmentDelayed(at);
              return (
                <div 
                  key={at.id}
                  className={`rounded-2xl border p-4.5 shadow-sm transition-all duration-300 flex flex-col justify-between ${
                    isDelayed 
                      ? "bg-rose-50/50 border-rose-200 text-rose-950 shadow-rose-100/30 animate-pulse-subtle" 
                      : "bg-white border-stone-200/60 text-stone-900"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        {isDelayed && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full mb-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Horário Pendente
                          </span>
                        )}
                        <h3 className="font-serif text-base font-bold leading-tight">
                          {formatClienteNome(at.cliente?.nome)}
                        </h3>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-mono">
                        {at.hora}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-stone-400 block font-bold uppercase text-[8px]">Procedimento</span>
                        <span className="font-semibold">{getServicosNomes(at)}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block font-bold uppercase text-[8px]">Valor Previsto</span>
                        <span className="font-semibold text-rose-600">R$ {(at.valor_cobrado || at.servico?.valor || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {at.observacoes && (
                      <div className="bg-stone-50/80 p-2 rounded-lg border border-stone-100 text-[11px] text-stone-600 max-h-16 overflow-y-auto">
                        <span className="font-semibold block text-[8px] text-stone-400 uppercase tracking-wider mb-0.5">Observações</span>
                        {at.observacoes}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mt-4 pt-3.5 border-t border-stone-100">
                    <button
                      onClick={() => handleOpenFinalize(at)}
                      className="py-1.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-sm"
                    >
                      <Check className="w-3 h-3" /> Concluir
                    </button>
                    <button
                      onClick={() => handleOpenReschedule(at)}
                      className="py-1.5 px-1 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-xl text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Calendar className="w-3 h-3" /> Reagendar
                    </button>
                    <button
                      onClick={() => handleOpenCancel(at)}
                      className="py-1.5 px-1 bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold rounded-xl text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancelar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SEÇÃO OPERACIONAL: PRÓXIMOS E ÚLTIMOS AGENDAMENTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Próximos Agendamentos */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-semibold text-stone-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-600" /> Próximos Agendamentos
            </h3>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Cronograma</span>
          </div>

          {upcomingApts.length === 0 ? (
            <div className="text-center py-8 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
              <p className="text-xs text-stone-400 italic">Nenhum próximo agendamento planejado para o momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingApts.map((at) => (
                <div 
                  key={at.id}
                  onClick={() => setSelectedAptDetails(at)}
                  className="p-3 rounded-xl border border-stone-100 hover:border-rose-100 hover:bg-rose-50/10 cursor-pointer transition-all flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[50px] p-2 bg-stone-50 rounded-lg border border-stone-100 font-mono text-stone-800">
                        <span className="text-xs font-bold block">{at.hora}</span>
                        <span className="text-[8px] font-semibold text-stone-400 uppercase">Tempo</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-850 truncate max-w-[150px]">{formatClienteNome(at.cliente?.nome)}</h4>
                        <p className="text-[10px] text-stone-450 mt-0.5 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-rose-500/70" /> {getServicosNomes(at)}
                        </p>
                        <p className="text-[9px] text-stone-400 mt-0.5">
                          Profissional: {getProfessionalName(at.user_id)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex flex-col justify-center items-end">
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                        {getRelativeTimeString(at.data, at.hora)}
                      </span>
                      <span className="text-[8px] text-stone-400 font-mono mt-1 flex items-center gap-0.5">
                        Ver detalhes <ArrowRight className="w-2 h-2" />
                      </span>
                    </div>
                  </div>

                  {/* QUICK ACTIONS BAR */}
                  <div className="flex gap-1.5 pt-2 border-t border-stone-50">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFinalizeApt(at);
                        setFinalizeValorCobrado(at.valor_cobrado || (at.servico?.valor || 0));
                        setFinalizeDesconto(at.desconto || 0);
                        setFinalizeAcrescimos(at.acrescimos || 0);
                        setFinalizeFormaPagamento(at.forma_pagamento || "Pix");
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-1 rounded-lg border border-emerald-100 transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Concluir
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenReschedule(at);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-stone-700 bg-stone-50 hover:bg-stone-100 px-2 py-1 rounded-lg border border-stone-250 transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3 h-3" /> Reagendar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCancel(at);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100/80 px-2 py-1 rounded-lg border border-red-100 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card: Últimos Atendimentos */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-semibold text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Últimos Atendimentos
            </h3>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Histórico Recente</span>
          </div>

          {pastApts.length === 0 ? (
            <div className="text-center py-8 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
              <p className="text-xs text-stone-400 italic">Sem atendimentos recentes registrados no sistema.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastApts.map((at) => (
                <div 
                  key={at.id}
                  onClick={() => setSelectedAptDetails(at)}
                  className="flex items-center justify-between p-3 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50/40 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[50px] p-2 bg-stone-50 rounded-lg border border-stone-100 font-mono">
                      <span className="text-[10px] font-bold text-stone-600 block">{parseLocal(at.data).toLocaleDateString("pt-BR", {day:"2-digit", month:"2-digit"})}</span>
                      <span className="text-[8px] text-stone-400 block mt-0.5">{at.hora}</span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-stone-850 truncate max-w-[150px]">{formatClienteNome(at.cliente?.nome)}</h4>
                      <p className="text-[10px] text-stone-450 mt-0.5 flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-stone-450" /> {getServicosNomes(at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      at.status === "Concluído" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                      "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {at.status}
                    </span>
                    {at.status === "Concluído" && at.valor_recebido > 0 && (
                      <p className="text-xs font-bold text-stone-800 font-mono mt-1">R$ {at.valor_recebido.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MAIN ledger indicators and reports (PRESERVED ACCORDING TO SPECIFICATION) */}
      <div className="border-t border-stone-200/50 pt-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-medium text-stone-900">Análise e Indicadores Financeiros</h2>
            <p className="text-xs text-stone-500 mt-0.5">Selecione o período desejado para filtrar os gráficos e relatórios.</p>
          </div>

          {/* Period selection widgets */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 border border-stone-200/50 rounded-xl shadow-sm">
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

      {/* ==========================================
          MODALS SECTION
          ========================================== */}
      
      {/* 1. Appointment Details Modal */}
      {selectedAptDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Detalhes do Agendamento</span>
                <h3 className="font-serif text-lg font-semibold mt-0.5">{formatClienteNome(selectedAptDetails.cliente?.nome)}</h3>
              </div>
              <button 
                onClick={() => setSelectedAptDetails(null)} 
                className="text-stone-400 hover:text-white transition-colors p-1 hover:bg-stone-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Procedimento</span>
                  <span className="text-sm font-semibold text-stone-800">{getServicosNomes(selectedAptDetails)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Profissional</span>
                  <span className="text-sm font-semibold text-stone-800 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-rose-500" /> {getProfessionalName(selectedAptDetails.user_id)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Data</span>
                  <span className="text-sm font-semibold text-stone-800 font-mono">
                    {new Date(selectedAptDetails.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Horário</span>
                  <span className="text-sm font-semibold text-stone-800 font-mono">{selectedAptDetails.hora} ({selectedAptDetails.duracao} min)</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Status</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                    selectedAptDetails.status === "Concluído" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                    selectedAptDetails.status === "Cancelado" ? "bg-rose-50 text-rose-700 border border-rose-100" :
                    "bg-amber-50 text-amber-700 border border-amber-100"
                  }`}>
                    {selectedAptDetails.status}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Valor Cobrado</span>
                  <span className="text-sm font-semibold text-stone-800">R$ {selectedAptDetails.valor_cobrado.toFixed(2)}</span>
                </div>
              </div>

              {selectedAptDetails.status === "Concluído" && (
                <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50 space-y-1.5 text-xs">
                  <h4 className="font-semibold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Resumo Financeiro
                  </h4>
                  <div className="grid grid-cols-2 gap-y-1 text-stone-600">
                    <span>Forma de Pagto:</span>
                    <span className="font-semibold text-stone-800 text-right">{selectedAptDetails.forma_pagamento || "Pix"}</span>
                    <span>Valor Recebido:</span>
                    <span className="font-semibold text-stone-800 text-right">R$ {selectedAptDetails.valor_recebido.toFixed(2)}</span>
                    <span>Desconto / Acréscimo:</span>
                    <span className="font-semibold text-stone-800 text-right">R$ -{selectedAptDetails.desconto.toFixed(2)} / +{selectedAptDetails.acrescimos.toFixed(2)}</span>
                    <span>Custo dos Insumos:</span>
                    <span className="font-semibold text-stone-800 text-right text-red-600 font-mono">R$ {selectedAptDetails.custo.toFixed(2)}</span>
                    <span className="font-bold text-emerald-800">Lucro Líquido:</span>
                    <span className="font-bold text-emerald-800 text-right font-mono">R$ {selectedAptDetails.lucro_liquido.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {selectedAptDetails.observacoes && (
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/50 text-xs text-stone-600">
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Observações e Histórico</span>
                  <p className="whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">{selectedAptDetails.observacoes}</p>
                </div>
              )}
            </div>

            <div className="p-5 bg-stone-50 border-t border-stone-100 flex justify-end">
              <button 
                onClick={() => setSelectedAptDetails(null)} 
                className="px-4 py-2 bg-stone-950 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Finalize Quick Action Modal */}
      {finalizeApt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleConfirmFinalize} className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-600 text-white p-5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Encerramento de Horário</span>
                <h3 className="font-serif text-lg font-semibold mt-0.5">Finalizar Atendimento</h3>
              </div>
              <button 
                type="button"
                onClick={() => setFinalizeApt(null)} 
                className="text-emerald-200 hover:text-white transition-colors p-1 hover:bg-emerald-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-150 text-xs text-stone-600">
                <p><strong>Cliente:</strong> {formatClienteNome(finalizeApt.cliente?.nome)}</p>
                <p className="mt-1"><strong>Procedimento:</strong> {getServicosNomes(finalizeApt)} (Custo Insumo: R$ {(finalizeApt.custo || 0).toFixed(2)})</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                    Valor Cobrado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={finalizeValorCobrado || ""}
                    onChange={(e) => setFinalizeValorCobrado(parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                      Desconto (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={finalizeDesconto || ""}
                      onChange={(e) => setFinalizeDesconto(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                      Acréscimos (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={finalizeAcrescimos || ""}
                      onChange={(e) => setFinalizeAcrescimos(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={finalizeFormaPagamento}
                    onChange={(e) => setFinalizeFormaPagamento(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Fiado">Fiado</option>
                  </select>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-xs font-semibold text-emerald-800 flex justify-between items-center">
                  <span>Total Líquido Estimado:</span>
                  <span className="text-sm font-bold font-mono text-emerald-700">
                    R$ {(finalizeValorCobrado - finalizeDesconto + finalizeAcrescimos - (finalizeApt.custo || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-stone-50 border-t border-stone-100 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => setFinalizeApt(null)} 
                className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Concluir e Lançar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Reschedule Quick Action Modal */}
      {rescheduleApt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleConfirmReschedule} className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white p-5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Reagendamento de Cliente</span>
                <h3 className="font-serif text-lg font-semibold mt-0.5">Definir Novo Horário</h3>
              </div>
              <button 
                type="button"
                onClick={() => setRescheduleApt(null)} 
                className="text-stone-400 hover:text-white transition-colors p-1 hover:bg-stone-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-150 text-xs text-stone-650">
                <p><strong>Cliente:</strong> {formatClienteNome(rescheduleApt.cliente?.nome)}</p>
                <p className="mt-1"><strong>Procedimento:</strong> {getServicosNomes(rescheduleApt)}</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                      Nova Data
                    </label>
                    <input
                      type="date"
                      required
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                      Novo Horário
                    </label>
                    <input
                      type="time"
                      required
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                    Observações / Motivo do Reagendamento
                  </label>
                  <textarea
                    value={rescheduleNotes}
                    onChange={(e) => setRescheduleNotes(e.target.value)}
                    rows={3}
                    placeholder="Adicione um motivo para o reagendamento..."
                    className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 bg-stone-50 border-t border-stone-100 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => setRescheduleApt(null)} 
                className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" /> Reagendar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Cancel Quick Action Modal */}
      {cancelApt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleConfirmCancel} className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 text-white p-5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-200">Cancelamento de Horário</span>
                <h3 className="font-serif text-lg font-semibold mt-0.5">Cancelar Atendimento</h3>
              </div>
              <button 
                type="button"
                onClick={() => setCancelApt(null)} 
                className="text-rose-200 hover:text-white transition-colors p-1 hover:bg-rose-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100 text-xs text-rose-900">
                <p><strong>Atenção:</strong> Isso alterará o status do atendimento para <strong>Cancelado</strong>. Ele deixará de aparecer na lista de agendamentos pendentes ou em andamento.</p>
                <p className="mt-2 font-semibold">Cliente: {formatClienteNome(cancelApt.cliente?.nome)}</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">
                  Motivo do Cancelamento (Opcional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Digite o motivo do cancelamento para registrar no histórico..."
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="p-5 bg-stone-50 border-t border-stone-100 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => setCancelApt(null)} 
                className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Confirmar Cancelamento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
