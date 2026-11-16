import type { InventoryItem, RestaurantData } from './data'

export type SyncSettings = {
  serverUrl: string
  accessToken: string
}

export type SyncPayload = {
  restaurantData: RestaurantData
  inventory: InventoryItem[]
}

export type SyncSnapshot = {
  revision: number
  payload: SyncPayload | null
  updatedAt: string | null
}

export function createSyncPayload(restaurantData: RestaurantData, inventory: InventoryItem[]): SyncPayload {
  return {
    restaurantData: {
      ...restaurantData,
      tables: restaurantData.tables ?? ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6'],
      cart: [],
      orderType: 'Dine-in',
      selectedTable: 'Table 1',
      discount: 0,
      activeOrderId: null,
    },
    inventory,
  }
}

export class SyncConflictError extends Error {
  readonly snapshot: SyncSnapshot

  constructor(snapshot: SyncSnapshot) {
    super('Another device saved changes after this device last synced.')
    this.name = 'SyncConflictError'
    this.snapshot = snapshot
  }
}

function getApiUrl(serverUrl: string, pathname: string) {
  const baseUrl = serverUrl.trim().replace(/\/+$/, '')
  return `${baseUrl}${pathname}`
}

async function requestJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  })

  const body = await response.json() as {
    error?: string
    revision?: number
    payload?: SyncPayload | null
    updatedAt?: string | null
  }
  if (response.status === 409) {
    if (typeof body.revision !== 'number') throw new Error('The sync server returned an invalid conflict response.')
    throw new SyncConflictError({
      revision: body.revision,
      payload: body.payload ?? null,
      updatedAt: body.updatedAt ?? null,
    })
  }
  if (!response.ok) throw new Error(body.error || `Sync server returned ${response.status}.`)
  return body as T
}

export function loadSyncSettings(): SyncSettings {
  try {
    const value = localStorage.getItem('mehfil-sync-settings')
    if (!value) return { serverUrl: '/api', accessToken: '' }
    const parsed = JSON.parse(value) as Partial<SyncSettings>
    return {
      serverUrl: parsed.serverUrl ?? '/api',
      accessToken: parsed.accessToken ?? '',
    }
  } catch (error) {
    console.error('Could not read sync settings.', error)
    return { serverUrl: '/api', accessToken: '' }
  }
}

export function getSyncFingerprint(payload: SyncPayload) {
  return JSON.stringify(payload)
}

export async function readServerSnapshot(settings: SyncSettings): Promise<SyncSnapshot> {
  if (!settings.accessToken.trim()) throw new Error('Enter the sync access token in Settings.')
  return requestJson<SyncSnapshot>(getApiUrl(settings.serverUrl, '/sync'), settings.accessToken)
}

export async function writeServerSnapshot(
  settings: SyncSettings,
  expectedRevision: number,
  payload: SyncPayload,
): Promise<SyncSnapshot> {
  if (!settings.accessToken.trim()) throw new Error('Enter the sync access token in Settings.')
  return requestJson<SyncSnapshot>(getApiUrl(settings.serverUrl, '/sync'), settings.accessToken, {
    method: 'PUT',
    body: JSON.stringify({ expectedRevision, payload }),
  })
}
