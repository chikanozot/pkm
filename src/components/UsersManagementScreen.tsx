/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { useAuth } from "../contexts/AuthContext.js";
import { Plus, Edit, Trash2, X, AlertCircle, User, Shield, Lock } from "lucide-react";

export const UsersManagementScreen: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await databaseService.getSystemUsers();
      setUsers(data);
    } catch (err) {
      console.error("Erro ao carregar usuários", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (usr: any | null = null) => {
    setError(null);
    if (usr) {
      setEditId(usr.id);
      setUsername(usr.username);
      setPassword(""); // Leave password blank when editing unless changing it
      setNome(usr.nome);
      setRole(usr.role);
    } else {
      setEditId(null);
      setUsername("");
      setPassword("");
      setNome("");
      setRole("user");
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !nome.trim()) {
      setError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if (!editId && !password) {
      setError("A senha é obrigatória para novos usuários.");
      return;
    }

    const payload = {
      username: username.trim().toLowerCase(),
      nome: nome.trim(),
      role,
      password_hash: password // Raw password will be crypt()ed safely in Postgres via RPC
    };

    try {
      if (editId) {
        await databaseService.updateSystemUser(editId, payload);
      } else {
        await databaseService.insertSystemUser(payload);
      }
      loadUsers();
      handleCloseForm();
    } catch (err: any) {
      console.error("Erro ao salvar usuário", err);
      setError(err.message || "Erro ao salvar usuário. Certifique-se de que o username é único.");
    }
  };

  const handleDelete = async (userId: string, userUsername: string) => {
    if (currentUser && currentUser.id === userId) {
      alert("Você não pode excluir a si mesmo!");
      return;
    }

    if (userUsername === "zotgod") {
      alert("O usuário master 'zotgod' não pode ser excluído!");
      return;
    }

    const confirmed = window.confirm(`Deseja realmente excluir o usuário '${userUsername}'? Todos os dados vinculados a ele poderão ficar inacessíveis.`);
    if (!confirmed) return;

    try {
      await databaseService.deleteSystemUser(userId);
      loadUsers();
    } catch (err) {
      console.error("Erro ao deletar usuário", err);
      alert("Erro ao excluir usuário do sistema.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-stone-900">Gerenciamento de Usuários</h1>
          <p className="text-sm text-stone-500 mt-0.5">Crie novos profissionais e gerencie as permissões de acesso ao sistema.</p>
        </div>
        <button
          onClick={() => handleOpenForm(null)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Carregando usuários do sistema...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="font-serif text-lg text-stone-800 font-medium">Nenhum usuário cadastrado</p>
          <button
            onClick={() => handleOpenForm(null)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Cadastrar Usuário
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100 text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Nome Completo</th>
                  <th className="py-4 px-6">Username</th>
                  <th className="py-4 px-6">Função (Role)</th>
                  <th className="py-4 px-6">Data de Criação</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm text-stone-700">
                {users.map((usr) => (
                  <tr key={usr.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-4 px-6 font-medium text-stone-900 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs uppercase">
                        {usr.nome ? usr.nome.charAt(0) : "U"}
                      </div>
                      {usr.nome}
                    </td>
                    <td className="py-4 px-6 text-stone-500">@{usr.username}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        usr.role === "master" 
                          ? "bg-amber-50 text-amber-800 border border-amber-200/50" 
                          : "bg-stone-50 text-stone-700 border border-stone-200/50"
                      }`}>
                        {usr.role === "master" ? (
                          <>
                            <Shield className="w-3 h-3 text-amber-600" />
                            Administrador Master
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 text-stone-500" />
                            Profissional (User)
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-stone-400">
                      {usr.created_at ? new Date(usr.created_at).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => handleOpenForm(usr)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200/40 transition-all cursor-pointer"
                        title="Editar Usuário"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(usr.id, usr.username)}
                        disabled={currentUser?.id === usr.id || usr.username === "zotgod"}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Deletar Usuário"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Dialog/Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-stone-200/80 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-250">
            {/* Header */}
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-stone-900">
                {editId ? "Editar Usuário" : "Novo Usuário"}
              </h2>
              <button
                onClick={handleCloseForm}
                className="w-8 h-8 rounded-full bg-stone-50 hover:bg-stone-100 text-stone-450 hover:text-stone-700 flex items-center justify-center transition-all border border-stone-200/40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5 shadow-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  Nome Completo / Clínico *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Dra. Carolina Silveira"
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  Nome de Usuário (Username) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    disabled={editId !== null && username === "zotgod"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: carolina"
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  Função (Role)
                </label>
                <select
                  value={role}
                  disabled={editId !== null && username === "zotgod"}
                  onChange={(e) => setRole(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm disabled:opacity-50"
                >
                  <option value="user">Profissional (User)</option>
                  <option value="master">Administrador Master</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  {editId ? "Nova Senha (Deixe em branco para manter)" : "Senha *"}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required={!editId}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editId ? "******" : "Nova senha"}
                    className="pl-10 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-md cursor-pointer"
                >
                  {editId ? "Salvar Alterações" : "Criar Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
