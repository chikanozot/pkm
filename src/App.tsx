/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { Dashboard } from "./components/Dashboard.js";
import { ClientesScreen } from "./components/ClientesScreen.js";
import { AgendaScreen } from "./components/AgendaScreen.js";
import { FinanceiroScreen } from "./components/FinanceiroScreen.js";
import { ServicosScreen } from "./components/ServicosScreen.js";
import { GoogleCalendarConfig } from "./components/GoogleCalendarConfig.js";
import { UsersManagementScreen } from "./components/UsersManagementScreen.js";
import { MyAccountScreen } from "./components/MyAccountScreen.js";
import { SaaSStatusGate } from "./components/SaaSStatusGate.js";
import { ForcePasswordChangeScreen } from "./components/ForcePasswordChangeScreen.js";
import { LumoraLogo } from "./components/LumoraLogo";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, Users, CalendarDays, DollarSign, Sparkles, Settings, LogOut, Menu, X, BookOpen, AlertCircle, Shield, User
} from "lucide-react";

type ActiveTab = "dashboard" | "agenda" | "clientes" | "financeiro" | "servicos" | "config" | "users" | "profile";

const Layout: React.FC = () => {
  const { user, logout, resendConfirmationEmail } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const menuItems = [
    { id: "dashboard" as ActiveTab, label: "Painel Geral", icon: LayoutDashboard },
    { id: "agenda" as ActiveTab, label: "Agenda", icon: CalendarDays },
    { id: "clientes" as ActiveTab, label: "Clientes", icon: Users },
    { id: "financeiro" as ActiveTab, label: "Financeiro", icon: DollarSign },
    { id: "servicos" as ActiveTab, label: "Serviços", icon: BookOpen },
    { id: "profile" as ActiveTab, label: "Minha Conta", icon: User },
    { id: "config" as ActiveTab, label: "Integrações", icon: Settings },
  ];

  if (user?.role === "master") {
    menuItems.push({ id: "users" as ActiveTab, label: "Painel MASTER", icon: Shield });
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onNavigate={(tab) => setActiveTab(tab as ActiveTab)} />;
      case "agenda":
        return <AgendaScreen />;
      case "clientes":
        return <ClientesScreen />;
      case "financeiro":
        return <FinanceiroScreen />;
      case "servicos":
        return <ServicosScreen />;
      case "profile":
        return <MyAccountScreen />;
      case "config":
        return <GoogleCalendarConfig />;
      case "users":
        return <UsersManagementScreen />;
      default:
        return <Dashboard />;
    }
  };

  const getPageTitle = () => {
    const matched = menuItems.find(item => item.id === activeTab);
    return matched ? matched.label : "LUMORA Flow";
  };

  const handleResendEmail = async () => {
    if (!user?.email) return;
    setResendingEmail(true);
    try {
      await resendConfirmationEmail(user.email);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (e) {
      console.error("Error resending email:", e);
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50/60 flex flex-col md:flex-row relative">
      {/* ==========================================
          DESKTOP PERSISTENT SIDEBAR
          ========================================== */}
      <aside className="hidden md:flex md:w-64 bg-stone-900 text-white flex-col justify-between shrink-0 border-r border-stone-850 h-screen sticky top-0">
        <div className="flex flex-col overflow-y-auto">
          {/* Logo Header */}
          <div className="p-6 border-b border-stone-850 flex items-center gap-3">
            <LumoraLogo size="sm" showBg={true} />
            <div>
              <h2 className="font-serif font-semibold tracking-tight text-stone-100 text-base leading-tight">LUMORA Flow</h2>
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5 block">Gestão Estética</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="p-4 space-y-1.5 mt-2 flex-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    isActive 
                      ? "bg-rose-600 text-white shadow-md font-bold" 
                      : "text-stone-300 hover:bg-stone-850 hover:text-white"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile section footer */}
        <div className="p-4 border-t border-stone-850 space-y-3 bg-stone-950/40">
          <button
            onClick={() => setActiveTab("profile")}
            className="flex items-center gap-3 px-2 w-full text-left cursor-pointer hover:bg-stone-850/50 p-2 rounded-xl transition-all"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden bg-stone-800 border border-stone-750 flex items-center justify-center font-bold text-sm text-rose-500 uppercase">
              {user?.foto_url ? (
                <img src={user.foto_url} alt={user.nome} className="w-full h-full object-cover" />
              ) : (
                user?.nome.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-200 truncate">{user?.nome}</p>
              <p className="text-[10px] text-stone-500 truncate">{user?.email}</p>
            </div>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-450 hover:text-red-400 hover:bg-red-950/20 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sair do Painel
          </button>
        </div>
      </aside>

      {/* ==========================================
          MOBILE FLOATING NAV BAR & HEADER
          ========================================== */}
      <header className="md:hidden bg-stone-900 text-white p-4 sticky top-0 z-40 flex items-center justify-between border-b border-stone-850 shadow-sm">
        <div className="flex items-center gap-2.5">
          <LumoraLogo size="sm" showBg={true} />
          <span className="font-serif font-semibold text-stone-100 text-sm tracking-tight">{getPageTitle()}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("profile")}
            className="w-7 h-7 rounded-full overflow-hidden bg-stone-800 border border-stone-700 flex items-center justify-center text-xs text-rose-500 font-bold uppercase cursor-pointer"
          >
            {user?.foto_url ? (
              <img src={user.foto_url} alt={user.nome} className="w-full h-full object-cover" />
            ) : (
              user?.nome.charAt(0)
            )}
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-300 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Slide-in Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-30 md:hidden"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 w-64 bg-stone-900 text-white z-40 p-4 flex flex-col shadow-2xl md:hidden h-full max-h-screen overflow-hidden"
            >
              {/* Header inside drawer */}
              <div className="flex items-center justify-between pb-4 border-b border-stone-850 mt-1 mb-4">
                <div className="flex items-center gap-2">
                  <LumoraLogo size="sm" showBg={true} />
                  <span className="font-serif font-semibold text-xs text-stone-200">LUMORA Flow</span>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 hover:bg-stone-800 rounded-lg text-stone-400 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Nav Items */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <nav className="space-y-1.5">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                          isActive 
                            ? "bg-rose-600 text-white font-bold" 
                            : "text-stone-300 hover:bg-stone-850"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Fixed Bottom Profile & Logout block */}
              <div className="space-y-3.5 border-t border-stone-850 pt-4 mt-auto">
                <button
                  onClick={() => {
                    setActiveTab("profile");
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-2 w-full text-left"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-800 text-rose-500 flex items-center justify-center font-bold text-xs uppercase border border-stone-700 shrink-0">
                    {user?.foto_url ? (
                      <img src={user.foto_url} alt={user.nome} className="w-full h-full object-cover" />
                    ) : (
                      user?.nome.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-200 truncate">{user?.nome}</p>
                    <p className="text-[10px] text-stone-500 truncate">{user?.email}</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-red-400 bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0 text-red-500" />
                  Sair do Painel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ==========================================
          MAIN PORTAL VIEW CONTAINER
          ========================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        
        {/* Email verification alert warning */}
        {user && !user.email_confirmado && user.role !== "master" && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-3 font-medium transition-all">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
              <span>
                Seu endereço de e-mail <strong>{user.email}</strong> ainda não está confirmado. Confirme seu e-mail para usufruir de todas as garantias.
              </span>
            </div>
            
            <button
              onClick={handleResendEmail}
              disabled={resendingEmail || resendSuccess}
              className="bg-amber-600 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-lg hover:bg-amber-700 transition-all cursor-pointer disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {resendingEmail ? "Enviando..." : (resendSuccess ? "Enviado com Sucesso!" : "Reenviar E-mail de Ativação")}
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {renderActiveScreen()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ==========================================
          MOBILE BOTTOM NAVIGATION (Touch Target >= 44px)
          ========================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40 flex items-center justify-around py-1 px-2 shadow-lg no-print">
        {menuItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-1.5 px-3 rounded-xl cursor-pointer"
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-rose-600 font-bold scale-110' : 'text-stone-400'}`} />
              <span className={`text-[9px] mt-1 font-bold ${isActive ? 'text-rose-600' : 'text-stone-450'}`}>{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
        <button
          onClick={() => setActiveTab("profile")}
          className="flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-1.5 px-3 rounded-xl cursor-pointer"
        >
          <User className={`w-5 h-5 ${activeTab === 'profile' ? 'text-rose-600 font-bold scale-110' : 'text-stone-400'}`} />
          <span className={`text-[9px] mt-1 font-bold ${activeTab === 'profile' ? 'text-rose-600' : 'text-stone-450'}`}>Conta</span>
        </button>
      </nav>
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-3 text-sm text-stone-500 font-semibold">Iniciando Portal de Estética...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (user.must_change_password) {
    return <ForcePasswordChangeScreen />;
  }

  // STATUS ACCESS CONTROL / SaaS Gating
  const isMaster = user.role === "master";
  const isSubscriptionActive = user.status === "Assinatura Ativa";
  
  if (!isMaster && !isSubscriptionActive) {
    return <SaaSStatusGate />;
  }

  return <Layout />;
};

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
