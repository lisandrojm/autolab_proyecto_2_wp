import { useState, useRef, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCamera, faImage, faTimes, faShoppingCart, faPlus, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapOrderStatusToStatusTypeForMobile, mapDocumentStateToStatusType, mapSignatureStateToStatusType, isOrderInFinalState } from "../../../../utils/statusHelpers";
import { ViewType } from "../types";
import { useOrders } from "../hooks/useOrders";
import axios from "../../../../api/axiosConfig";
import { OrderConfig } from "../../../../api/orderConfig";
import { DynamicCategoryInput } from "../components/DynamicCategoryInput";
import { sweetAlert } from "../utils/sweetAlert";
import OrderDetailModal from "../components/OrderDetailModal";
import { OrderData } from "../../../../api/personnel";
import { getOrderNumber, getCategoryName, getSubcategoriesArray } from "../utils/orderHelpers";
import { InfoModal } from "../../../../components/ui/InfoModal";
import { useProfile } from "../hooks/useProfile";
import { orderConfigAPI } from "../../../../api/orderConfig";

interface OrdersProps {
  onNavigate: (view: ViewType) => void;
}

interface ContractDayRule {
  contractId: number;
  contractName: string;
  saturday: boolean;
  sunday: boolean;
  holiday: boolean;
}

