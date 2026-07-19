/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { motion } from "motion/react";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, LogOut } from "lucide-react";
import { LumoraLogo } from "./LumoraLogo";

export const ForcePasswordChangeScreen: React.FC = () => {
  const { user, updateProfile, logout } = useAuth();
  
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!novaSenha) {
        throw new Error("A nova senha é obrigatória.");
      }
      if (novaSenha.length < 8) {
        throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
      }
      if (!/[A-Z]/.test(novaSenha)) {
        throw new Error("A nova senha deve conter pelo menos uma letra maiúscula.");
      }
      if (!/[0-9]/.test(novaSenha)) {
        throw new Error("A nova senha deve conter pelo menos um número.");
      }
      if (novaSenha !== confirmarSenha) {
        throw new Error("As senhas informadas não coincidem.");
      }

      await updateProfile({ password: novaSenha });
      setSuccess("Senha atualizada com sucesso! Redirecionando para o Lumora Flow...");
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-rose-100/30 blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[35rem] h-[35rem] rounded-full bg-stone-200/40 blur-3xl -z-10" />

      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-4 flex flex-col items-center">
          <LumoraLogo size="lg" showBg={true} />
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-stone-900 mt-4">Alteração Obrigatória</h1>
          <p className="text-xs text-stone-500 tracking-wider font-semibold uppercase mt-1">Primeiro acesso ao Lumora Flow</p>
        </div>

        {/* Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-stone-200 p-8 shadow-xl space-y-6"
        >
          <div className="text-center space-y-2">
            <p className="text-xs text-stone-600 leading-relaxed">
              Olá <strong>{user?.nome}</strong>, seu usuário foi criado manualmente por um administrador. Por motivos de segurança, você deve definir sua nova senha de acesso pessoal.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div className="space-y-1.5">
              <label className="text-stone-700 text-[11px] font-bold uppercase tracking-wider block">
                Nova Senha Pessoal
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  disabled={saving || !!success}
                  placeholder="Mínimo de 8 caracteres"
                  className="w-full pl-10 pr-10 py-2.5 bg-stone-50 hover:bg-stone-100/50 focus:bg-white text-stone-900 border border-stone-200 focus:border-rose-500 rounded-xl text-xs font-medium transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-stone-700 text-[11px] font-bold uppercase tracking-wider block">
                Confirme a Nova Senha
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  disabled={saving || !!success}
                  placeholder="Repita a nova senha"
                  className="w-full pl-10 pr-10 py-2.5 bg-stone-50 hover:bg-stone-100/50 focus:bg-white text-stone-900 border border-stone-200 focus:border-rose-500 rounded-xl text-xs font-medium transition-all outline-none"
                />
              </div>
            </div>

            {/* Password guidelines */}
            <div className="p-3 bg-stone-50 border border-stone-150 rounded-xl text-[10px] text-stone-500 space-y-1">
              <p className="font-bold uppercase text-[9px] tracking-wider text-stone-700 mb-1">Diretrizes para senha forte:</p>
              <p className={novaSenha.length >= 8 ? "text-emerald-600 font-medium" : ""}>• Mínimo de 8 caracteres</p>
              <p className={/[A-Z]/.test(novaSenha) ? "text-emerald-600 font-medium" : ""}>• Pelo menos uma letra maiúscula (A-Z)</p>
              <p className={/[0-9]/.test(novaSenha) ? "text-emerald-600 font-medium" : ""}>• Pelo menos um número (0-9)</p>
            </div>

            <button
              type="submit"
              disabled={saving || !!success}
              className="w-full bg-rose-600 text-white font-bold text-xs py-3 px-4 rounded-xl hover:bg-rose-700 active:scale-98 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-300 disabled:cursor-not-allowed disabled:scale-100"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Salvando Senha...
                </>
              ) : (
                "Definir Senha & Acessar"
              )}
            </button>
          </form>

          <div className="border-t border-stone-150 pt-4 flex justify-center">
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 text-stone-500 hover:text-red-500 font-bold text-xs cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
