/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { User, Phone, Briefcase, Mail, Lock, Eye, EyeOff, Save, CheckCircle, ShieldAlert, Sparkles, AlertCircle, LogOut } from "lucide-react";

export const MyAccountScreen: React.FC = () => {
  const { user, updateProfile, logout } = useAuth();
  
  // Local state
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setNome(user.nome || "");
      setEmpresa(user.empresa || "");
      setCelular(user.celular || "");
      setEmail(user.email || "");
      setFotoUrl(user.foto_url || "");
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!nome.trim()) {
        throw new Error("O nome completo é obrigatório.");
      }
      if (!celular.trim()) {
        throw new Error("O celular de contato é obrigatório.");
      }

      const payload: any = {
        nome: nome.trim(),
        empresa: empresa.trim() || null,
        celular: celular.trim(),
        foto_url: fotoUrl.trim() || null,
      };

      // Handle official email change if modified
      if (email.trim().toLowerCase() !== user?.email?.toLowerCase()) {
        if (!email.includes("@")) throw new Error("Insira um endereço de e-mail válido.");
        payload.email = email.trim().toLowerCase();
      }

      // Handle password change if filled
      if (novaSenha) {
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
        payload.password = novaSenha;
      }

      await updateProfile(payload);
      
      setSuccess("Perfil atualizado com sucesso! Alterações de e-mail ou senha exigem validação em sua caixa de entrada.");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar dados do perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-stone-950">
            Minha Conta
          </h1>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Gerencie suas informações pessoais, empresa, foto de perfil e senha de acesso.
          </p>
        </div>
        
        {/* Plan Status Pill */}
        {user?.role !== "master" && (
          <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-rose-50 border border-rose-100 rounded-xl">
            <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="text-left">
              <p className="text-[10px] text-rose-450 uppercase font-bold tracking-wider leading-none">Plano Atual</p>
              <p className="text-xs text-rose-700 font-bold mt-1 leading-none">
                {user?.plano_atual} • <span className="text-emerald-600 font-extrabold">{user?.status || "Ativo"}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Picture Box */}
        <div className="bg-white rounded-2xl border border-stone-150 p-6 flex flex-col items-center justify-center text-center shadow-sm h-fit">
          <div className="relative group">
            <div className="w-28 h-28 rounded-full overflow-hidden bg-stone-100 border-2 border-rose-500 flex items-center justify-center shadow-md relative">
              {fotoUrl ? (
                <img src={fotoUrl} alt={nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-3xl font-serif text-rose-600 font-bold uppercase">
                  {nome ? nome.charAt(0) : "?"}
                </span>
              )}
            </div>
            
            <label className="absolute inset-0 bg-black/50 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              Alterar Foto
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>
          
          <h3 className="mt-4 font-bold text-stone-900 text-sm leading-tight">{nome || "Seu Nome"}</h3>
          <p className="text-xs text-stone-450 mt-1 capitalize font-semibold tracking-wide">
            {user?.role === "master" ? "Administrador Master" : "Membro SaaS"}
          </p>
          <div className="mt-5 pt-4 border-t border-stone-100 w-full text-center space-y-4">
            <div>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Acesso ao Painel</p>
              <p className="text-xs text-stone-600 font-mono mt-1 font-semibold">{user?.username}</p>
            </div>
            
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer transition-all md:hidden"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair do Painel
            </button>
          </div>
        </div>

        {/* Details Form Grid */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-stone-150 p-6 shadow-sm space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-semibold">{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                Nome Completo
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="pl-9 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                Clínica / Empresa
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                  <Briefcase className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="pl-9 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                Celular / WhatsApp
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  type="tel"
                  required
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  className="pl-9 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                E-mail Cadastrado
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 pt-5 mt-5">
            <h3 className="text-xs font-bold text-stone-800 tracking-wide uppercase mb-3 inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-stone-500" /> Alterar Senha de Acesso
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                  Nova Senha <span className="text-stone-400 font-normal">(Mín. 8 caracteres)</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="******"
                    className="pl-9 pr-10 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="******"
                    className="pl-9 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 cursor-pointer bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
