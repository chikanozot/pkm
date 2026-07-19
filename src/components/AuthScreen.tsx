/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { motion, AnimatePresence } from "motion/react";
import { Lock, User, Sparkles, AlertCircle, Phone, Briefcase, Mail, Eye, EyeOff, CheckCircle2, ArrowLeft } from "lucide-react";
import { LumoraLogo } from "./LumoraLogo";

export const AuthScreen: React.FC = () => {
  const { login, signup, resetPassword, updateProfile, error: authContextError } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");
  
  // Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [celular, setCelular] = useState("");
  const [empresa, setEmpresa] = useState("");
  
  // Controls
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [stayConnected, setStayConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Detect recovery redirect from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (params.get("reset") === "true" || hash.includes("access_token") && hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, []);

  const validatePhone = (phone: string) => {
    // Basic verification: only numbers, min 10 chars
    const numeric = phone.replace(/\D/g, "");
    return numeric.length >= 10;
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password, { remember: rememberMe });
        if (rememberMe) {
          localStorage.setItem("pkm_remembered_email", email);
        } else {
          localStorage.removeItem("pkm_remembered_email");
        }
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("Por favor, insira o seu nome completo.");
        if (!celular.trim() || !validatePhone(celular)) {
          throw new Error("Por favor, insira um celular válido com DDD (mínimo 10 dígitos).");
        }
        if (!email.trim() || !email.includes("@")) {
          throw new Error("Por favor, insira um endereço de e-mail válido.");
        }
        if (password !== confirmPassword) {
          throw new Error("As senhas informadas não coincidem.");
        }

        await signup(email, password, name, celular, empresa);
        setSuccessMsg("Conta criada com sucesso! Enviamos um e-mail de confirmação. Por favor, valide sua conta.");
        // Redirect to login
        setTimeout(() => {
          setMode("login");
          setSuccessMsg(null);
        }, 5000);
      } else if (mode === "forgot") {
        if (!email.trim()) throw new Error("Por favor, digite seu e-mail.");
        await resetPassword(email);
        setSuccessMsg("E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.");
      } else if (mode === "reset") {
        if (!password) throw new Error("A nova senha é obrigatória.");
        if (password.length < 8) throw new Error("A senha deve conter no mínimo 8 caracteres.");
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");

        await updateProfile({ password });
        setSuccessMsg("Senha alterada com sucesso! Você será redirecionado para o login.");
        setTimeout(() => {
          // Clean parameters and redirect to login
          window.history.replaceState({}, document.title, window.location.pathname);
          setMode("login");
          setSuccessMsg(null);
          setPassword("");
          setConfirmPassword("");
        }, 3000);
      }
    } catch (err: any) {
      setFormError(err.message || "Ocorreu um erro no processamento do formulário.");
    } finally {
      setLoading(false);
    }
  };

  // Pre-load remembered email if exists
  useEffect(() => {
    const saved = localStorage.getItem("pkm_remembered_email");
    if (saved && mode === "login") {
      setEmail(saved);
    }
  }, [mode]);

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-rose-100/40 blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[35rem] h-[35rem] rounded-full bg-stone-200/50 blur-3xl -z-10" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-4">
          <LumoraLogo size="lg" showBg={true} />
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900 mt-2">
          LUMORA Flow
        </h1>
        <p className="mt-2 text-stone-500 font-medium tracking-wide text-xs uppercase">
          Portal de Gestão SaaS & Agenda Estética
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white/80 backdrop-blur-md py-8 px-4 shadow-xl border border-stone-100 sm:rounded-2xl sm:px-10"
        >
          {/* Header depending on state */}
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-stone-900">
              {mode === "login" && "Acesse sua conta"}
              {mode === "signup" && "Criar nova conta"}
              {mode === "forgot" && "Recuperar senha"}
              {mode === "reset" && "Redefinir sua senha"}
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              {mode === "login" && "Entre para acessar seus agendamentos e finanças"}
              {mode === "signup" && "Comece grátis e otimize seu tempo de atendimento"}
              {mode === "forgot" && "Informe seu e-mail para receber as instruções"}
              {mode === "reset" && "Defina uma nova senha forte de acesso"}
            </p>
          </div>

          {(authContextError || formError) && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span className="font-medium">{formError || authContextError}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleAuthAction}>
            {/* SIGNUP FIELDS */}
            {mode === "signup" && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Ana Carolina Silva"
                      className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                    Nome da Empresa / Clínica <span className="text-stone-450 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                      <Briefcase className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={empresa}
                      onChange={(e) => setEmpresa(e.target.value)}
                      placeholder="Ex: Carolina Estética"
                      className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                    Celular / WhatsApp *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      required
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                      placeholder="Ex: 11999998888"
                      className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </>
            )}

            {/* EMAIL FIELD (Common to login, signup, forgot) */}
            {mode !== "reset" && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                  {mode === "login" ? "E-mail ou Usuário" : "E-mail *"}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ex: contato@clinica.com"
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* PASSWORD FIELD (Common to login, signup, reset) */}
            {mode !== "forgot" && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                  {mode === "reset" ? "Nova Senha" : "Senha"}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="******"
                    className="pl-10 pr-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="text-[10px] text-stone-450 mt-1 font-medium">
                    A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.
                  </p>
                )}
              </div>
            )}

            {/* CONFIRM PASSWORD (Signup or Reset) */}
            {(mode === "signup" || mode === "reset") && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="******"
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* LOGIN CONVENIENCE OPTIONS */}
            {mode === "login" && (
              <div className="flex items-center justify-between mt-1 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center text-stone-600 font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-3.5 w-3.5 cursor-pointer"
                    />
                    Lembrar meu e-mail
                  </label>
                  <label className="inline-flex items-center text-stone-600 font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={stayConnected}
                      onChange={(e) => setStayConnected(e.target.checked)}
                      className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-3.5 w-3.5 cursor-pointer"
                    />
                    Permanecer conectado
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setFormError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors focus:outline-none cursor-pointer self-start"
                >
                  Esqueci minha senha
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 cursor-pointer flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-all disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {loading ? "Processando..." : (
                <>
                  {mode === "login" && "Entrar no Sistema"}
                  {mode === "signup" && "Criar Minha Conta"}
                  {mode === "forgot" && "Solicitar Link de Recuperação"}
                  {mode === "reset" && "Atualizar Minha Senha"}
                </>
              )}
            </button>
          </form>

          {/* TOGGLE MODES */}
          <div className="mt-5 text-center border-t border-stone-100 pt-4">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setFormError(null);
                  setSuccessMsg(null);
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors focus:outline-none cursor-pointer"
              >
                Não possui uma conta? Cadastre-se grátis
              </button>
            )}

            {(mode === "signup" || mode === "forgot" || mode === "reset") && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setFormError(null);
                  setSuccessMsg(null);
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1.5 transition-colors focus:outline-none cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o Login
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
