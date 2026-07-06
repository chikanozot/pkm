/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { SUPABASE_SQL_SCHEMA } from "../lib/databaseService.js";
import { Calendar, CheckCircle, AlertTriangle, Cloud, Copy, Check, Power, RefreshCw, Sliders } from "lucide-react";

export const GoogleCalendarConfig: React.FC = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [remindersMinutes, setRemindersMinutes] = useState(30);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  // Listen to popup messages
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Validate origin to be safe
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        checkConnectionStatus();
        setStatusMessage("Google Agenda sincronizado com sucesso!");
        setTimeout(() => setStatusMessage(""), 4000);
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  const checkConnectionStatus = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/google/status?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setRemindersMinutes(data.remindersMinutes);
      }
    } catch (err) {
      console.error("Erro ao verificar status do Google", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!user) return;
    let responseCode: number | null = null;
    let responseBodyText = "";
    
    try {
      const res = await fetch(`/api/auth/google/url?userId=${user.id}`);
      responseCode = res.status;
      responseBodyText = await res.text();
      
      // Try to parse as JSON to inspect error field
      let parsedData: any = null;
      try {
        parsedData = JSON.parse(responseBodyText);
      } catch (e) {
        // Not JSON, that's fine
      }

      if (!res.ok) {
        const errorMsg = parsedData?.error || parsedData?.message || "Erro retornado pelo servidor";
        const detailedError = `Erro ao obter URL de autenticação do Google.\n\n` +
          `- Código HTTP: ${responseCode}\n` +
          `- Mensagem do Backend: ${errorMsg}\n` +
          `- Corpo da Resposta: ${responseBodyText.substring(0, 300)}${responseBodyText.length > 300 ? "..." : ""}`;
        
        console.error("[Google OAuth Error Browser] Detailed response error:", {
          status: responseCode,
          body: responseBodyText,
          parsed: parsedData
        });
        
        alert(detailedError);
        return;
      }

      if (!parsedData || !parsedData.url) {
        const errorMsg = parsedData?.error || "Resposta do servidor não possui a URL de redirecionamento.";
        const detailedError = `Erro ao obter URL de autenticação do Google.\n\n` +
          `- Código HTTP: ${responseCode}\n` +
          `- Mensagem: Resposta inválida\n` +
          `- Detalhes: ${errorMsg}\n` +
          `- Corpo da Resposta: ${responseBodyText}`;
          
        console.error("[Google OAuth Error Browser] Invalid response format:", {
          status: responseCode,
          body: responseBodyText,
          parsed: parsedData
        });
        
        alert(detailedError);
        return;
      }
      
      // Open popup with provider's authorize URL directly
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        parsedData.url,
        "google_oauth_popup",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );
    } catch (err: any) {
      console.error("[Google OAuth Error Browser] Exception during fetch:", err);
      const detailedError = `Erro ao obter URL de autenticação do Google.\n\n` +
        `- Detalhes da Exceção: ${err?.message || String(err)}\n` +
        (responseCode ? `- Código HTTP: ${responseCode}\n` : "") +
        (responseBodyText ? `- Corpo da Resposta: ${responseBodyText.substring(0, 300)}${responseBodyText.length > 300 ? "..." : ""}` : "");
      
      alert(detailedError);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    const confirmed = window.confirm("Deseja realmente desconectar sua conta Google? O sistema deixará de sincronizar seus atendimentos.");
    if (!confirmed) return;

    try {
      const res = await fetch("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        setConnected(false);
        setStatusMessage("Google Agenda desconectado.");
        setTimeout(() => setStatusMessage(""), 4000);
      }
    } catch (err) {
      console.error("Erro ao desconectar Google", err);
    }
  };

  const handleReminderChange = async (minutes: number) => {
    if (!user) return;
    setRemindersMinutes(minutes);
    try {
      await fetch("/api/auth/google/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, minutes }),
      });
    } catch (err) {
      console.error("Erro ao atualizar lembretes", err);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-medium text-stone-900">Configurações & Integrações</h1>
        <p className="text-sm text-stone-500 mt-0.5">Sincronize sua agenda com o Google Calendar e configure as políticas de dados do Supabase.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Google Agenda Connection Box */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">Integração com Google Agenda</h2>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Cada profissional pode conectar seu próprio Google Calendar. Eventos serão criados automaticamente ao agendar atendimentos, e serão atualizados ou excluídos instantaneamente caso haja reagendamento ou cancelamento no sistema.
              </p>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs font-semibold">
              {statusMessage}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-stone-500 text-xs py-4 font-semibold">
              <RefreshCw className="w-4 h-4 animate-spin" /> Verificando status da conexão...
            </div>
          ) : connected ? (
            <div className="space-y-4 pt-2">
              {/* Connected Status Card */}
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-emerald-950">Seu Google Agenda está Sincronizado</span>
                    <p className="text-xs text-emerald-800/80 mt-0.5">Os atendimentos agendados já estão sendo criados na sua conta Google.</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 bg-white text-red-600 border border-red-200 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Power className="w-3.5 h-3.5" /> Desconectar
                </button>
              </div>

              {/* Reminders config */}
              <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-stone-800 font-semibold text-sm">
                  <Sliders className="w-4 h-4 text-stone-500" />
                  <span>Configurar Lembretes de Evento</span>
                </div>
                <p className="text-xs text-stone-500">Defina quantos minutos antes do atendimento o Google Calendar deve enviar alertas automáticos para você.</p>
                
                <select
                  value={remindersMinutes}
                  onChange={(e) => handleReminderChange(parseInt(e.target.value))}
                  className="block w-full max-w-xs rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-medium"
                >
                  <option value={10}>10 minutos antes</option>
                  <option value={15}>15 minutos antes</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={1440}>1 dia antes</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="bg-stone-50 border border-stone-200/50 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wide">Status de Sincronização</span>
                  <p className="text-sm font-semibold text-stone-800 mt-0.5">Google Agenda não conectado</p>
                  <p className="text-xs text-stone-500 mt-1">Conecte sua conta do Google de forma segura para ativar a criação automática de eventos.</p>
                </div>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md transition-colors cursor-pointer shrink-0"
                >
                  Conectar Google Agenda
                </button>
              </div>

              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Nota para o Administrador:</span>
                  <p className="mt-0.5 text-amber-700">
                    Certifique-se de configurar as chaves de OAuth do Google (<code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> e <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code>) nas Configurações/Secrets da aplicação. Lembre-se de adicionar o callback oficial ao painel de desenvolvedores do Google Cloud:
                  </p>
                  <p className="font-mono bg-white p-1.5 rounded border border-amber-200 text-[10px] select-all mt-1.5 w-fit text-stone-800">
                    {window.location.origin}/auth/google/callback
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Supabase connection instruction Card */}
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-semibold text-stone-900">Banco Supabase</h3>
              <p className="text-xs text-stone-500 mt-0.5">Persistência oficial de alta segurança.</p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="p-3 rounded-xl border border-stone-100 bg-stone-50/50 text-xs text-stone-600 space-y-1">
              <p>O sistema suporta persistência oficial direta no seu próprio projeto Supabase.</p>
              <p className="font-semibold text-stone-800">Variáveis a declarar nos Secrets:</p>
              <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-stone-700">
                <li>VITE_SUPABASE_URL</li>
                <li>VITE_SUPABASE_ANON_KEY</li>
                <li>SUPABASE_URL</li>
                <li>SUPABASE_ANON_KEY</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* SQL Script Box */}
      <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
          <div>
            <h3 className="font-serif font-semibold text-base">Script SQL do Supabase</h3>
            <p className="text-xs text-stone-400 mt-0.5">Copie e execute no editor SQL do seu painel Supabase para criar a estrutura e políticas de segurança RLS.</p>
          </div>
          <button
            onClick={handleCopySql}
            className="flex items-center gap-1 px-3 py-1.5 bg-stone-800 hover:bg-stone-750 border border-stone-700 hover:border-stone-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copiado!" : "Copiar SQL"}
          </button>
        </div>
        <div className="p-4 bg-stone-950 font-mono text-[11px] text-stone-300 max-h-72 overflow-y-auto whitespace-pre leading-relaxed select-all">
          {SUPABASE_SQL_SCHEMA}
        </div>
      </div>
    </div>
  );
};
