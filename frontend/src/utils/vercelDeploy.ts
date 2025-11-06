export const triggerVercelRedeploy = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const deployHookUrl = import.meta.env.VITE_VERCEL_DEPLOY_HOOK_URL;

    if (!deployHookUrl) {
      return {
        success: false,
        message: "Deploy hook URL no configurada. Agrega VITE_VERCEL_DEPLOY_HOOK_URL a las variables de entorno.",
      };
    }

    const response = await fetch(deployHookUrl, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return {
      success: true,
      message: "Redeploy iniciado exitosamente. El despliegue tomará algunos minutos.",
    };
  } catch (error) {
    console.error("Error triggering Vercel redeploy:", error);
    return {
      success: false,
      message: `Error al iniciar redeploy: ${error instanceof Error ? error.message : "Error desconocido"}`,
    };
  }
};

export const isDeployButtonVisible = (): boolean => {
  const deployHookUrl = import.meta.env.VITE_VERCEL_DEPLOY_HOOK_URL;
  const isDevelopment = import.meta.env.DEV;
  return !!deployHookUrl && isDevelopment;
};
