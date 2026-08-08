export type PreviewReadinessState = "demo" | "blocked" | "loading" | "ready";

export interface PreviewReadiness {
  state: PreviewReadinessState;
  label: string;
  message: string;
}

export interface PreviewReadinessInput {
  appMode: "demo" | "preview";
  contractAddress: string | null;
  walletConnected: boolean;
  providersReady: boolean;
  providersError?: string | null;
}

/**
 * Keeps Preview failures actionable before the user reaches wallet approval.
 * This is deliberately pure so the same prerequisite matrix can be used by
 * the UI, browser tests, and a future deployment smoke check.
 */
export function getPreviewReadiness(input: PreviewReadinessInput): PreviewReadiness {
  if (input.appMode === "demo") {
    return {
      state: "demo",
      label: "Prototipo local",
      message: "Esta vista permite explorar el flujo sin enviar transacciones a la red.",
    };
  }

  if (!input.contractAddress) {
    return {
      state: "blocked",
      label: "Preview requiere contrato",
      message: "Preview no está configurado: definí VITE_MIDNIGHT_CONTRACT_ADDRESS con un contrato desplegado.",
    };
  }

  if (!input.walletConnected) {
    return {
      state: "blocked",
      label: "Preview requiere wallet",
      message: "Conectá un wallet DApp Connector para aprobar y balancear la transacción.",
    };
  }

  if (input.providersError) {
    return {
      state: "blocked",
      label: "Preview no disponible",
      message: `No se pudieron preparar los proveedores de Midnight: ${input.providersError}`,
    };
  }

  if (!input.providersReady) {
    return {
      state: "loading",
      label: "Preparando Preview",
      message: "La wallet está conectada, pero los proveedores de Midnight todavía se están preparando.",
    };
  }

  return {
    state: "ready",
    label: "Preview listo",
    message: "Preview está listo para preparar una transacción real.",
  };
}
