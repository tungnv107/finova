import { createContext, type Dispatch, type SetStateAction } from "react";

export const FinancialPrivacyContext = createContext<{
  showBalance: boolean;
  setShowBalance: Dispatch<SetStateAction<boolean>>;
} | null>(null);
