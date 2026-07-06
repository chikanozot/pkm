/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { motion } from "motion/react";
import { Lock, User, Sparkles, AlertCircle } from "lucide-react";

export const AuthScreen: React.FC = () => {
  const { login, signup, error } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        if (!name.trim()) {
          throw new Error("Por favor, insira seu nome profissional.");
        }
        await signup(username, password, name);
      }
    } catch (err: any) {
      setFormError(err.message || "Ocorreu um erro no formulário.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-rose-100/40 blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[35rem] h-[35rem] rounded-full bg-stone-200/50 blur-3xl -z-10" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-100 text-rose-600 mb-4 shadow-sm border border-rose-200/50">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-stone-900">
          PKM Embelezamento
        </h1>
        <p className="mt-2 text-stone-500 font-medium tracking-wide text-xs uppercase">
          Sistema de Gestão Profissional
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white/80 backdrop-blur-md py-8 px-4 shadow-xl border border-stone-100 sm:rounded-2xl sm:px-10"
        >
          {(error || formError) && (
            <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span className="font-medium">{formError || error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  Nome Profissional / Clínica
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
                    placeholder="Ex: Dra. Carolina Silveira"
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                Usuário (Username)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="zotgod ou seu_usuario"
                  className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                Senha
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="******"
                  className="pl-10 block w-full rounded-xl border border-stone-200 bg-white/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 cursor-pointer flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-all disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {loading ? "Processando..." : isLogin ? "Entrar na Agenda" : "Criar Minha Conta"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setFormError(null);
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors focus:outline-none cursor-pointer"
            >
              {isLogin ? "Não possui uma conta? Cadastre-se gratuitamente" : "Já possui conta? Faça login"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
