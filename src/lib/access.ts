export function isAllowedAccount(
  email?: string | null,
  verified = false,
): boolean {
  if (!verified || !email) return false;
  const normalized = email.toLowerCase();
  return (
    normalized.endsWith("@rfnsyhmi.dpdns.org") ||
    normalized.endsWith("@kitabuddy.dpdns.org") ||
    ["rfnsyhmi.principal@gmail.com", "m-10531068@moe-dl.edu.my"].includes(
      normalized,
    )
  );
}
