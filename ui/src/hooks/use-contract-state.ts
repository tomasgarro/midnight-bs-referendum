import { useEffect, useState } from "react";
import type { ContractState } from "midnight-referendum-api";
import { useMidnightProviders } from "@/providers/midnight-providers";

const CONTRACT_ADDRESS = import.meta.env.VITE_MIDNIGHT_CONTRACT_ADDRESS?.trim() || null;

export interface ReferendumStateView {
  state: ContractState | null;
  loading: boolean;
  error: string | null;
}

/**
 * Live public referendum state: phase, how many voters were issued eligibility,
 * and the YES/NO/ABSTAIN aggregates.
 *
 * Read-only and wallet-free — it only needs the indexer, so results stay
 * visible to anyone opening the app, not just to someone who has voted.
 */
export function useReferendumState(): ReferendumStateView {
  const { providers } = useMidnightProviders();
  const [state, setState] = useState<ContractState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providers || !CONTRACT_ADDRESS) {
      setState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const subscription = import("midnight-referendum-api").then(({ watchReferendumState }) =>
      watchReferendumState(providers, CONTRACT_ADDRESS).subscribe({
        next: (next) => {
          if (cancelled) return;
          setState(next);
          setError(null);
          setLoading(false);
        },
        error: (err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "No se pudo leer el estado del contrato");
          setLoading(false);
        },
      }),
    );

    return () => {
      cancelled = true;
      void subscription.then((sub) => sub.unsubscribe());
    };
  }, [providers]);

  return { state, loading, error };
}
