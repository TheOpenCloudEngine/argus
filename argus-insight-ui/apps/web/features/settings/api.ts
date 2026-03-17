const BASE = "/api/v1/infraconfig"

// --------------------------------------------------------------------------- //
// Infrastructure Configuration
// --------------------------------------------------------------------------- //

export type InfraCategory = {
  category: string
  items: Record<string, string>
}

export type InfraConfig = {
  categories: InfraCategory[]
}

/**
 * Fetch all infrastructure configuration from the server.
 */
export async function fetchInfraConfig(): Promise<InfraConfig> {
  const res = await fetch(`${BASE}/configuration`)
  if (!res.ok) throw new Error(`Failed to fetch infra config: ${res.status}`)
  return res.json()
}

/**
 * Update settings within a single infrastructure category.
 */
export async function updateInfraCategory(
  category: string,
  items: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${BASE}/configuration/category`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, items }),
  })
  if (!res.ok) throw new Error(`Failed to update infra category: ${res.status}`)
}
