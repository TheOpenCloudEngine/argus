/**
 * Static data for DNS Zone feature.
 */

export const recordTypes = [
  { label: "A", value: "A" },
  { label: "AAAA", value: "AAAA" },
  { label: "CNAME", value: "CNAME" },
  { label: "MX", value: "MX" },
  { label: "TXT", value: "TXT" },
  { label: "NS", value: "NS" },
  { label: "SOA", value: "SOA" },
  { label: "PTR", value: "PTR" },
  { label: "SRV", value: "SRV" },
] as const

export const recordStatuses = [
  { label: "Enabled", value: "enabled" },
  { label: "Disabled", value: "disabled" },
] as const

export const statusStyles = new Map<string, string>([
  ["enabled", "bg-primary/10 text-primary border-primary/30"],
  ["disabled", "bg-destructive/10 text-destructive border-destructive/10"],
])

/** Descriptions for each record type (used in tooltips). */
export const recordTypeDescriptions: Record<string, string> = {
  A: "Maps a domain name to an IPv4 address",
  AAAA: "Maps a domain name to an IPv6 address",
  CNAME: "Creates an alias pointing to another domain name",
  MX: "Specifies the mail server for accepting email",
  TXT: "Holds arbitrary text data (SPF, DKIM, etc.)",
  NS: "Delegates a DNS zone to an authoritative name server",
  PTR: "Maps an IP address back to a domain name (reverse DNS)",
  SRV: "Specifies the location of a service (host, port, priority)",
}
