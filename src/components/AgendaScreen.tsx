/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { Atendimento, Cliente, Servico, AtendimentoStatus } from "../types.js";
import { useAuth } from "../contexts/AuthContext.js";
import { 
  Plus, Edit, Trash2, X, AlertCircle, Calendar, Clock, DollarSign, User, CheckCircle, Ban, ArrowLeftRight, Check, ListFilter, HelpCircle
} from "lucide-react";

export const AgendaScreen: React.FC = () => {
  const { user } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);

  const getServicosNomes = (at: Atendimento) => {
    if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
      return at.servicos_detalhes.map(s => s.nome).join(", ");
    }
    return at.servico?.nome || "Serviço Personalizado";
  };
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar View State
  const [currentView, setCurrentView] = useState<"day" | "week" | "month" | "list">("month");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().substring(0, 10));

  // Form Modals State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Atendimento | null>(null);

  // Form Fields
  const [editId, setEditId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [data, setData] = useState(new Date().toISOString().substring(0, 10));
  const [hora, setHora] = useState("09:00");
  const [duracao, setDuracao] = useState(30);
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState<AtendimentoStatus>("Agendado");

  // Completion Financial Fields
  const [valorCobrado, setValorCobrado] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState("Pix");
  const [pago, setPago] = useState(true);
  const [fiado, setFiado] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().substring(0, 10));
  const [dataPrevistaRecebimento, setDataPrevistaRecebimento] = useState("");
  const [valorRecebido, setValorRecebido] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [acrescimos, setAcrescimos] = useState(0);
  const [custo, setCusto] = useState(0);
  const [produtosUtilizados, setProdutosUtilizados] = useState<string[]>([]);
  const [salvarValor, setSalvarValor] = useState(false);

  // Multiple Services State and Helpers
  const [selectedServices, setSelectedServices] = useState<Array<{
    servico_id: string;
    nome: string;
    valor: number;
    duracao: number;
    custo: number;
  }>>([]);

  const updateCalculations = (services: typeof selectedServices) => {
    const totalV = services.reduce((sum, s) => sum + Number(s.valor || 0), 0);
    const totalD = services.reduce((sum, s) => sum + Number(s.duracao || 0), 0);
    const totalC = services.reduce((sum, s) => sum + Number(s.custo || 0), 0);
    setValorCobrado(totalV);
    setDuracao(totalD);
    setCusto(totalC);
  };

  const handleAddServiceField = () => {
    const defaultSvc = servicos[0];
    if (!defaultSvc) return;
    const newService = {
      servico_id: defaultSvc.id,
      nome: defaultSvc.nome,
      valor: defaultSvc.valor,
      duracao: defaultSvc.duracao,
      custo: defaultSvc.custo || 0
    };
    const updated = [...selectedServices, newService];
    setSelectedServices(updated);
    updateCalculations(updated);
  };

  const handleRemoveServiceField = (index: number) => {
    const updated = selectedServices.filter((_, i) => i !== index);
    setSelectedServices(updated);
    updateCalculations(updated);
  };

  const handleServiceFieldChange = (index: number, field: string, value: any) => {
    const updated = [...selectedServices];
    if (field === "servico_id") {
      const original = servicos.find(s => s.id === value);
      if (original) {
        updated[index] = {
          servico_id: original.id,
          nome: original.nome,
          valor: original.valor,
          duracao: original.duracao,
          custo: original.custo || 0
        };
      }
    } else {
      updated[index] = {
        ...updated[index],
        [field]: field === "nome" ? value : Number(value)
      };
    }
    setSelectedServices(updated);
    updateCalculations(updated);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    const handleOpenTrigger = () => {
      handleOpenForm(null);
    };
    window.addEventListener("pkm-open-new-appointment", handleOpenTrigger);
    return () => {
      window.removeEventListener("pkm-open-new-appointment", handleOpenTrigger);
    };
  }, [clientes, servicos, selectedDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dataAt = await databaseService.getAtendimentos(user.id);
      const dataCl = await databaseService.getClientes(user.id);
      const dataSv = await databaseService.getServicos(user.id);
      setAtendimentos(dataAt);
      setClientes(dataCl.filter(c => c.ativo)); // only active customers for scheduling
      setServicos(dataSv);
    } catch (err) {
      console.error("Erro ao carregar agenda", err);
    } finally {
      setLoading(false);
    }
  };

  // When service changes in appointment form, auto-fill standard price and duration
  const handleServiceChange = (id: string) => {
    setServicoId(id);
    const selected = servicos.find(s => s.id === id);
    if (selected) {
      setValorCobrado(selected.valor);
      setDuracao(selected.duracao);
      setCusto(0); // initialize custom cost, professional can override
      setProdutosUtilizados(selected.produtos || []);
    }
  };

  const handleOpenForm = (at: Atendimento | null = null) => {
    if (at) {
      setEditId(at.id);
      setClienteId(at.cliente_id);
      setServicoId(at.servico_id);
      setData(at.data);
      setHora(at.hora);
      setDuracao(at.duracao);
      setObservacoes(at.observacoes || "");
      setStatus(at.status);
      setValorCobrado(at.valor_cobrado);
      setSalvarValor(at.valor_cobrado > 0);
      setFormaPagamento(at.forma_pagamento);
      setPago(at.pago);
      setFiado(at.fiado);
      setDataPagamento(at.data_pagamento || new Date().toISOString().substring(0, 10));
      setDataPrevistaRecebimento(at.data_prevista_recebimento || "");
      setValorRecebido(at.valor_recebido);
      setDesconto(at.desconto);
      setAcrescimos(at.acrescimos);
      setCusto(at.custo);
      setProdutosUtilizados(at.produtos_utilizados || []);

      // Load multiple services
      if (at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0) {
        setSelectedServices(at.servicos_detalhes);
      } else {
        const mainService = servicos.find(s => s.id === at.servico_id);
        setSelectedServices([
          {
            servico_id: at.servico_id,
            nome: mainService?.nome || "Serviço",
            valor: at.valor_cobrado,
            duracao: at.duracao,
            custo: at.custo || mainService?.custo || 0
          }
        ]);
      }
    } else {
      setEditId(null);
      setClienteId(clientes[0]?.id || "");
      const firstService = servicos[0];
      setServicoId(firstService?.id || "");
      setData(selectedDate);
      setHora("09:00");
      setDuracao(firstService?.duracao || 30);
      setObservacoes("");
      setStatus("Agendado");
      setValorCobrado(firstService?.valor || 0);
      setSalvarValor(false);
      setFormaPagamento("Pix");
      setPago(false);
      setFiado(false);
      setDataPagamento(new Date().toISOString().substring(0, 10));
      setDataPrevistaRecebimento("");
      setValorRecebido(0);
      setDesconto(0);
      setAcrescimos(0);
      setCusto(0);
      setProdutosUtilizados(firstService?.produtos || []);

      // Initialize with first service as default
      if (firstService) {
        setSelectedServices([
          {
            servico_id: firstService.id,
            nome: firstService.nome,
            valor: firstService.valor,
            duracao: firstService.duracao,
            custo: firstService.custo || 0
          }
        ]);
      } else {
        setSelectedServices([]);
      }
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditId(null);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (selectedServices.length === 0) {
      alert("Por favor, selecione pelo menos um serviço!");
      return;
    }

    // Typical service details (summed up)
    const finalCusto = selectedServices.reduce((sum, s) => sum + Number(s.custo || 0), 0);
    const finalProdutos = selectedServices.reduce((acc, s) => {
      const orig = servicos.find(origS => origS.id === s.servico_id);
      if (orig && orig.produtos) {
        orig.produtos.forEach(p => {
          if (!acc.includes(p)) acc.push(p);
        });
      }
      return acc;
    }, [] as string[]);

    // Check if saving the amount is checked
    const finalValorCobrado = salvarValor ? valorCobrado : 0;
    const finalValorRecebido = salvarValor ? (pago ? (valorCobrado - desconto + acrescimos) : valorRecebido) : 0;
    const netProfit = finalValorRecebido - finalCusto;

    const payload: Omit<Atendimento, "id" | "created_at"> = {
      user_id: user.id,
      cliente_id: clienteId,
      servico_id: selectedServices[0].servico_id, // first service as main for backward compatibility
      data,
      hora,
      duracao,
      observacoes,
      status,
      valor_cobrado: finalValorCobrado,
      forma_pagamento: formaPagamento,
      data_pagamento: pago ? dataPagamento : undefined,
      pago,
      fiado,
      data_prevista_recebimento: fiado ? dataPrevistaRecebimento : undefined,
      valor_recebido: finalValorRecebido,
      desconto: salvarValor ? desconto : 0,
      acrescimos: salvarValor ? acrescimos : 0,
      custo: finalCusto,
      produtos_utilizados: finalProdutos,
      lucro_liquido: netProfit,
      servicos_detalhes: selectedServices,
    };

    try {
      if (editId) {
        await databaseService.updateAtendimento(editId, payload, user.id);
      } else {
        await databaseService.insertAtendimento(payload);
      }
      loadData();
      handleCloseForm();
    } catch (err: any) {
      console.error("[Supabase Save Appointment Error] Detailed error object:", err);
      
      const supabaseMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
      const supabaseCode = err?.code || "N/A";
      const supabaseDetails = err?.details || "N/A";
      const supabaseHint = err?.hint || "N/A";
      
      const detailedError = `Erro no agendamento.\n\n` +
        `- Mensagem Completa: ${supabaseMsg}\n` +
        `- Código do Erro: ${supabaseCode}\n` +
        `- Detalhes: ${supabaseDetails}\n` +
        `- Hint: ${supabaseHint}`;
        
      alert(detailedError);
    }
  };

  // Conclude Appointment Modal Trigger
  const handleOpenCompleteModal = (at: Atendimento) => {
    setSelectedAppointment(at);
    
    const hasMultiple = at.servicos_detalhes && Array.isArray(at.servicos_detalhes) && at.servicos_detalhes.length > 0;
    const totalServicosValor = hasMultiple
      ? at.servicos_detalhes!.reduce((sum, s) => sum + Number(s.valor || 0), 0)
      : (at.servico?.valor || 0);
    
    const totalServicosCusto = hasMultiple
      ? at.servicos_detalhes!.reduce((sum, s) => sum + Number(s.custo || 0), 0)
      : (at.servico?.custo || 0);

    const totalServicosProdutos = hasMultiple
      ? at.servicos_detalhes!.reduce((acc, s) => {
          const orig = servicos.find(origS => origS.id === s.servico_id);
          if (orig && orig.produtos) {
            orig.produtos.forEach(p => {
              if (!acc.includes(p)) acc.push(p);
            });
          }
          return acc;
        }, [] as string[])
      : (at.servico?.produtos || []);

    const valorCobradoInicial = at.valor_cobrado && at.valor_cobrado > 0 ? at.valor_cobrado : totalServicosValor;

    setValorCobrado(valorCobradoInicial);
    setFormaPagamento(at.forma_pagamento || "Pix");
    setPago(true);
    setFiado(false);
    setDataPagamento(new Date().toISOString().substring(0, 10));
    setDataPrevistaRecebimento("");
    setValorRecebido(valorCobradoInicial);
    setDesconto(0);
    setAcrescimos(0);
    
    setCusto(at.custo && at.custo > 0 ? at.custo : totalServicosCusto);
    setProdutosUtilizados(at.produtos_utilizados && at.produtos_utilizados.length > 0 ? at.produtos_utilizados : totalServicosProdutos);
    
    setIsCompleteModalOpen(true);
  };

  const handleConcludeAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAppointment) return;

    // Calculate final profit: Profit = Received - Cost
    const finalValorRecebido = pago ? (valorCobrado - desconto + acrescimos) : 0;
    const netProfit = finalValorRecebido - custo;

    const updates: Partial<Atendimento> = {
      status: "Concluído",
      valor_cobrado: valorCobrado,
      forma_pagamento: formaPagamento,
      pago: pago,
      fiado: fiado,
      data_pagamento: pago ? dataPagamento : undefined,
      data_prevista_recebimento: fiado ? dataPrevistaRecebimento : undefined,
      valor_recebido: finalValorRecebido,
      desconto,
      acrescimos,
      custo,
      produtos_utilizados: produtosUtilizados,
      lucro_liquido: netProfit
    };

    try {
      await databaseService.updateAtendimento(selectedAppointment.id, updates, user.id);
      loadData();
      setIsCompleteModalOpen(false);
      setSelectedAppointment(null);
    } catch (err) {
      console.error("Erro ao concluir atendimento", err);
      alert("Erro ao concluir faturamento do atendimento.");
    }
  };

  const handleCancelAppointment = async (at: Atendimento) => {
    if (!user) return;
    const confirmed = window.confirm("Tem certeza que deseja CANCELAR este atendimento? O evento no Google Agenda também será removido.");
    if (!confirmed) return;

    try {
      await databaseService.updateAtendimento(at.id, { status: "Cancelado" }, user.id);
      loadData();
    } catch (err) {
      console.error("Erro ao cancelar atendimento", err);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!user) return;
    const confirmed = window.confirm("Excluir este agendamento permanentemente?");
    if (!confirmed) return;

    try {
      await databaseService.deleteAtendimento(id, user.id);
      loadData();
    } catch (err) {
      console.error("Erro ao excluir agendamento", err);
    }
  };

  // Helper Calendar Math & Helpers
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const getMonthWeeks = (dateString: string) => {
    const d = new Date(dateString + "T12:00:00");
    const year = d.getFullYear();
    const month = d.getMonth();
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const weeks: (string | null)[][] = [];
    let currentWeek: (string | null)[] = Array(7).fill(null);
    
    for (let i = 0; i < firstDay; i++) {
      currentWeek[i] = null;
    }
    
    let col = firstDay;
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek[col] = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      col++;
      
      if (col === 7 || day === daysInMonth) {
        weeks.push(currentWeek);
        currentWeek = Array(7).fill(null);
        col = 0;
      }
    }
    
    return weeks;
  };

  const getDayAppointments = (dateStr: string) => {
    return atendimentos.filter(a => a.data === dateStr);
  };

  const changeMonth = (offset: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setMonth(d.getMonth() + offset);
    setSelectedDate(d.toISOString().substring(0, 10));
  };

  const changeDay = (offset: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().substring(0, 10));
  };

  // Lists Filters
  const upcomingAppointments = atendimentos.filter(a => a.status === "Agendado" && a.data >= new Date().toISOString().substring(0, 10));
  const completedAppointments = atendimentos.filter(a => a.status === "Concluído");

  const formattedMonthHeader = () => {
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  const formattedDayHeader = () => {
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-stone-900">Agenda</h1>
          <p className="text-sm text-stone-500 mt-0.5">Controle completo de horários, reagendamentos, status e checkout financeiro.</p>
        </div>
        <button
          onClick={() => handleOpenForm(null)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      {/* View Switcher & Date Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-stone-200/60 shadow-sm">
        {/* Date Navigation */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => currentView === "month" ? changeMonth(-1) : changeDay(-1)}
            className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-600 cursor-pointer"
          >
            &larr; Anterior
          </button>
          <span className="font-serif text-base font-semibold text-stone-850 capitalize">
            {currentView === "month" ? formattedMonthHeader() : formattedDayHeader()}
          </span>
          <button 
            onClick={() => currentView === "month" ? changeMonth(1) : changeDay(1)}
            className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-600 cursor-pointer"
          >
            Próximo &rarr;
          </button>
          <button 
            onClick={() => setSelectedDate(new Date().toISOString().substring(0, 10))}
            className="text-xs text-rose-600 hover:text-rose-700 font-bold ml-2 cursor-pointer"
          >
            Hoje
          </button>
        </div>

        {/* Tabs switcher */}
        <div className="flex bg-stone-100 p-1 rounded-xl">
          {[
            { id: "day", label: "Diário" },
            { id: "month", label: "Mensal" },
            { id: "list", label: "Lista de Eventos" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCurrentView(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${currentView === tab.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Sincronizando agendamentos...</p>
        </div>
      ) : (
        <>
          {/* ==========================================
              MONTH VIEW GRID
              ========================================== */}
          {currentView === "month" && (
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 bg-stone-900 text-stone-200 text-xs font-bold text-center py-3">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              
              <div className="divide-y divide-stone-100">
                {getMonthWeeks(selectedDate).map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-7 divide-x divide-stone-100 min-h-24">
                    {week.map((dayStr, dIdx) => {
                      if (!dayStr) {
                        return <div key={dIdx} className="bg-stone-50/50 p-2 text-stone-300" />;
                      }
                      
                      const dayAppointments = getDayAppointments(dayStr);
                      const isToday = dayStr === new Date().toISOString().substring(0, 10);
                      const isSelected = dayStr === selectedDate;
                      const dayNumber = dayStr.split("-")[2];

                      return (
                        <div 
                          key={dIdx}
                          onClick={() => {
                            setSelectedDate(dayStr);
                            setCurrentView("day");
                          }}
                          className={`p-2 hover:bg-stone-50 cursor-pointer transition-colors space-y-1.5 flex flex-col justify-between ${isSelected ? 'bg-rose-50/20' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                              isToday ? "bg-rose-600 text-white shadow-sm" : "text-stone-700"
                            }`}>
                              {parseInt(dayNumber)}
                            </span>
                            {dayAppointments.length > 0 && (
                              <span className="text-[9px] bg-stone-100 text-stone-600 border border-stone-200 font-bold px-1 py-0.5 rounded-full">
                                {dayAppointments.length} at
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 overflow-y-auto max-h-16">
                            {dayAppointments.slice(0, 3).map((at) => (
                              <div 
                                key={at.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                  at.status === "Concluído" ? "bg-emerald-50 text-emerald-800 border-emerald-100" :
                                  at.status === "Cancelado" ? "bg-red-50 text-red-600 border-red-100 line-through" :
                                  "bg-rose-50 text-rose-800 border-rose-100"
                                }`}
                              >
                                {at.hora} • {at.cliente?.nome || "Cliente"}
                              </div>
                            ))}
                            {dayAppointments.length > 3 && (
                              <p className="text-[8px] text-stone-400 italic text-center">+{dayAppointments.length - 3} mais</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==========================================
              DAILY VIEW LIST
              ========================================== */}
          {currentView === "day" && (
            <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm divide-y divide-stone-100 overflow-hidden">
              <div className="p-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Agenda do Dia</span>
                <span className="text-xs text-stone-500 font-medium"><b>{getDayAppointments(selectedDate).length}</b> atendimentos planejados</span>
              </div>

              {getDayAppointments(selectedDate).length === 0 ? (
                <div className="p-12 text-center text-stone-400 italic text-sm">
                  Nenhum atendimento agendado para esta data.
                  <button 
                    onClick={() => handleOpenForm(null)}
                    className="block mt-3 mx-auto text-xs text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                  >
                    + Agendar Horário
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {getDayAppointments(selectedDate)
                    .sort((a, b) => a.hora.localeCompare(b.hora))
                    .map((at) => (
                      <div key={at.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-stone-50/50 transition-all">
                        {/* Time & Client details */}
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl shrink-0">
                            <Clock className="w-4 h-4 text-rose-500" />
                            {at.hora}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-stone-900 text-base">{at.cliente?.nome || "Cliente avulso"}</h3>
                              <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${
                                at.status === "Concluído" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                at.status === "Cancelado" ? "bg-red-50 text-red-600 border border-red-100" :
                                "bg-amber-50 text-amber-700 border border-amber-100"
                              }`}>
                                {at.status}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-stone-600 mt-1">
                              Procedimento: <b>{getServicosNomes(at)}</b> • Duração: <b>{at.duracao} min</b>
                            </p>
                            {at.observacoes && (
                              <p className="text-xs text-stone-400 mt-1 italic">Obs: {at.observacoes}</p>
                            )}
                          </div>
                        </div>

                        {/* Financial and actions */}
                        <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-stone-50">
                          <div className="text-right">
                            <span className="text-xs text-stone-400 font-semibold block uppercase tracking-wider">Valor Cobrado</span>
                            <span className="text-base font-bold text-stone-900">R$ {at.valor_cobrado.toFixed(2)}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {at.status === "Agendado" && (
                              <>
                                <button
                                  onClick={() => handleOpenCompleteModal(at)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" /> Concluir
                                </button>
                                <button
                                  onClick={() => handleCancelAppointment(at)}
                                  className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
                                  title="Cancelar Atendimento"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleOpenForm(at)}
                              className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
                              title="Reagendar / Detalhes"
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteAppointment(at.id)}
                              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              EVENTS LIST VIEW
              ========================================== */}
          {currentView === "list" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Upcoming */}
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-stone-900 text-stone-100 flex items-center justify-between">
                  <h3 className="font-serif font-semibold">Próximos Atendimentos</h3>
                  <span className="text-xs bg-stone-850 px-2 py-0.5 rounded-full font-bold">{upcomingAppointments.length} agendados</span>
                </div>
                <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                  {upcomingAppointments.length === 0 ? (
                    <p className="p-6 text-center text-stone-400 italic text-xs">Sem atendimentos futuros agendados.</p>
                  ) : (
                    upcomingAppointments.map(at => (
                      <div key={at.id} className="p-4 hover:bg-stone-50/30 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold text-stone-850">{at.cliente?.nome}</p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            {getServicosNomes(at)} • <b>{new Date(at.data).toLocaleDateString("pt-BR")} às {at.hora}</b>
                          </p>
                        </div>
                        <span className="text-xs font-bold text-stone-700">R$ {at.valor_cobrado.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Concluded */}
              <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-emerald-950 text-emerald-100 flex items-center justify-between">
                  <h3 className="font-serif font-semibold">Atendimentos Concluídos</h3>
                  <span className="text-xs bg-emerald-900 px-2 py-0.5 rounded-full font-bold">{completedAppointments.length} faturados</span>
                </div>
                <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                  {completedAppointments.length === 0 ? (
                    <p className="p-6 text-center text-stone-400 italic text-xs">Sem atendimentos concluídos registrados.</p>
                  ) : (
                    completedAppointments.map(at => (
                      <div key={at.id} className="p-4 hover:bg-stone-50/30 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-bold text-emerald-900">{at.cliente?.nome}</p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            {getServicosNomes(at)} • Concluído em <b>{new Date(at.data).toLocaleDateString("pt-BR")}</b>
                          </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-700">R$ {at.valor_recebido.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* APPOINTMENT FORM MODAL (ADD / RE-SCHEDULE) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">{editId ? "Reagendar Atendimento" : "Agendar Atendimento"}</h2>
              <button onClick={handleCloseForm} className="p-1.5 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAppointment} className="p-6 overflow-y-auto space-y-4">
              {clientes.length === 0 ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span>Cadastre pelo menos 1 cliente ativo na aba de Clientes antes de agendar!</span>
                </div>
              ) : servicos.length === 0 ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span>Cadastre pelo menos 1 serviço no catálogo antes de agendar!</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Selecionar Cliente *
                    </label>
                    <select
                      value={clienteId}
                      onChange={(e) => setClienteId(e.target.value)}
                      required
                      className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                    >
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* MULTIPLE SERVICES SECTION */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase">Serviços Selecionados *</label>
                      <button
                        type="button"
                        onClick={handleAddServiceField}
                        className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Serviço
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {selectedServices.map((item, index) => (
                        <div key={index} className="p-3 bg-stone-50 rounded-xl border border-stone-200/60 relative space-y-2">
                          {selectedServices.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveServiceField(index)}
                              className="absolute top-2.5 right-2.5 p-1 text-stone-400 hover:text-red-500 rounded-lg hover:bg-stone-200/50 transition-colors cursor-pointer"
                              title="Remover Serviço"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Procedimento Dropdown */}
                          <div>
                            <label className="block text-[10px] font-bold text-stone-500 tracking-wider uppercase mb-0.5">Procedimento</label>
                            <select
                              value={item.servico_id}
                              onChange={(e) => handleServiceFieldChange(index, "servico_id", e.target.value)}
                              required
                              className="block w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                            >
                              <option value="" disabled>Selecione um serviço</option>
                              {servicos.map((s) => (
                                <option key={s.id} value={s.id}>{s.nome}</option>
                              ))}
                            </select>
                          </div>

                          {/* Grid with fields */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-stone-500 tracking-wider uppercase mb-0.5">Profissional</label>
                              <input
                                type="text"
                                disabled
                                value="Principal"
                                className="block w-full rounded-lg border border-stone-200 bg-stone-100/60 px-2 py-1 text-xs font-medium text-stone-600 cursor-not-allowed"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-stone-500 tracking-wider uppercase mb-0.5">Valor (R$)</label>
                              <input
                                type="number"
                                required
                                value={item.valor}
                                onChange={(e) => handleServiceFieldChange(index, "valor", e.target.value)}
                                className="block w-full rounded-lg border border-stone-200 px-2 py-1 text-xs focus:border-rose-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-stone-500 tracking-wider uppercase mb-0.5">Duração (min)</label>
                              <input
                                type="number"
                                required
                                value={item.duracao}
                                onChange={(e) => handleServiceFieldChange(index, "duracao", e.target.value)}
                                className="block w-full rounded-lg border border-stone-200 px-2 py-1 text-xs focus:border-rose-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-stone-500 tracking-wider uppercase mb-0.5">Custo Insumos (R$)</label>
                              <input
                                type="number"
                                required
                                value={item.custo}
                                onChange={(e) => handleServiceFieldChange(index, "custo", e.target.value)}
                                className="block w-full rounded-lg border border-stone-200 px-2 py-1 text-xs focus:border-rose-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Resumo em tempo real */}
                    <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100/60 text-xs text-stone-700 grid grid-cols-2 gap-y-1.5 gap-x-4 mt-2">
                      <div>Duração Total: <span className="font-bold text-stone-900">{duracao} min</span></div>
                      <div>Custo Insumos: <span className="font-bold text-stone-900">R$ {custo.toFixed(2)}</span></div>
                      <div>Preço dos Serviços: <span className="font-bold text-stone-900">R$ {valorCobrado.toFixed(2)}</span></div>
                      <div className="text-rose-700 font-semibold col-span-2 border-t border-rose-100/60 pt-1.5 flex justify-between">
                        <span>Lucro Previsto:</span>
                        <span>R$ {(valorCobrado - custo).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Data *
                      </label>
                      <input
                        type="date"
                        required
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Hora *
                      </label>
                      <input
                        type="time"
                        required
                        value={hora}
                        onChange={(e) => setHora(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Duração (minutos) *</label>
                      <input
                        type="number"
                        required
                        value={duracao}
                        onChange={(e) => setDuracao(parseInt(e.target.value))}
                        className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Preço Inicial (R$)</label>
                      <input
                        type="number"
                        required
                        value={valorCobrado}
                        onChange={(e) => setValorCobrado(parseFloat(e.target.value))}
                        className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                      />
                      <label className="flex items-center gap-2 mt-2 text-xs font-semibold text-stone-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={salvarValor}
                          onChange={(e) => setSalvarValor(e.target.checked)}
                          className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                        />
                        <span>Registrar valor na agenda</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Observações / Queixa Principal</label>
                    <textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      rows={2}
                      className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                      placeholder="Ex: Cliente com pressa. Deseja aplicar henna bem marcante."
                    />
                  </div>

                  {editId && (
                    <div>
                      <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Status do Agendamento</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as AtendimentoStatus)}
                        className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none font-medium"
                      >
                        <option value="Agendado">Agendado</option>
                        <option value="Concluído">Concluído</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>
                    </div>
                  )}

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
                      {editId ? "Salvar Reagendamento" : "Confirmar Horário"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE / CHECKOUT APPOINTMENT MODAL */}
      {isCompleteModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-stone-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-semibold">Checkout Financeiro</h2>
                <p className="text-[11px] text-emerald-100">Registrando conclusão de atendimento de {selectedAppointment.cliente?.nome}</p>
              </div>
              <button 
                onClick={() => {
                  setIsCompleteModalOpen(false);
                  setSelectedAppointment(null);
                }} 
                className="p-1.5 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConcludeAppointment} className="p-6 overflow-y-auto space-y-4">
              {/* Checkout details */}
              <div className="bg-stone-50 border p-3.5 rounded-xl space-y-2 text-xs text-stone-600">
                <p>Procedimento: <b>{getServicosNomes(selectedAppointment)}</b></p>
                <p>Preço de Tabela: <b>R$ {(selectedAppointment.valor_cobrado || 0).toFixed(2)}</b></p>
              </div>

              {/* Financial values */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 tracking-wide uppercase mb-1">Preço Cobrado *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={valorCobrado}
                    onChange={(e) => setValorCobrado(parseFloat(e.target.value))}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 tracking-wide uppercase mb-1">Desconto</label>
                  <input
                    type="number"
                    step="0.01"
                    value={desconto}
                    onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 tracking-wide uppercase mb-1">Acréscimos</label>
                  <input
                    type="number"
                    step="0.01"
                    value={acrescimos}
                    onChange={(e) => setAcrescimos(parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Status toggles: Pago / Fiado */}
              <div className="grid grid-cols-2 gap-4 border-t border-b border-stone-100 py-3">
                <div className="flex items-center justify-between bg-stone-50/50 p-2.5 rounded-xl border">
                  <div>
                    <span className="text-xs font-bold text-stone-700 uppercase">Pago de Imediato?</span>
                    <p className="text-[10px] text-stone-400">Marque se já recebeu o dinheiro.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={pago}
                    onChange={(e) => {
                      setPago(e.target.checked);
                      if (e.target.checked) setFiado(false);
                    }}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between bg-stone-50/50 p-2.5 rounded-xl border">
                  <div>
                    <span className="text-xs font-bold text-amber-700 uppercase">Vender como Fiado?</span>
                    <p className="text-[10px] text-stone-400">Contas a receber futuramente.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={fiado}
                    onChange={(e) => {
                      setFiado(e.target.checked);
                      if (e.target.checked) setPago(false);
                    }}
                    className="w-4 h-4 text-amber-600 focus:ring-amber-500 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Payment details conditional */}
              {pago && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Forma de Pagamento</label>
                    <select
                      value={formaPagamento}
                      onChange={(e) => setFormaPagamento(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none font-medium"
                    >
                      <option value="Pix">Pix</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 tracking-wide uppercase mb-1">Data do Pagamento</label>
                    <input
                      type="date"
                      required
                      value={dataPagamento}
                      onChange={(e) => setDataPagamento(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {fiado && (
                <div>
                  <label className="block text-xs font-bold text-amber-800 tracking-wide uppercase mb-1">Data Prevista para Recebimento *</label>
                  <input
                    type="date"
                    required={fiado}
                    value={dataPrevistaRecebimento}
                    onChange={(e) => setDataPrevistaRecebimento(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Cost and inventory details */}
              <div className="border-t border-stone-100 pt-3 space-y-3">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> Detalhes de Custo e Produtos
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 tracking-wide uppercase mb-1">Custo Total dos Materiais (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={custo}
                      onChange={(e) => setCusto(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-xl border border-stone-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      placeholder="Ex: 12.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 tracking-wide uppercase mb-1">Lucro Líquido Estimado</label>
                    <div className="bg-stone-50 border p-1.5 rounded-xl text-xs font-bold text-stone-800 text-center shadow-inner">
                      R$ {((valorCobrado - desconto + acrescimos) - custo).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-600 tracking-wide uppercase mb-1">Insumos Utilizados neste Atendimento</label>
                  <div className="flex flex-wrap gap-1">
                    {produtosUtilizados.map((p, idx) => (
                      <span key={idx} className="bg-stone-100 border border-stone-200 text-stone-700 text-[10px] px-2 py-0.5 rounded-md">
                        {p}
                      </span>
                    ))}
                    {produtosUtilizados.length === 0 && (
                      <span className="text-[10px] text-stone-400 italic">Nenhum insumo associado ao serviço padrão.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCompleteModalOpen(false);
                    setSelectedAppointment(null);
                  }}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Concluir Atendimento & Faturar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
