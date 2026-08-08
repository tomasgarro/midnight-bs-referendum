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
  /** Sponsored-relayer path: the citizen needs no wallet at all. */
  relayerMode?: boolean;
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
      label: "Solo lectura local",
      message: "El modo local permite revisar la interfaz, pero no confirma votos ni crea comprobantes. Configurá Preview para enviar una transacción real.",
    };
  }

  if (!input.contractAddress) {
    return {
      state: "blocked",
      label: "Preview requiere contrato",
      message: "Preview no está configurado: definí VITE_MIDNIGHT_CONTRACT_ADDRESS con un contrato desplegado.",
    };
  }

  // In relayer mode the fee is sponsored, so a missing wallet is not a
  // blocker — the relayer being unreachable is, and that surfaces as
  // providersError below.
  if (!input.relayerMode && !input.walletConnected) {
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
