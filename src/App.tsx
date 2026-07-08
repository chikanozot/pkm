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
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, Users, CalendarDays, DollarSign, Sparkles, Settings, LogOut, Menu, X, BookOpen, AlertCircle, Shield
} from "lucide-react";

type ActiveTab = "dashboard" | "agenda" | "clientes" | "financeiro" | "servicos" | "config" | "users";

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: "dashboard" as ActiveTab, label: "Painel Geral", icon: LayoutDashboard },
    { id: "agenda" as ActiveTab, label: "Agenda", icon: CalendarDays },
    { id: "clientes" as ActiveTab, label: "Clientes", icon: Users },
    { id: "financeiro" as ActiveTab, label: "Financeiro", icon: DollarSign },
    { id: "servicos" as ActiveTab, label: "Serviços", icon: BookOpen },
    { id: "config" as ActiveTab, label: "Integrações", icon: Settings },
  ];

  if (user?.role === "master") {
    menuItems.push({ id: "users" as ActiveTab, label: "Gerenciar Usuários", icon: Shield });
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "agenda":
        return <AgendaScreen />;
      case "clientes":
        return <ClientesScreen />;
      case "financeiro":
        return <FinanceiroScreen />;
      case "servicos":
        return <ServicosScreen />;
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
    return matched ? matched.label : "PKM Embelezamento";
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
            <div className="w-9 h-9 rounded-full bg-rose-600 flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-serif font-semibold tracking-tight text-stone-100 text-base leading-tight">PKM Embelezamento</h2>
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
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-stone-800 border border-stone-750 flex items-center justify-center font-bold text-sm text-rose-500 uppercase">
              {user?.nome.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-200 truncate">{user?.nome}</p>
              <p className="text-[10px] text-stone-500 truncate">{user?.email}</p>
            </div>
          </div>

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
          <div className="w-7 h-7 rounded-full bg-rose-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-serif font-semibold text-stone-100 text-sm tracking-tight">{getPageTitle()}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-xs text-rose-500 font-bold uppercase">
            {user?.nome.charAt(0)}
          </div>
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
              className="fixed right-0 top-0 bottom-0 w-64 bg-stone-900 text-white z-40 p-4 flex flex-col justify-between shadow-2xl md:hidden"
            >
              <div className="space-y-6 pt-12">
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

              <div className="space-y-4 border-t border-stone-850 pt-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-stone-800 text-rose-500 flex items-center justify-center font-bold text-xs uppercase border border-stone-700">
                    {user?.nome.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-200 truncate">{user?.nome}</p>
                    <p className="text-[10px] text-stone-500 truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-400 hover:text-red-400 hover:bg-red-950/20 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Sair da Conta
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ==========================================
          MAIN PORTAL VIEW CONTAINER
          ========================================== */}
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
          onClick={() => setActiveTab("config")}
          className="flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-1.5 px-3 rounded-xl cursor-pointer"
        >
          <Settings className={`w-5 h-5 ${activeTab === 'config' ? 'text-rose-600 font-bold scale-110' : 'text-stone-400'}`} />
          <span className={`text-[9px] mt-1 font-bold ${activeTab === 'config' ? 'text-rose-600' : 'text-stone-450'}`}>Config</span>
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

  return <Layout />;
};

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
