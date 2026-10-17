import { useMemo } from "react";
import { useAccounts } from "./use-accounts";

/**
 * The "Name" field on a Cash Receipt / Cash Payment is a party name, not an
 * account id. It can be any customer, supplier, employee or broker that the
 * business transacts with, so we expose those account types as a single
 * searchable list. Bank / system / ledger accounts are deliberately excluded:
 * they are settlement destinations, not counterparties.
 */
const PARTY_TYPES = ["customer", "supplier", "employee", "broker"] as const;

export function usePartyNames() {
  const { data: accounts = [], ...rest } = useAccounts();

  const names = useMemo(() => {
    return accounts
      .filter((a) => (PARTY_TYPES as readonly string[]).includes(a.type) && a.isActive !== false)
      .map((a) => a.name)
      .sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const options = useMemo(() => {
    return accounts
      .filter((a) => (PARTY_TYPES as readonly string[]).includes(a.type) && a.isActive !== false)
      .map((a) => ({
        value: a.name,
        label: a.name,
        sublabel: a.type,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [accounts]);

  return { names, options, accounts, ...rest };
}

export type PartyName = string;