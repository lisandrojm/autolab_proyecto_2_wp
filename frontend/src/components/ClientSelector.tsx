import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { clientsAPI, Client } from "../api/clients";
import { useAltoDisponible } from "./context/useAltoDisponible";
import { useScrollAncestroBloqueado } from "./context/useScrollAncestroBloqueado";
import { useClientContextStore } from "../stores/clientContextStore";
import { useAuthStore } from "../stores/authStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faUsers, faPlus } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { ContextChip } from "./context/ContextChip";

export const ClientSelector: React.FC = () => {
  const { selectedClient, setSelectedClient, clearSelectedClient } = useClientContextStore();
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const altoDisponible = useAltoDisponible(rootRef, isOpen);
  // Un solo scroll a la vez: con la lista abierta, el sidebar se congela.
  useScrollAncestroBloqueado(rootRef, isOpen);

  // Cierra el dropdown al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isOpen) return;
      const path = (event.composedPath && event.composedPath()) || [];
      if (rootRef.current && path.includes(rootRef.current)) return;
      setIsOpen(false);
    };

    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, [isOpen]);

  // Refrescar lista de clientes cuando se abre el dropdown
  useEffect(() => {
    if (isOpen) fetchClients();
  }, [isOpen]);

  // Actualizar lista si se emite evento externo de cambio
  useEffect(() => {
    const handler = () => {
      if (isOpen) fetchClients();
    };
    window.addEventListener("clientsChanged", handler as EventListener);
    return () => window.removeEventListener("clientsChanged", handler as EventListener);
  }, [isOpen]);

  // Validar que el selectedClient siga existiendo; si no, limpiar
  useEffect(() => {
    const validateSelected = async () => {
      if (!selectedClient?._id) return;
      try {
        await clientsAPI.get(selectedClient._id); // ✅ corrección aquí
      } catch (error) {
        console.warn("Cliente seleccionado inválido, limpiando selección:", error);
        clearSelectedClient();
        if (location.pathname.includes("/cliente/") || location.pathname.includes("/clients/")) {
          navigate("/clients");
        }
      }
    };
    validateSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?._id]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await clientsAPI.list({ limit: 100 });
      setClients(response.clients || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((client) => client.name.toLowerCase().includes(searchTerm.toLowerCase()) || client.email.toLowerCase().includes(searchTerm.toLowerCase()) || (client.company || "").toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setIsOpen(false);
    setSearchTerm("");
    navigate(`/clients/${client._id}`);
  };

  const handleClearClient = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearSelectedClient();
    setIsOpen(false);
    navigate("/clients");
  };

  const handleCreateClient = () => {
    setIsOpen(false);
    navigate("/clients?openModal=true");
  };

  return (
    <div className="relative" ref={rootRef}>
      {/* Mismo componente que el selector de Empresa: son dos ejes en paralelo, no una jerarquía. */}
      <ContextChip eje="Cliente" icono={faUsers} valor={selectedClient?.name} detalle={selectedClient?.company || undefined} placeholder="Elegir cliente" abierto={isOpen} onToggle={() => setIsOpen((v) => !v)} onLimpiar={handleClearClient} />

      {/* El alto lo pone el espacio que queda hasta el borde de la ventana, no un número fijo: ver
          `useAltoDisponible`. El buscador queda arriba y solo scrollea la lista. */}
      {isOpen && (
        <div style={{ maxHeight: altoDisponible }} className="absolute top-full left-0 right-0 mt-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="shrink-0 p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Buscar cliente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm rounded focus:outline-none border border-transparent dark:bg-blue-900/30 dark:text-white dark:border-gray-600 dark:focus:border-blue-600" autoFocus />
            </div>
          </div>

          {/* Client List */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <LoadingSpinner size="sm" message="Cargando..." />
            ) : filteredClients.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{searchTerm ? "No se encontraron clientes" : "No hay clientes disponibles"}</p>
                {!searchTerm && hasPermission("client:view") && (
                  <button onClick={handleCreateClient} className="btn-primary flex items-center justify-center mx-auto text-xs px-4 py-2 gap-2">
                    <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                    <span>Nuevo Cliente</span>
                  </button>
                )}
              </div>
            ) : (
              filteredClients.map((client) => (
                <button key={client._id} onClick={() => handleSelectClient(client)} className="w-full flex items-center space-x-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-blue-900/30 transition-colors">
                  <div className="w-5 h-5 rounded bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{client.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{client.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{client.company || client.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