export default function Orders({ onNavigate }: OrdersProps) {
  const { orders, loading, createOrder, updateOrderStatus, refetch } = useOrders();
  const { profile } = useProfile(); // Get user profile
  const [showForm, setShowForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categories, setCategories] = useState<OrderConfig[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // 👉 Nuevo estado para el Info Modal
  const [showSignatureInfo, setShowSignatureInfo] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [subcategories, setSubcategories] = useState<string>("");
  const [dynamicValue, setDynamicValue] = useState<any>("");
  const [amount, setAmount] = useState<number>(0);
  const [actionCompleted, setActionCompleted] = useState(false);
  const [futureActionPlazoDias, setOrderFutureActionPlazoDias] = useState<number | undefined>(undefined);
  const [futureActionFechaLimite, setOrderFutureActionFechaLimite] = useState("");
  const [futureActionDocumento, setOrderFutureActionDocumento] = useState("");

  const [orderSettings, setOrderSettings] = useState<{ contractRules: ContractDayRule[] } | null>(null);

  const selectedCategory = categories.find((c) => c._id === selectedCategoryId) || null;

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        const { data } = await axios.get<OrderConfig[]>("/order-config", { params: { isActive: true } });
        setCategories(data.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
        if (data.length > 0) {
          setSelectedCategoryId(data[0]._id);
        }
      } catch (err) {
        console.error("Error loading categories:", err);
      } finally {
        setLoadingCategories(false);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await orderConfigAPI.getSettings();
        setOrderSettings(settings);
      } catch (error) {
        console.error("Error loading order settings:", error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    setSubcategories("");

    if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
      setDynamicValue({ fechaDesde: "", fechaHasta: "" });
    } else if (selectedCategory?.categoryType === "fecha") {
      setDynamicValue("");
    } else if (selectedCategory?.categoryType === "dinero") {
      setAmount(0);
      setDynamicValue("");
    } else {
      setDynamicValue("");
    }

    setActionCompleted(false);

    if (selectedCategory?.deadlineMode === "plazoDias" && selectedCategory.plazoDias) {
      setOrderFutureActionPlazoDias(selectedCategory.plazoDias);
    } else {
      setOrderFutureActionPlazoDias(undefined);
    }

    setOrderFutureActionFechaLimite("");
    setOrderFutureActionDocumento("");

    if (selectedCategory && selectedCategory.categoryType !== "objeto" && selectedCategory.categoryType !== "otros") {
      setPhoto(null);
      setPhotoPreview(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }

    setDocument(null);
    setDocumentPreview(null);
  }, [selectedCategoryId, selectedCategory]);

  const [detectedContractName, setDetectedContractName] = useState<string | null>(null);

  const getContractRule = useCallback((): ContractDayRule | null => {
    if (!profile || !orderSettings?.contractRules) return null;

    const normalize = (s: string) => s?.trim().toLowerCase() || "";

    // Helper to find rule by string name
    const findRuleByName = (name: string) => {
      const n = normalize(name);
      return orderSettings.contractRules.find((r) => normalize(r.contractName) === n);
    };

    // 1. Try metadata projects - PRIORITIZE ACTIVE CONTRACTS
    if (profile.metadata?.projects && profile.metadata.projects.length > 0) {
      for (const project of profile.metadata.projects) {
        if (project.contracts && project.contracts.length > 0) {
          // Sort contracts: active ones first
          const sortedContracts = [...project.contracts].sort((a, b) => {
            const endA = a.fecha_baja_contrato ? new Date(a.fecha_baja_contrato).getTime() : Infinity;
            const endB = b.fecha_baja_contrato ? new Date(b.fecha_baja_contrato).getTime() : Infinity;
            const now = new Date().getTime();
            const activeA = endA >= now;
            const activeB = endB >= now;
            if (activeA && !activeB) return -1;
            if (!activeA && activeB) return 1;
            return 0;
          });

          for (const contract of sortedContracts) {
            const endDate = contract.fecha_baja_contrato ? new Date(contract.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            const isActive = !endDate || endDate.getTime() >= new Date().getTime();

            // Check ID
            if (contract.contractId || contract.id) {
              const rule = orderSettings.contractRules.find((r) => r.contractId === contract.contractId || r.contractId === contract.id);
              if (rule && isActive) {
                setDetectedContractName(rule.contractName);
                return rule;
              }
            }

            // Check Name variations
            const name = contract.contractName || contract.name || contract.nombre_contrato || contract.tipo_contrato;
            if (name) {
              const rule = findRuleByName(name);
              if (rule && isActive) {
                setDetectedContractName(rule.contractName);
                return rule;
              }
            }
          }
        }
      }
    }

    // 2. Fallback to externalInfo
    if (profile.externalInfo?.contracts && profile.externalInfo.contracts.length > 0) {
      for (const contractName of profile.externalInfo.contracts) {
        const rule = findRuleByName(contractName);
        if (rule) {
          setDetectedContractName(rule.contractName);
          return rule;
        }
      }
    }

    setDetectedContractName(null);
    return null;
  }, [profile, orderSettings]);

  const getUserSalary = useCallback((): number | undefined => {
    if (!profile?.metadata?.projects) return undefined;

    for (const project of profile.metadata.projects) {
      if (project.contracts && project.contracts.length > 0) {
        // Sort contracts: active ones first
        const sortedContracts = [...project.contracts].sort((a, b) => {
          const endA = a.fecha_baja_contrato ? new Date(a.fecha_baja_contrato).getTime() : Infinity;
          const endB = b.fecha_baja_contrato ? new Date(b.fecha_baja_contrato).getTime() : Infinity;
          const now = new Date().getTime();
          const activeA = endA >= now;
          const activeB = endB >= now;
          if (activeA && !activeB) return -1;
          if (!activeA && activeB) return 1;
          return 0;
        });

        for (const contract of sortedContracts) {
          const endDate = contract.fecha_baja_contrato ? new Date(contract.fecha_baja_contrato) : null;
          if (endDate) endDate.setHours(23, 59, 59, 999);
          const isActive = !endDate || endDate.getTime() >= new Date().getTime();

          if (isActive && contract.sueldo_mano) {
            const rawSalary = String(contract.sueldo_mano).replace(/[,.]/g, ""); // Convert things like "1.000,00" or similar to parsing ready if needed. Assuming it's typically a number, just safely parse
            const num = parseFloat(rawSalary);
            if (!isNaN(num)) return num;
          }
        }
      }
    }
    return undefined;
  }, [profile]);

  // Update detected name when dependencies change
  useEffect(() => {
    getContractRule();
  }, [getContractRule]);

  // Hardcoded holidays for Argentina/General (Extend as needed)
  // Format: "MM-DD" to apply to any year, or "YYYY-MM-DD" for specific
  const HOLIDAYS = [
    "01-01", // Año Nuevo
    "02-12", // Carnaval
    "02-13", // Carnaval
    "03-24", // Día de la Memoria
    "04-02", // Malvinas
    "05-01", // Día del Trabajador
    "05-25", // Revolución de Mayo
    "06-20", // Belgrano
    "07-09", // Independencia
    "08-17", // San Martín
    "10-12", // Diversidad Cultural
    "11-20", // Soberanía
    "12-08", // Inmaculada Concepción
    "12-25", // Navidad
  ];

  const isHoliday = (date: Date): boolean => {
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const formatted = `${month}-${day}`;
    // Also check full date if needed (e.g. variable holidays like Easter)
    return HOLIDAYS.includes(formatted);
  };

  const validateDate = (date: Date): { valid: boolean; message?: string } => {
    const rule = getContractRule();

    const day = date.getDay();
    const isSat = day === 6;
    const isSun = day === 0;
    const isHol = isHoliday(date);

    if (rule) {
      if (isSat && !rule.saturday) return { valid: false, message: "Sábados no habilitados por contrato." };
      if (isSun && !rule.sunday) return { valid: false, message: "Domingos no habilitados por contrato." };
      if (isHol && !rule.holiday) return { valid: false, message: "Feriados no habilitados por contrato." };
    } else {
      // Default: Block weekends and holidays if no rule is found
      if (isSat) return { valid: false, message: "Sábados no habilitados por defecto." };
      if (isSun) return { valid: false, message: "Domingos no habilitados por defecto." };
      if (isHol) return { valid: false, message: "Feriados no habilitados por defecto." };
    }

    return { valid: true };
  };

  const getNextWorkingDay = (startDate: Date): Date => {
    const rule = getContractRule();
    const next = new Date(startDate);

    // Advance at least 1 day
    next.setDate(next.getDate() + 1);

    // Limit iterations to avoid infinite loop
    let attempts = 0;
    while (attempts < 365) {
      const day = next.getDay();
      const isSat = day === 6;
      const isSun = day === 0;
      const isHol = isHoliday(next); // Placeholder

      let isAllowed = true;
      if (rule) {
        if (isSat && !rule.saturday) isAllowed = false;
        if (isSun && !rule.sunday) isAllowed = false;
        if (isHol && !rule.holiday) isAllowed = false;
      } else {
        // Default logic if no rule: Skip weekends and holidays
        if (isSat || isSun || isHol) isAllowed = false;
      }

      if (isAllowed) return next;

      next.setDate(next.getDate() + 1);
      attempts++;
    }
    return next;
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      sweetAlert.warning("Imagen muy grande", "La imagen debe ser menor a 10MB");
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const shouldIncludePhoto = selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros";

      let validDynamicValue: any = undefined;

      if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
        if (!dynamicValue?.fechaDesde || !dynamicValue?.fechaHasta) {
          await sweetAlert.warning("Campos incompletos", "Debes completar ambas fechas");
          setSubmitting(false);
          return;
        }
        validDynamicValue = {
          fechaDesde: dynamicValue.fechaDesde.trim(),
          fechaHasta: dynamicValue.fechaHasta.trim(),
        };
      } else if (dynamicValue !== "" && dynamicValue !== null && dynamicValue !== undefined) {
        validDynamicValue = dynamicValue;
      }

      const isDocumentType = selectedCategory?.futureActionType === "documento";

      const parseLocalDate = (dateVal: any): Date => {
        if (typeof dateVal === "string" && dateVal.includes("-")) {
          const [year, month, day] = dateVal.split("-").map(Number);
          return new Date(year, month - 1, day);
        }
        return new Date(dateVal);
      };

      const calculateRequestedDays = (): number => {
        if (!selectedCategory || selectedCategory.categoryType !== "fecha") return 0;

        let start: Date;
        let end: Date;

        const isRange = selectedCategory.dateMode === "range" || (validDynamicValue && typeof validDynamicValue === "object" && "fechaDesde" in validDynamicValue && "fechaHasta" in validDynamicValue);

        if (isRange) {
          if (!validDynamicValue?.fechaDesde || !validDynamicValue?.fechaHasta) return 0;
          start = parseLocalDate(validDynamicValue.fechaDesde);
          end = parseLocalDate(validDynamicValue.fechaHasta);

          let count = 0;
          let curr = new Date(start);
          const MAX_DAYS = 365;
          let loops = 0;

          while (curr <= end && loops < MAX_DAYS) {
            if (validateDate(curr).valid) {
              count++;
            }
            curr.setDate(curr.getDate() + 1);
            loops++;
          }
          return count;
        } else {
          // Single or Multiple discrete dates
          if (!validDynamicValue) return 0;

          if (Array.isArray(validDynamicValue)) {
            let count = 0;
            for (const d of validDynamicValue) {
              const dt = parseLocalDate(d);
              if (!isNaN(dt.getTime()) && validateDate(dt).valid) {
                count++;
              }
            }
            return count;
          } else {
            start = parseLocalDate(validDynamicValue);
            return validateDate(start).valid ? 1 : 0;
          }
        }
      };

      const daysRequested = calculateRequestedDays();

      const orderData = {
        description,
        category: selectedCategory?.name || "other",
        categoryId: selectedCategoryId,
        subcategories: subcategories ? [subcategories] : undefined,
        dynamicValue: validDynamicValue,
        amount: selectedCategory?.categoryType === "dinero" ? amount : undefined,
        actionCompleted: selectedCategory?.requiresAction ? (selectedCategory?.requiresUserConfirmation ? actionCompleted : true) : undefined,
        futureActionPlazoDias: futureActionPlazoDias || undefined,
        futureActionFechaLimite: futureActionFechaLimite || undefined,
        futureActionDocumento: futureActionDocumento || undefined,
        photo: shouldIncludePhoto ? photo : null,
        document: isDocumentType ? document : null,
        daysRequested: daysRequested > 0 ? daysRequested : undefined,
      };

      if (selectedCategory?.informacion?.trim()) {
        setSubmitting(false);
        const result = await sweetAlert.confirmOrder(selectedCategory.informacion);
        if (!result.isConfirmed) return;
        setSubmitting(true);
      }

      if (selectedCategory?.requiresAction && selectedCategory?.futureActionType === "documento" && !document) {
        setSubmitting(false);
        // @ts-ignore - alert method added dynamically
        const result = await sweetAlert.alert("Atención", "Para que este pedido se realice tiene que subir el documento en cuanto cuente con el mismo.", "warning", "Entendido");
        if (!result.isConfirmed) {
          setSubmitting(false); // Make sure it stays false
          return;
        }
        setSubmitting(true);
      }

      await createOrder(orderData);

      await sweetAlert.success("¡Pedido creado!", "Tu pedido ha sido enviado correctamente");

      setShowForm(false);
      setDescription("");
      setSubcategories("");
      setDynamicValue("");
      setAmount(0);
      setActionCompleted(false);
      setOrderFutureActionFechaLimite("");
      setOrderFutureActionDocumento("");
      setPhoto(null);
      setPhotoPreview(null);
      setDocument(null);
      setDocumentPreview(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || "Error al crear pedido";
      const isRetryable = errorMessage.includes("número de pedido único") || errorMessage.includes("duplicate key");

      const result = await sweetAlert.error("Error al crear pedido", isRetryable ? "Hubo un problema generando el número de pedido. ¿Deseas intentar nuevamente?" : errorMessage, isRetryable ? "Reintentar" : undefined);

      if (isRetryable && result.isConfirmed) {
        return handleSubmit(e);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getUsedDays = (catId: string, subId?: string): number => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return orders
      .filter((o) => {
        // Handle populated vs string ID
        const oCatId = typeof o.categoryId === "object" && o.categoryId ? o.categoryId._id : o.categoryId;
        const matchesCat = oCatId === catId;
        const matchesSub = subId ? o.subcategories?.includes(subId) : true;
        // Check active status
        const isActive = ["pending", "approved", "delivered", "pre_approved"].includes(o.status);
        const isCurrentYear = new Date(o.requestedAt) >= startOfYear;

        return matchesCat && matchesSub && isActive && isCurrentYear;
      })
      .reduce((sum, o) => sum + (o.daysRequested || 0), 0);
  };

  const handleOrderClick = (order: OrderData) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const currentOrderIndex = selectedOrder ? orders.findIndex((o) => o._id === selectedOrder._id) : -1;

  const handleNavigateOrder = (direction: "prev" | "next") => {
    if (direction === "prev" && currentOrderIndex > 0) {
      setSelectedOrder(orders[currentOrderIndex - 1]);
    } else if (direction === "next" && currentOrderIndex < orders.length - 1) {
      setSelectedOrder(orders[currentOrderIndex + 1]);
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faShoppingCart} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Nuevo Pedido</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form id="order-form" onSubmit={handleSubmit} className="overflow-y-auto p-4">
                <div className="space-y-4">
                  {/* Debug Contract Badge */}
                  {detectedContractName && <div className="mb-4 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Contrato: {detectedContractName}</div>}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de pedido</label>

                    {loadingCategories ? (
                      <div className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-500 dark:text-slate-400">Cargando categorías...</div>
                    ) : categories.length > 0 ? (
                      <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat._id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-red-600 dark:text-red-400 text-sm">No hay "Tipos de pedido" disponibles. Contacta al administrador.</div>
                    )}

                    <div className="pt-3">
                      {(() => {
                        let remainingDays: number | undefined = undefined;
                        if (selectedCategory?.categoryType === "fecha") {
                          let max = selectedCategory.maxDays;
                          let subIdForUsage: string | undefined = undefined;

                          if (subcategories && selectedCategory.config?.subtipos) {
                            const subId = subcategories;
                            const sub = selectedCategory.config.subtipos.find((s: any) => s.id === subId);
                            if (sub && sub.maxDays) {
                              max = sub.maxDays;
                              subIdForUsage = subId;
                            }
                          }

                          if (typeof max === "number") {
                            const used = subIdForUsage ? getUsedDays(selectedCategory._id, subIdForUsage) : getUsedDays(selectedCategory._id);
                            remainingDays = Math.max(0, max - used);
                          }
                        }

                        return <DynamicCategoryInput category={selectedCategory} subcategories={subcategories} onSubcategoriesChange={setSubcategories} dynamicValue={dynamicValue} onDynamicValueChange={setDynamicValue} amount={amount} onAmountChange={setAmount} actionCompleted={actionCompleted} onActionCompletedChange={setActionCompleted} futureActionPlazoDias={futureActionPlazoDias} onOrderFutureActionPlazoDiasChange={setOrderFutureActionPlazoDias} futureActionFechaLimite={futureActionFechaLimite} onOrderFutureActionFechaLimiteChange={setOrderFutureActionFechaLimite} futureActionDocumento={futureActionDocumento} onOrderFutureActionDocumentoChange={setOrderFutureActionDocumento} document={document} onDocumentChange={setDocument} documentPreview={documentPreview} onDocumentPreviewChange={setDocumentPreview} validateDate={validateDate} getNextWorkingDay={getNextWorkingDay} remainingDays={remainingDays} userSalary={getUserSalary()} />;
                      })()}
                    </div>

                    {/* Show Remaining Days Logic */}
                    {(() => {
                      if (selectedCategory?.categoryType !== "fecha") return null;

                      let max = selectedCategory.maxDays;
                      let label = "Total anual";
                      let used = 0;
                      let subIdForUsage: string | undefined = undefined;

                      // Check subtype
                      if (subcategories && selectedCategory.config?.subtipos) {
                        // subcategories is string here based on DynamicCategoryInput typical usage (single select usually), but let's be careful
                        // Actually in DynamicCategoryInput prop types: subcategories: string. So it's single select ID.
                        const subId = subcategories;
                        const sub = selectedCategory.config.subtipos.find((s: any) => s.id === subId);

                        if (sub) {
                          if (sub.maxDays) {
                            max = sub.maxDays;
                            label = sub.label || subId;
                            subIdForUsage = subId;
                          } else {
                            // If subtype has no limit, fallback to global max
                            // Label remains Global?
                          }
                        }
                      }

                      if (subIdForUsage) {
                        used = getUsedDays(selectedCategory._id, subIdForUsage);
                      } else {
                        // Global usage (any subtype or none)?
                        // Logic: if max is global, we should count ALL orders in this category?
                        // Yes, usually "Total Annual Days for Study Leave" = X, regardless of subtype options if defined globally.
                        used = getUsedDays(selectedCategory._id);
                      }

                      if (max) {
                        const remaining = Math.max(0, max - used);
                        return (
                          <div className="mt-4 mb-2 flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                            <div>
                              <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">{label}</p>
                              <p className="text-xs text-blue-700 dark:text-blue-300">
                                Días utilizados: {used} / {max}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{remaining}</p>
                              <p className="text-[10px] uppercase font-bold text-blue-500 dark:text-blue-500">Restantes</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Comentario (Opcional)</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded border bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 resize-none" placeholder="Escribí tu comentario..." />
                  </div>

                  {/* Bloque REQUIERE FIRMA con Info Modal */}
                  {selectedCategory?.requiresSignature && (
                    <div onClick={() => setShowSignatureInfo(true)} className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors">
                      <span className="font-bold text-sm">Requiere FIRMA</span>
                      <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                    </div>
                  )}

                  {(selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros") && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Foto (opcional)</label>
                      {photoPreview ? (
                        <div className="relative rounded overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                          <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                          <button type="button" onClick={handleRemovePhoto} className="absolute top-2 right-2 p-2 rounded bg-red-500 text-white">
                            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                          <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed py-4 px-3">
                            <FontAwesomeIcon icon={faCamera} className="w-6 h-6 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tomar Foto</span>
                          </button>

                          <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                          <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed py-4 px-3">
                            <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Subir Imagen</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  </div>
              </form>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" form="order-form" disabled={submitting} className="flex-1 rounded h-10 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
                    {submitting ? "Enviando..." : "Enviar Pedido"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <h3 className="text-lg font-bold mb-4">Historial de Pedidos</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order._id} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => handleOrderClick(order)}>
                <div className="flex flex-col items-start gap-3">
                  <div className="flex-1 w-full">
                    <div className="flex flex-col items-start justify-between mb-2 w-full space-y-2">
                      <div className="flex justify-between gap-2 items-center w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block px-2 py-0.5 text-[12px] text-gray-400 dark:text-gray-400 bg-blue-50 dark:bg-gray-600/20 rounded">{getOrderNumber(order.orderNumber)}</span>

                          <StatusBadge type={mapOrderStatusToStatusTypeForMobile(order.status)} size="sm" />

                          {(() => {
                            const futureAction = order.futureActions && order.futureActions.length > 0 ? order.futureActions[0] : null;
                            const docStatusType = mapDocumentStateToStatusType(futureAction);
                            const isInFinalState = isOrderInFinalState(order.status);
                            if (docStatusType) return <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />;
                            return null;
                          })()}

                          <StatusBadge type={mapSignatureStateToStatusType(order as any)} size="sm" overrideStyle={isOrderInFinalState(order.status)} />
                        </div>
                      </div>

                      <div className="flex items-center w-full">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium bg-gray-50 dark:bg-gray-600/50">{getCategoryName(order as any)}</span>

                          {getSubcategoriesArray(order as any).map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-sm bg-gray-50 dark:bg-gray-600/20">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400">{new Date(order.requestedAt).toLocaleDateString("es-ES")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border bg-slate-50 p-8 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes pedidos registrados</p>
          </div>
        )}
      </div>

      {/* 👉 Info Modal NUEVO */}
      {/* 👉 Info Modal NUEVO */}
      <InfoModal
        isOpen={showSignatureInfo}
        onClose={() => setShowSignatureInfo(false)}
        title="Firma del pedido"
        size="sm"
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowSignatureInfo(false),
            variant: "primary",
          },
        ]}
      >
        <div className="text-slate-700 dark:text-slate-300">
          <p>Si el pedido es aprobado, recibirás un email con un enlace para firmar digitalmente la aprobación. Podrás revisarlo desde cualquier dispositivo y ver el estado de la firma.</p>
        </div>
      </InfoModal>

      <OrderDetailModal
        order={selectedOrder as any}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedOrder(null);
        }}
        onStatusUpdate={updateOrderStatus}
        onRefresh={refetch}
        currentIndex={currentOrderIndex}
        totalOrders={orders.length}
        onNavigate={handleNavigateOrder}
      />

      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-opacity-90 p-4" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-4 p-2 rounded bg-red-500 text-white shadow-lg">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl" />
          </div>
        </div>
      )}

      {/* Floating Action Button for New Order */}
      {/* Floating Action Button for New Order */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button onClick={() => setShowForm(true)} disabled={loading} className="pointer-events-auto flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100" title="Nuevo Pedido">
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
