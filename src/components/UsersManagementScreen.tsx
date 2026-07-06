/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { useAuth } from "../contexts/AuthContext.js";
import { Plus, Edit, Trash2, X, AlertCircle, User, Shield, Lock, Search, AlertTriangle, Check } from "lucide-react";

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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Cascade Deletion Modal states
  const [deleteModalUser, setDeleteModalUser] = useState<any | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

    // Role safety validation
    const masterCount = users.filter(u => u.role === "master").length;

    // 1. O usuário MASTER não pode remover o próprio papel de MASTER
    if (editId && editId === currentUser?.id) {
      const originalUser = users.find(u => u.id === editId);
      if (originalUser?.role === "master" && role !== "master") {
        setError("Você não pode remover o próprio papel de Administrador Master.");
        return;
      }
    }

    // 2. Deve existir sempre pelo menos um usuário MASTER
    if (editId) {
      const originalUser = users.find(u => u.id === editId);
      if (originalUser?.role === "master" && role !== "master" && masterCount <= 1) {
        setError("Não é possível alterar a função. Deve existir sempre pelo menos um Administrador Master no sistema.");
        return;
      }
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

  // Open cascade delete confirmation modal
  const handleOpenDeleteModal = (usr: any) => {
    setDeleteError(null);
    setDeleteConfirmInput("");
    setDeleteModalUser(usr);
  };

  const handleCloseDeleteModal = () => {
    setDeleteModalUser(null);
    setDeleteConfirmInput("");
    setDeleteError(null);
    setDeleting(false);
  };

  const handleExecuteDelete = async () => {
    if (!deleteModalUser) return;
    setDeleteError(null);

    // Safeguards
    if (currentUser && currentUser.id === deleteModalUser.id) {
      setDeleteError("Você não pode excluir a sua própria conta.");
      return;
    }

    if (deleteModalUser.username === "zotgod") {
      setDeleteError("O usuário administrador master 'zotgod' não pode ser excluído.");
      return;
    }

    const masterCount = users.filter(u => u.role === "master").length;
    if (deleteModalUser.role === "master" && masterCount <= 1) {
      setDeleteError("Não é possível excluir o usuário. Deve existir sempre pelo menos um Administrador Master no sistema.");
      return;
    }

    if (deleteConfirmInput.trim().toUpperCase() !== "EXCLUIR") {
      setDeleteError("Por favor, digite 'EXCLUIR' para confirmar a ação.");
      return;
    }

    setDeleting(true);
    try {
      await databaseService.deleteSystemUser(deleteModalUser.id);
      await loadUsers();
      handleCloseDeleteModal();
    } catch (err: any) {
      console.error("Erro ao deletar usuário em lote", err);
      setDeleteError(err.message || "Erro ao excluir usuário do sistema.");
    } finally {
      setDeleting(false);
    }
  };

  // Client-side search filtering
  const filteredUsers = users.filter((usr) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      (usr.nome || "").toLowerCase().includes(term) ||
      (usr.username || "").toLowerCase().includes(term)
    );
  });

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
          className="inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl transition-all shadow-md gap-2 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      {/* Search Bar / Filter */}
      <div className="bg-white rounded-2xl border border-stone-200/60 p-4 shadow-sm flex items-center max-w-md">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar usuários por nome ou username..."
            className="pl-9 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="ml-2 text-xs font-medium text-stone-400 hover:text-stone-600 px-2 py-1 bg-stone-100 rounded-lg transition-colors cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-2 text-sm text-stone-500">Carregando usuários do sistema...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200/80 p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="font-serif text-lg text-stone-800 font-medium">Nenhum usuário encontrado</p>
          <p className="text-sm text-stone-400 mt-1">Tente ajustar a sua pesquisa ou adicione um novo profissional.</p>
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
                {filteredUsers.map((usr) => (
                  <tr key={usr.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-4 px-6 font-medium text-stone-900 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {usr.nome ? usr.nome.charAt(0) : "U"}
                      </div>
                      <span className="truncate max-w-[200px]">{usr.nome}</span>
                      {currentUser?.id === usr.id && (
                        <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider scale-90">Você</span>
                      )}
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
                        onClick={() => handleOpenDeleteModal(usr)}
                        disabled={currentUser?.id === usr.id || usr.username === "zotgod"}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={currentUser?.id === usr.id ? "Você não pode excluir a sua própria conta" : usr.username === "zotgod" ? "Não é possível excluir o master zotgod" : "Deletar Usuário"}
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
                {editId !== null && username === "zotgod" && (
                  <p className="text-[10px] text-stone-400 mt-1">O username do administrador principal zotgod é fixo.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1.5">
                  Função (Role)
                </label>
                <select
                  value={role}
                  disabled={editId !== null && (username === "zotgod" || editId === currentUser?.id)}
                  onChange={(e) => setRole(e.target.value)}
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm disabled:opacity-50"
                >
                  <option value="user">Profissional (User)</option>
                  <option value="master">Administrador Master</option>
                </select>
                {editId !== null && editId === currentUser?.id && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">Você não pode remover o seu próprio papel de administrador.</p>
                )}
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

      {/* CASCADE DELETE CONFIRMATION MODAL */}
      {deleteModalUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-stone-200/80 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            {/* Warning Header Banner */}
            <div className="bg-red-50 border-b border-red-100 px-6 py-5 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-red-950">Ação Irreversível detectada</h3>
                <p className="text-xs text-red-700 mt-0.5 font-medium">Excluir usuário e dados vinculados</p>
              </div>
            </div>

            {/* Warning Body Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-stone-600 leading-relaxed">
                Você solicitou a exclusão definitiva da conta do profissional <strong className="text-stone-950 font-semibold">@{deleteModalUser.username}</strong> ({deleteModalUser.nome}).
              </p>

              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-2.5">
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">O que acontecerá com os dados?</span>
                <ul className="text-xs text-stone-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li>Todos os <strong className="text-stone-900">clientes</strong> criados por este profissional serão excluídos permanentemente.</li>
                  <li>Todos os registros de <strong className="text-stone-900">agenda e atendimentos</strong> vinculados serão deletados.</li>
                  <li>Todos os <strong className="text-stone-900">serviços</strong> de estética criados pelo usuário serão excluídos.</li>
                  <li>Todas as <strong className="text-stone-900">despesas gerais</strong> lançadas sob esta conta serão deletadas.</li>
                  <li>A conexão com o <strong className="text-stone-900">Google Calendar</strong> e integrações associadas serão desconectadas.</li>
                </ul>
              </div>

              {deleteError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5 shadow-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase">
                  Confirme a exclusão digitando "EXCLUIR" abaixo:
                </label>
                <input
                  type="text"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder="EXCLUIR"
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm placeholder-stone-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all font-semibold text-center tracking-widest text-red-600 uppercase"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="px-4 py-2.5 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={deleting || deleteConfirmInput.trim().toUpperCase() !== "EXCLUIR"}
                className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                    Excluindo registros...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir Permanentemente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
