export const AUSENCIAS_CONFIG = {
  politicasGenerales: {
    requiereAprobacionPorDefecto: true,
    noSuperponerMismoCargo: true,
    noSuperponerMismoNivel: true,
    noSuperponerUsuario: true,
    porcentajeMaximoSolapamientoEquipo: 0,
    permitirCruceEntreDistintosClientes: true,
  },

  categorias: [
    {
      id: "vacaciones",
      label: "Vacaciones",
      descripcion: "Descanso anual programado",
      subtipos: [
        {
          id: "vacaciones_anuales",
          label: "Vacaciones anuales",
          consumeSaldoVacaciones: true,
          requierePlanCobertura: true,
          requiereDocumentoAdjunto: false,
        },
        {
          id: "vacaciones_adicionales",
          label: "Días adicionales / extras",
          consumeSaldoVacaciones: false,
          requierePlanCobertura: true,
          requiereDocumentoAdjunto: false,
        },
      ],
    },

    {
      id: "licencias",
      label: "Licencias / Permisos",
      descripcion: "Ausencias especiales reguladas",
      subtipos: [
        { id: "enfermedad", label: "Enfermedad", requiereCertificado: true },
        { id: "maternidad", label: "Maternidad / Paternidad", requiereCertificado: true },
        { id: "fallecimiento", label: "Fallecimiento familiar", requiereCertificado: false },
        { id: "mudanza", label: "Mudanza", requiereCertificado: false },
        { id: "personal", label: "Personal / Administrativo", requiereCertificado: false },
      ],
    },

    {
      id: "permisos_horarios",
      label: "Permisos horarios",
      descripcion: "Ausencias parciales dentro de la jornada",
      subtipos: [
        { id: "tramites_personales", label: "Trámites personales", esParcial: true },
        { id: "estudios_medicos", label: "Estudios médicos", requiereCertificado: true, esParcial: true },
      ],
    },
  ],

  reglasSolapamiento: {
    aplicarSobre: ["vacaciones", "licencias"],
    noSuperponerMismoCargo: true,
    noSuperponerMismoNivel: true,
    incluirPermisosHorariosEnChequeo: false,
    ignorarEstados: ["rechazado", "cancelado"],
  },

  estadosPosibles: [
    { id: "pendiente", label: "Pendiente", color: "warning" },
    { id: "aprobado", label: "Aprobado", color: "success" },
    { id: "rechazado", label: "Rechazado", color: "danger" },
    { id: "cancelado", label: "Cancelado", color: "secondary" },
  ],
} as const;
