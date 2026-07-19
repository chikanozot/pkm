/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { databaseService } from "../lib/databaseService.js";
import { motion, AnimatePresence } from "motion/react";
import { Check, CreditCard, Sparkles, QrCode, Copy, CheckCircle, ShieldAlert, AlertTriangle, LogOut, PhoneCall } from "lucide-react";
import { LumoraLogo } from "./LumoraLogo";

export const SaaSStatusGate: React.FC = () => {
  const { user, logout, reloadProfile } = useAuth();
  
  // Checkout flow states
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"plans" | "checkout" | "success">("plans");
  const [copied, setCopied] = useState(false);
  const [saasSettings, setSaasSettings] = useState<any>(null);

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await databaseService.getSaaSSettings();
        if (settings) {
          setSaasSettings(settings);
        }
      } catch (err) {
        console.error("Error fetching SaaS settings:", err);
      }
    };
    fetchSettings();
  }, []);

  React.useEffect(() => {
    if (!user || !saasSettings) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout_stripe") === "true") {
      const planName = params.get("plan");
      const usrId = params.get("userId");
      
      if (user.id === usrId) {
        const foundPlan = plans.find((p: any) => p.id === planName || p.name === planName);
        if (foundPlan) {
          setSelectedPlan(foundPlan);
          setPaymentMethod("card");
          setCheckoutStep("checkout");
        }
      }
    }
  }, [user, saasSettings]);

  const bronzePrice = saasSettings?.plano_bronze_valor ?? 49.90;
  const prataPrice = saasSettings?.plano_prata_valor ?? 99.90;
  const ouroPrice = saasSettings?.plano_ouro_valor ?? 149.90;

  const configGerais = saasSettings?.configuracoes_gerais || {};
  const isPrataAtivo = configGerais.plano_prata_ativo !== false;
  const isOuroAtivo = configGerais.plano_ouro_ativo !== false;

  const plans: any[] = [
    {
      id: "Plano Bronze",
      name: "STANDART",
      price: bronzePrice,
      description: "Ideal para esteticistas individuais e iniciantes.",
      features: [
        "Até 50 clientes ativos",
        "Agenda integrada e simplificada",
        "Fluxo de caixa básico",
        "Controle de serviços padrão",
        "Suporte por e-mail"
      ]
    }
  ];

  if (isPrataAtivo) {
    plans.push({
      id: "Plano Prata",
      name: "Prata",
      price: prataPrice,
      description: "A melhor escolha para clínicas e consultórios em crescimento.",
      features: [
        "Até 200 clientes ativos",
        "Agenda integrada completa",
        "Fluxo de caixa avançado",
        "Controle completo de múltiplos serviços",
        "Sincronização com Google Agenda",
        "Suporte prioritário via WhatsApp"
      ],
      popular: true
    });
  }

  if (isOuroAtivo) {
    plans.push({
      id: "Plano Ouro",
      name: "Ouro",
      price: ouroPrice,
      description: "Acesso total e ilimitado para grandes profissionais.",
      features: [
        "Clientes ativos ilimitados",
        "Agenda integrada completa e Google Agenda",
        "Fluxo de caixa avançado e relatórios",
        "Múltiplos serviços por atendimento",
        "Backup em nuvem instantâneo",
        "Gerente de conta exclusivo",
        "Novos recursos garantidos primeiro"
      ]
    });
  }

  // Set standard popular status
  if (isPrataAtivo && isOuroAtivo) {
    plans.forEach(p => {
      if (p.id === "Plano Prata") p.popular = true;
      if (p.id === "Plano Ouro") p.popular = false;
    });
  } else if (!isPrataAtivo && isOuroAtivo) {
    const ouroPlan = plans.find(p => p.id === "Plano Ouro");
    if (ouroPlan) ouroPlan.popular = true;
  }

  const handleSelectPlan = (plan: any) => {
    setSelectedPlan(plan);
    setCheckoutStep("checkout");
  };

  const copyPixKey = () => {
    navigator.clipboard.writeText("00020101021126580014br.gov.bcb.pix0136e39df16a-ef9c-48b4-9da9-bc6f82729e84520400005303986540549.905802BR5911LUMORA FLOW6009SAO PAULO62070503***6304E67E");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProcessPayment = async () => {
    if (!user || !selectedPlan) return;
    setLoading(true);
    try {
      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      // 1. Prepare profile updates
      const profileUpdates = {
        status: "Assinatura Ativa",
        plano_atual: selectedPlan.id,
        plano_status: "Ativo",
        plano_valor: selectedPlan.price,
        plano_data_contratacao: now.toISOString(),
        plano_data_renovacao: nextMonth.toISOString(),
        plano_data_vencimento: nextMonth.toISOString(),
        plano_gateway: paymentMethod === "pix" ? "Pix" : "stripe",
        plano_assinatura_id: "sub_" + Math.random().toString(36).substring(2, 11),
        plano_ultimo_pagamento: now.toISOString(),
        plano_proximo_pagamento: nextMonth.toISOString(),
        situacao_pagamento: "Pago"
      };

      // 2. Persist in Database
      await databaseService.updateUserProfile(user.id, profileUpdates);

      // 3. Log administrative log
      await databaseService.logSaaSAction({
        admin_id: null,
        admin_nome: "SaaS Gateway",
        acao: `Assinatura de plano processada: ${selectedPlan.id} por R$ ${selectedPlan.price.toFixed(2)} (${paymentMethod === "pix" ? "Pix" : "Cartão"})`,
        user_id: user.id,
        user_nome: user.nome
      });

      // 4. Update local session & reload
      setCheckoutStep("success");
      setTimeout(async () => {
        await reloadProfile();
      }, 3000);
    } catch (err) {
      console.error("Error processing payment:", err);
    } finally {
      setLoading(false);
    }
  };

  // Switch UI according to state
  const isBlocked = user?.status === "Conta Bloqueada" || user?.status === "Conta Suspensa";
  const isPastDue = user?.status === "Assinatura Vencida" || user?.status === "Assinatura Cancelada" || user?.status === "Inadimplente";

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-rose-100/30 blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[35rem] h-[35rem] rounded-full bg-stone-200/40 blur-3xl -z-10" />

      <div className="max-w-4xl mx-auto w-full">
        {/* Top Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-4">
            <LumoraLogo size="lg" showBg={true} />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-stone-900 mt-2">LUMORA Flow</h1>
          <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-1">Gestão Inteligente & Agenda Estética</p>
        </div>

        {/* 1. SUSPENDED / BLOCKED VIEW */}
        {isBlocked ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-stone-200 p-8 shadow-xl text-center space-y-6 max-w-lg mx-auto"
          >
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <ShieldAlert className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-stone-900">Conta Bloqueada / Suspensa</h2>
              <p className="text-xs text-stone-500 leading-relaxed">
                Prezada(o) <strong>{user?.nome}</strong>, seu acesso a este portal de estética foi bloqueado ou suspenso temporariamente devido a pendências administrativas ou violação dos termos.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-150 text-stone-700 text-xs flex items-center gap-3 justify-center">
              <PhoneCall className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-semibold">Suporte Financeiro: suporte@pkmestetica.com</span>
            </div>

            <div className="flex gap-3 justify-center pt-4">
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 cursor-pointer border border-stone-250 hover:bg-stone-100 text-stone-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </button>
            </div>
          </motion.div>
        ) : (
          /* 2. CHOOSE PLANS OR CHECKOUT VIEW */
          <AnimatePresence mode="wait">
            {checkoutStep === "plans" && (
              <motion.div
                key="plans"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                {/* Warning header if past-due */}
                {isPastDue && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 max-w-2xl mx-auto">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold">Assinatura Expirada / Vencida</h4>
                      <p className="text-amber-700 mt-1">
                        Seu plano atual expirou ou encontra-se em atraso. Selecione um plano abaixo para regularizar suas faturas e desbloquear imediatamente o seu painel de agendamentos.
                      </p>
                    </div>
                  </div>
                )}

                <div className="text-center space-y-2">
                  <h2 className="text-xl sm:text-2xl font-serif font-semibold text-stone-900">
                    {isPastDue ? "Regularize sua assinatura" : "Selecione o seu plano ideal"}
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-500 max-w-lg mx-auto">
                    Acesso completo a todas as funcionalidades de gestão, fluxo financeiro, integração de contatos e agendamentos automatizados.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`bg-white rounded-3xl border p-6 flex flex-col justify-between transition-all relative ${
                        plan.popular 
                          ? "border-rose-500 shadow-xl ring-1 ring-rose-500 md:-translate-y-2" 
                          : "border-stone-200 shadow-md hover:border-stone-300"
                      }`}
                    >
                      {plan.popular && (
                        <span className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-rose-600 text-white font-bold text-[9px] tracking-widest px-3 py-1 rounded-full uppercase">
                          Mais Recomendado
                        </span>
                      )}

                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">{plan.name}</h3>
                          <div className="flex items-baseline mt-2 text-stone-900">
                            <span className="text-xl font-bold">R$</span>
                            <span className="text-4xl font-black tracking-tight">{plan.price.toFixed(2).split(".")[0]}</span>
                            <span className="text-sm font-semibold text-stone-500">,{plan.price.toFixed(2).split(".")[1]}/mês</span>
                          </div>
                          <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{plan.description}</p>
                        </div>

                        <ul className="space-y-2.5 border-t border-stone-100 pt-4">
                          {plan.features.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 text-xs text-stone-600">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
                          plan.popular
                            ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md"
                            : "bg-stone-900 text-white hover:bg-stone-950"
                        }`}
                      >
                        {isPastDue ? "Reativar Com Este Plano" : "Assinar Plano"}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center pt-4">
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-2 cursor-pointer border border-stone-250 hover:bg-stone-100 text-stone-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair da Minha Conta
                  </button>
                </div>
              </motion.div>
            )}

            {checkoutStep === "checkout" && selectedPlan && (
              <motion.div
                key="checkout"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden max-w-2xl mx-auto"
              >
                {/* Order Summary banner */}
                <div className="bg-stone-900 text-white p-6 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Checkout Seguro via Stripe</span>
                    <h3 className="font-serif text-lg font-bold mt-1">Plano LUMORA Flow {selectedPlan.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-stone-400 block font-medium">Assinatura Mensal</span>
                    <span className="text-lg font-bold text-rose-500 font-mono">R$ {selectedPlan.price.toFixed(2)} / mês</span>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  {/* Select payment method */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("pix")}
                      className={`p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                        paymentMethod === "pix"
                          ? "border-rose-500 bg-rose-50/20 text-rose-600 font-bold ring-1 ring-rose-500"
                          : "border-stone-200 hover:border-stone-300 text-stone-500"
                      }`}
                    >
                      <QrCode className="w-6 h-6" />
                      <span className="text-xs">Pix Copia e Cola</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={`p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                        paymentMethod === "card"
                          ? "border-rose-500 bg-rose-50/20 text-rose-600 font-bold ring-1 ring-rose-500"
                          : "border-stone-200 hover:border-stone-300 text-stone-500"
                      }`}
                    >
                      <CreditCard className="w-6 h-6" />
                      <span className="text-xs">Cartão de Crédito</span>
                    </button>
                  </div>

                  {/* Payment Details */}
                  {paymentMethod === "pix" ? (
                    <div className="flex flex-col items-center text-center space-y-4 bg-stone-50 p-6 rounded-2xl border border-stone-150">
                      <div className="bg-white p-3.5 rounded-2xl border border-stone-150 shadow-sm">
                        {/* Generates a nice SVG placeholder look of a real QR code */}
                        <div className="w-36 h-36 bg-stone-900 rounded-xl flex items-center justify-center text-white text-[10px] font-mono font-bold tracking-widest relative overflow-hidden">
                          <span className="absolute rotate-12 opacity-5 scale-150 bg-rose-600 w-full h-full inset-0" />
                          <div className="grid grid-cols-4 gap-2 w-28 h-28 p-2 bg-white rounded-lg">
                            {Array.from({ length: 16 }).map((_, i) => (
                              <div key={i} className={`rounded-sm ${i % 3 === 0 || i % 5 === 0 ? 'bg-stone-900' : 'bg-transparent'}`} />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold text-stone-900">Pague com Pix</p>
                        <p className="text-[11px] text-stone-500 leading-relaxed max-w-sm mx-auto">
                          Clique no botão abaixo para copiar o código Pix, abra seu aplicativo de banco e selecione a opção Pix Copia e Cola.
                        </p>
                      </div>

                      <div className="flex gap-2.5 w-full max-w-sm">
                        <button
                          type="button"
                          onClick={copyPixKey}
                          className="flex-1 inline-flex items-center justify-center gap-2 cursor-pointer border border-stone-250 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs py-2 px-4 rounded-xl transition-all"
                        >
                          <Copy className="w-4 h-4 text-stone-500" />
                          {copied ? "Copiado!" : "Copiar Código Pix"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 bg-stone-50 p-6 rounded-2xl border border-stone-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Número do Cartão</label>
                          <input
                            type="text"
                            placeholder="4444 4444 4444 4444"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="block w-full rounded-xl border border-stone-250 bg-white px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Nome no Cartão</label>
                          <input
                            type="text"
                            placeholder="MARIA O SILVA"
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value)}
                            className="block w-full rounded-xl border border-stone-250 bg-white px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Data de Expiração</label>
                          <input
                            type="text"
                            placeholder="MM/AA"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            className="block w-full rounded-xl border border-stone-250 bg-white px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">Código CVV</label>
                          <input
                            type="text"
                            placeholder="123"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            className="block w-full rounded-xl border border-stone-250 bg-white px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-stone-400 text-center mt-2 flex items-center justify-center gap-1">
                        <span>🔒</span> Transação criptografada de forma segura e processada via <strong>Stripe</strong>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutStep("plans")}
                      className="flex-1 cursor-pointer border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all text-center"
                    >
                      Voltar aos Planos
                    </button>
                    
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleProcessPayment}
                      className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all disabled:bg-stone-300 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {loading ? "Processando..." : (paymentMethod === "pix" ? "Confirmar Pagamento Pix" : "Ativar Minha Assinatura")}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {checkoutStep === "success" && selectedPlan && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl border border-stone-200 p-8 shadow-xl text-center space-y-6 max-w-md mx-auto"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 animate-bounce">
                  <CheckCircle className="w-10 h-10" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-stone-900">Assinatura Ativada!</h2>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Parabéns! Sua assinatura do <strong>Plano {selectedPlan.name}</strong> foi processada com sucesso e seu acesso foi totalmente liberado.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                  Carregando o seu Painel Geral...
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
