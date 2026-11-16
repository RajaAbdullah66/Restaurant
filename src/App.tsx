import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChefHat,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Coffee,
  CreditCard,
  Cloud,
  Flame,
  LayoutDashboard,
  LogOut,
  Minus,
  Monitor,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  initialRestaurantData,
  type Expense,
  type InventoryItem,
  type DailyClosing,
  type MenuCategory,
  type MenuItem,
  type Order,
  type RestaurantData,
  type RestaurantSettings,
} from './data'
import { loadRestaurantData, saveRestaurantData } from './storage'
import {
  getSyncFingerprint,
  createSyncPayload,
  loadSyncSettings,
  readServerSnapshot,
  SyncConflictError,
  type SyncPayload,
  type SyncSettings,
  type SyncSnapshot,
  writeServerSnapshot,
} from './sync'
import './App.css'

type Screen = 'dashboard' | 'pos' | 'kitchen' | 'inventory' | 'menu' | 'expenses' | 'reports' | 'closing' | 'settings'
type Role = 'owner' | 'cashier' | 'waiter' | 'kitchen'
type PrintMode = 'kot' | 'receipt' | null
type Toast = { title: string; detail: string } | null

type Account = {
  username: string
  password: string
  role: Role
  displayName: string
}

type LicenseState = {
  keyValue: string
  kind: 'trial' | 'lifetime' | 'none'
  expiry: string | null
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const demoAccounts: Account[] = [
  { username: 'owner', password: 'owner', role: 'owner', displayName: 'Owner' },
  { username: 'cashier', password: 'cashier', role: 'cashier', displayName: 'Cashier' },
  { username: 'waiter', password: 'waiter', role: 'waiter', displayName: 'Waiter' },
  { username: 'kitchen', password: 'kitchen', role: 'kitchen', displayName: 'Kitchen' },
]

const defaultLicenseState: LicenseState = {
  keyValue: '',
  kind: 'none',
  expiry: null,
}

const categories = [
  { name: 'All items', icon: UtensilsCrossed },
  { name: 'Breakfast', icon: Coffee },
  { name: 'Lunch / Dinner', icon: UtensilsCrossed },
  { name: 'Karahi', icon: Flame },
  { name: 'Platter', icon: ShoppingBag },
  { name: 'BBQ', icon: ChefHat },
  { name: 'Drinks', icon: Sparkles },
  { name: 'Sides', icon: UtensilsCrossed },
]

const initialInventory: InventoryItem[] = [
  { name: 'Chicken kg', unit: 'kg', stock: 24, alertThreshold: 10, unitCost: 290, history: [{ id: 'stock-init-1', date: new Date().toISOString(), change: 24, note: 'Initial stock' }] },
  { name: 'Mutton kg', unit: 'kg', stock: 12, alertThreshold: 4, unitCost: 1450, history: [{ id: 'stock-init-mutton', date: new Date().toISOString(), change: 12, note: 'Initial stock' }] },
  { name: 'Oil', unit: 'L', stock: 18, alertThreshold: 5, unitCost: 210, history: [{ id: 'stock-init-2', date: new Date().toISOString(), change: 18, note: 'Initial stock' }] },
  { name: 'Onion', unit: 'kg', stock: 15, alertThreshold: 8, unitCost: 42, history: [{ id: 'stock-init-3', date: new Date().toISOString(), change: 15, note: 'Initial stock' }] },
  { name: 'Tomato', unit: 'kg', stock: 14, alertThreshold: 7, unitCost: 55, history: [{ id: 'stock-init-4', date: new Date().toISOString(), change: 14, note: 'Initial stock' }] },
  { name: 'Spices', unit: 'kg', stock: 9, alertThreshold: 5, unitCost: 160, history: [{ id: 'stock-init-5', date: new Date().toISOString(), change: 9, note: 'Initial stock' }] },
  { name: 'Rice kg', unit: 'kg', stock: 20, alertThreshold: 9, unitCost: 95, history: [{ id: 'stock-init-6', date: new Date().toISOString(), change: 20, note: 'Initial stock' }] },
  { name: 'Bread packs', unit: 'packs', stock: 16, alertThreshold: 6, unitCost: 35, history: [{ id: 'stock-init-7', date: new Date().toISOString(), change: 16, note: 'Initial stock' }] },
]

const ingredientUseMap: Record<string, Partial<Record<string, number>>> = {
  'Chicken Karahi': { 'Chicken kg': 1.2, Oil: 0.5, Onion: 0.4, Tomato: 0.6, Spices: 0.2 },
  'Mutton Karahi': { 'Mutton kg': 1.0, Oil: 0.6, Onion: 0.6, Tomato: 0.8, Spices: 0.3 },
  'White Karahi': { 'Chicken kg': 1.0, Oil: 0.5, Onion: 0.5, Tomato: 0.7, Spices: 0.2 },
  'BBQ Family Platter': { 'Chicken kg': 1.4, Oil: 0.8, Onion: 0.6, Tomato: 0.5, Spices: 0.4 },
  'Chicken Tikka Platter': { 'Chicken kg': 1.1, Oil: 0.7, Onion: 0.5, Tomato: 0.4, Spices: 0.3 },
  'Malai Boti': { 'Chicken kg': 0.8, Oil: 0.3, Onion: 0.3, Tomato: 0.2, Spices: 0.2 },
  'Seekh Kebab': { 'Chicken kg': 0.7, Oil: 0.3, Onion: 0.2, Tomato: 0.2, Spices: 0.2 },
  'Chicken Tikka': { 'Chicken kg': 0.8, Oil: 0.3, Onion: 0.2, Tomato: 0.2, Spices: 0.2 },
  'Halwa Puri': { Oil: 0.1, Onion: 0.1, Tomato: 0.2, Spices: 0.1 },
  'Anda Paratha': { Oil: 0.2, Onion: 0.1, Tomato: 0.1, Spices: 0.1 },
  'Nashta Platter': { Oil: 0.2, Onion: 0.2, Tomato: 0.2, Spices: 0.2 },
  'Butter Naan': { 'Bread packs': 0.5, Oil: 0.1 },
  'Fresh Salad': { Onion: 0.2, Tomato: 0.2, 'Rice kg': 0.1 },
  'Mint Margarita': { 'Spices': 0.05 },
  'Mango Lassi': { 'Spices': 0.05 },
  'Doodh Patti Chai': { 'Spices': 0.04 },
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCurrency(value: number) {
  return `Rs ${Math.round(value).toLocaleString('en-PK')}`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function playSuccessSound() {
  if (!window.AudioContext) return

  const context = new window.AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = 660
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.19)
  oscillator.onended = () => {
    void context.close().catch((error: unknown) => {
      console.error('Could not close the notification audio context.', error)
    })
  }
}

function getMachineId() {
  const storageKey = 'mehfil-machine-id'
  const saved = window.localStorage.getItem(storageKey)
  if (saved) return saved

  const generated = `REST-${Math.floor(Math.random() * 9000 + 1000)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  window.localStorage.setItem(storageKey, generated)
  return generated
}

function loadAccounts() {
  try {
    const raw = window.localStorage.getItem('mehfil-accounts')
    if (!raw) return demoAccounts
    const parsed = JSON.parse(raw) as Account[]
    return parsed.length ? parsed : demoAccounts
  } catch {
    return demoAccounts
  }
}

function loadLicenseState(): LicenseState {
  try {
    const raw = window.localStorage.getItem('mehfil-license')
    if (!raw) return defaultLicenseState
    const parsed = JSON.parse(raw) as Partial<LicenseState>
    return {
      keyValue: parsed.keyValue ?? '',
      kind: parsed.kind ?? 'none',
      expiry: parsed.expiry ?? null,
    }
  } catch {
    return defaultLicenseState
  }
}

function normalizeLicenseKey(value: string) {
  return value.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 12)
}

function createLicenseStateForMachine(machineId: string, rawKey: string): LicenseState {
  const cleaned = normalizeLicenseKey(rawKey)
  if (!cleaned) return defaultLicenseState

  const machineToken = machineId.replace(/[^A-Z0-9]/g, '').slice(-4).toUpperCase()
  const isValidMachine = cleaned.endsWith(machineToken) && cleaned.length <= 12
  const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  if (cleaned.startsWith('LIFE') && isValidMachine) {
    return { keyValue: cleaned, kind: 'lifetime', expiry: null }
  }

  if (cleaned.startsWith('TRIAL') && isValidMachine) {
    return { keyValue: cleaned, kind: 'trial', expiry: trialExpiry }
  }

  return defaultLicenseState
}

function App() {
  const machineId = useMemo(() => getMachineId(), [])
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [data, setData] = useState<RestaurantData>(initialRestaurantData)
  const [loginForm, setLoginForm] = useState({ username: 'owner', password: 'owner' })
  const [loggedInUser, setLoggedInUser] = useState<Account | null>(null)
  const [accounts, setAccounts] = useState<Account[]>(loadAccounts)
  const [licenseState, setLicenseState] = useState<LicenseState>(loadLicenseState)
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const saved = window.localStorage.getItem('mehfil-inventory')
      if (!saved) return initialInventory
      const savedInventory = JSON.parse(saved) as InventoryItem[]
      return [
        ...savedInventory,
        ...initialInventory.filter((item) => !savedInventory.some((savedItem) => savedItem.name === item.name)),
      ]
    } catch (error) {
      console.error('Could not read local inventory.', error)
      return initialInventory
    }
  })
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [storageError, setStorageError] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [category, setCategory] = useState('All items')
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card'>('Cash')
  const [toast, setToast] = useState<Toast>(null)
  const [printMode, setPrintMode] = useState<PrintMode>(null)
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(loadSyncSettings)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'conflict' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('Set up the restaurant server to sync devices.')
  const [pendingSyncSnapshot, setPendingSyncSnapshot] = useState<SyncSnapshot | null>(null)
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const syncBusy = useRef(false)
  const latestSyncPayload = useRef<SyncPayload | null>(null)

  useEffect(() => {
    let active = true
    loadRestaurantData()
      .then((savedData) => {
        if (active) setData(savedData)
      })
      .catch((error: unknown) => {
        console.error('Could not load restaurant data from local storage.', error)
        if (active) {
          setStorageError('Local data could not be opened. Your changes may not be saved.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (loading || storageError) return
    const timer = window.setTimeout(() => {
      saveRestaurantData(data).catch((error: unknown) => {
        console.error('Could not save restaurant data locally.', error)
        setStorageError('Local saving failed. Check this device’s available storage.')
      })
    }, 140)
    return () => window.clearTimeout(timer)
  }, [data, loading, storageError])

  useEffect(() => {
    window.localStorage.setItem('mehfil-inventory', JSON.stringify(inventory))
  }, [inventory])

  useEffect(() => {
    window.localStorage.setItem('mehfil-sync-settings', JSON.stringify(syncSettings))
  }, [syncSettings])

  useEffect(() => {
    latestSyncPayload.current = createSyncPayload(data, inventory)
  }, [data, inventory])

  const applyRemoteSnapshot = (snapshot: SyncSnapshot) => {
    const payload = snapshot.payload
    if (!payload) {
      setSyncStatus('error')
      setSyncMessage('The server has no saved restaurant data to pull.')
      return
    }

    setData((current) => ({
      ...payload.restaurantData,
      tables: payload.restaurantData.tables ?? initialRestaurantData.tables,
      closings: payload.restaurantData.closings ?? [],
      orders: (payload.restaurantData.orders ?? []).map((order) => ({
        ...order,
        shift: order.shift ?? payload.restaurantData.settings?.shift ?? 'Morning',
      })),
      cart: current.cart,
      orderType: current.orderType,
      selectedTable: current.selectedTable,
      discount: current.discount,
      activeOrderId: current.activeOrderId,
    }))
    setInventory(payload.inventory)
    window.localStorage.setItem('mehfil-sync-revision', String(snapshot.revision))
    window.localStorage.setItem('mehfil-sync-fingerprint', getSyncFingerprint(payload))
    setPendingSyncSnapshot(null)
    setSyncStatus('synced')
    setSyncMessage(`Updated from server · revision ${snapshot.revision}`)
  }

  const sendLocalSnapshot = useCallback(async (expectedRevision: number, payload: SyncPayload) => {
    const snapshot = await writeServerSnapshot(syncSettings, expectedRevision, payload)
    window.localStorage.setItem('mehfil-sync-revision', String(snapshot.revision))
    window.localStorage.setItem('mehfil-sync-fingerprint', getSyncFingerprint(payload))
    setPendingSyncSnapshot(null)
    setSyncStatus('synced')
    setSyncMessage(`All devices synced · revision ${snapshot.revision}`)
  }, [syncSettings])

  const syncNow = useCallback(async () => {
    if (syncBusy.current) return
    if (!syncSettings.accessToken.trim()) {
      setSyncStatus('idle')
      setSyncMessage('Enter the sync access token in Settings to connect this device.')
      return
    }
    if (!navigator.onLine) {
      setSyncStatus('idle')
      setSyncMessage('Offline · changes remain saved on this device.')
      return
    }

    syncBusy.current = true
    setSyncStatus('syncing')
    setSyncMessage('Checking for changes…')
    try {
      const currentPayload = latestSyncPayload.current
      if (!currentPayload) return
      const currentFingerprint = getSyncFingerprint(currentPayload)
      const snapshot = await readServerSnapshot(syncSettings)
      const rawBaseRevision = window.localStorage.getItem('mehfil-sync-revision')
      const baseRevision = rawBaseRevision === null ? null : Number(rawBaseRevision)
      const baseFingerprint = window.localStorage.getItem('mehfil-sync-fingerprint')

      if (snapshot.payload === null && snapshot.revision === 0) {
        await sendLocalSnapshot(0, currentPayload)
      } else if (baseRevision === null || baseFingerprint === null) {
        setPendingSyncSnapshot(snapshot)
        setSyncStatus('conflict')
        setSyncMessage('This device is not paired with the saved server data yet. Choose which copy to keep.')
      } else if (snapshot.revision === baseRevision) {
        if (currentFingerprint === baseFingerprint) {
          setSyncStatus('synced')
          setSyncMessage(`All devices synced · revision ${snapshot.revision}`)
        } else {
          await sendLocalSnapshot(snapshot.revision, currentPayload)
        }
      } else if (snapshot.revision > baseRevision && currentFingerprint === baseFingerprint) {
        applyRemoteSnapshot(snapshot)
      } else {
        setPendingSyncSnapshot(snapshot)
        setSyncStatus('conflict')
        setSyncMessage('Both this device and the server changed. Choose which copy to keep.')
      }
    } catch (error) {
      if (error instanceof SyncConflictError) {
        setPendingSyncSnapshot(error.snapshot)
        setSyncStatus('conflict')
        setSyncMessage('A newer server change arrived during sync. Choose which copy to keep.')
      } else {
        console.error('Restaurant data sync failed.', error)
        setSyncStatus('error')
        setSyncMessage(error instanceof Error ? error.message : 'Sync failed. Check the server and access token.')
      }
    } finally {
      syncBusy.current = false
    }
  }, [sendLocalSnapshot, syncSettings])

  const resolveSyncConflict = async (choice: 'server' | 'device') => {
    const snapshot = pendingSyncSnapshot
    if (!snapshot) return

    if (choice === 'server') {
      applyRemoteSnapshot(snapshot)
      return
    }

    const payload = latestSyncPayload.current
    if (!payload) return
    syncBusy.current = true
    setSyncStatus('syncing')
    setSyncMessage('Replacing the server snapshot…')
    try {
      await sendLocalSnapshot(snapshot.revision, payload)
    } catch (error) {
      if (error instanceof SyncConflictError) {
        setPendingSyncSnapshot(error.snapshot)
        setSyncStatus('conflict')
        setSyncMessage('The server changed again. Review the updated conflict before retrying.')
      } else {
        console.error('Could not resolve the restaurant data sync conflict.', error)
        setSyncStatus('error')
        setSyncMessage(error instanceof Error ? error.message : 'Could not resolve the sync conflict.')
      }
    } finally {
      syncBusy.current = false
    }
  }

  useEffect(() => {
    if (loading || !syncSettings.accessToken.trim()) return
    const initialSync = window.setTimeout(() => { void syncNow() }, 1200)
    const interval = window.setInterval(() => { void syncNow() }, 30_000)
    const onOnline = () => { void syncNow() }
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(initialSync)
      window.clearInterval(interval)
      window.removeEventListener('online', onOnline)
    }
  }, [loading, syncSettings, syncNow])

  useEffect(() => {
    if (
      loading ||
      !syncSettings.accessToken.trim() ||
      !navigator.onLine
    ) return
    const timer = window.setTimeout(() => { void syncNow() }, 1800)
    return () => window.clearTimeout(timer)
  }, [
    data.menu,
    data.orders,
    data.expenses,
    data.closings,
    data.settings,
    data.thankYouMessage,
    inventory,
    loading,
    syncSettings.accessToken,
    syncNow,
  ])

  useEffect(() => {
    window.localStorage.setItem('mehfil-accounts', JSON.stringify(accounts))
  }, [accounts])

  useEffect(() => {
    window.localStorage.setItem('mehfil-license', JSON.stringify(licenseState))
  }, [licenseState])

  useEffect(() => {
    setLoginLicenseKey(licenseState.keyValue)
  }, [licenseState.keyValue])

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine)
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const todayKey = localDateKey(now)
  const todaysOrders = useMemo(
    () => data.orders.filter((order) => localDateKey(new Date(order.createdAt)) === todayKey),
    [data.orders, todayKey],
  )
  const todaysPaidOrders = useMemo(
    () => todaysOrders.filter((order) => order.status === 'paid'),
    [todaysOrders],
  )
  const todayRevenue = todaysPaidOrders.reduce((sum, order) => sum + order.total, 0)
  const todayCost = todaysPaidOrders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce((itemSum, item) => itemSum + item.unitCost * item.quantity, 0),
    0,
  )
  const todayExpenseTotal = data.expenses
    .filter((expense) => localDateKey(new Date(expense.date)) === todayKey)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const todayProfit = todayRevenue - todayCost - todayExpenseTotal
  const menuSelections = useMemo(() => data.menu.flatMap((item) => item.variants?.length
    ? item.variants.map((variant) => ({
        ...item,
        id: `${item.id}::${variant.id}`,
        name: `${item.name} (${variant.name})`,
        price: variant.price,
        unitCost: variant.unitCost,
      }))
    : [item]), [data.menu])
  const cartSubtotal = data.cart.reduce((sum, entry) => {
    const item = menuSelections.find((menuItem) => menuItem.id === entry.menuItemId)
    return sum + (item?.price ?? 0) * entry.quantity
  }, 0)
  const discount = Math.min(Math.max(0, data.discount), cartSubtotal)
  const cartTotal = cartSubtotal - discount
  const cartCount = data.cart.reduce((sum, entry) => sum + entry.quantity, 0)
  const activeTableOrders = useMemo(() => {
    const ordersByTable = new Map<string, Order>()
    for (const order of data.orders) {
      if (order.orderType !== 'Dine-in' || order.status === 'paid' || order.status === 'cancelled' || !data.tables.includes(order.table)) continue
      const current = ordersByTable.get(order.table)
      if (!current || new Date(order.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        ordersByTable.set(order.table, order)
      }
    }
    return ordersByTable
  }, [data.orders, data.tables])
  const occupiedTableCount = activeTableOrders.size

  const visibleMenu = menuSelections.filter((item) => {
    const matchesCategory = category === 'All items' || item.category === category
    const matchesSearch = `${item.name} ${item.category}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase())
    return item.available && matchesCategory && matchesSearch
  })

  const notify = (title: string, detail: string) => {
    setToast({ title, detail })
    playSuccessSound()
  }

  const updateData = (updater: (current: RestaurantData) => RestaurantData) => {
    setData(updater)
  }

  const addItem = (item: MenuItem) => {
    updateData((current) => {
      const existing = current.cart.find((entry) => entry.menuItemId === item.id)
      return {
        ...current,
        cart: existing
          ? current.cart.map((entry) =>
              entry.menuItemId === item.id
                ? { ...entry, quantity: entry.quantity + 1 }
                : entry,
            )
          : [...current.cart, { menuItemId: item.id, quantity: 1 }],
      }
    })
  }

  const changeQuantity = (itemId: string, delta: number) => {
    updateData((current) => ({
      ...current,
      cart: current.cart
        .map((entry) =>
          entry.menuItemId === itemId
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    }))
  }

  const makeOrder = (
    status: Order['status'],
    payment: Order['paymentMethod'] = 'Cash',
  ): Order | null => {
    if (!data.cart.length) return null
    if (data.orderType === 'Dine-in' && !data.tables.includes(data.selectedTable)) {
      notify('Select a table', 'Add or select an available table before creating this dine-in order.')
      return null
    }
    const items = data.cart.flatMap((entry) => {
      const menuItem = menuSelections.find((item) => item.id === entry.menuItemId)
      return menuItem
        ? [
            {
              menuItemId: menuItem.id,
              name: menuItem.name,
              emoji: menuItem.emoji,
              price: menuItem.price,
              unitCost: menuItem.unitCost,
              quantity: entry.quantity,
              recipe: (() => {
                const [baseId, variantId] = menuItem.id.split('::')
                const base = data.menu.find((item) => item.id === baseId)
                const variant = base?.variants?.find((item) => item.id === variantId)
                const recipe = base?.recipe ?? ingredientUseMap[base?.name ?? menuItem.name]
                return recipe ? Object.fromEntries(Object.entries(recipe).map(([name, amount]) => [name, (amount ?? 0) * (variant?.recipeMultiplier ?? 1)])) : undefined
              })(),
            },
          ]
        : []
    })
    if (!items.length) return null

    const existing = data.orders.find((order) => order.id === data.activeOrderId)
    const now = new Date().toISOString()
    return {
      id: existing?.id ?? crypto.randomUUID(),
      number:
        existing?.number ??
        `#${String(
          Math.max(0, ...data.orders.map((order) => Number(order.number.slice(1)) || 0)) + 1,
        ).padStart(3, '0')}`,
      orderType: data.orderType,
      table: data.orderType === 'Dine-in' ? data.selectedTable : data.orderType,
      items,
      subtotal: cartSubtotal,
      discount,
      total: cartTotal,
      status:
        status === 'pending' && existing
          ? JSON.stringify(existing.items.map(({ menuItemId, quantity }) => [menuItemId, quantity])) === JSON.stringify(items.map(({ menuItemId, quantity }) => [menuItemId, quantity]))
            ? existing.status
            : 'pending'
          : status,
      paymentMethod: status === 'paid' ? payment : undefined,
      shift: existing?.shift ?? data.settings.shift,
      submittedBy: existing?.submittedBy ?? loggedInUser?.displayName,
      submittedByRole: existing?.submittedByRole ?? loggedInUser?.role,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  const adjustInventory = (itemName: string, amount: number, note: string) => {
    setInventory((currentInventory) =>
      currentInventory.map((item) => {
        if (item.name !== itemName) return item

        const appliedChange = amount < 0 ? Math.max(-item.stock, amount) : amount
        const nextStock = item.stock + appliedChange
        return {
          ...item,
          stock: nextStock,
          history: [
            {
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              change: appliedChange,
              note,
            },
            ...item.history,
          ].slice(0, 8),
        }
      }),
    )
  }

  const getOrderConsumption = (order: Order | undefined, inventoryName: string) => {
    if (!order || order.status === 'cancelled') return 0
    return order.items.reduce((sum, orderItem) => {
      const recipe = orderItem.recipe ?? ingredientUseMap[orderItem.name]
      return sum + (recipe?.[inventoryName] ?? 0) * orderItem.quantity
    }, 0)
  }

  const applyInventoryDeduction = (order: Order, previousOrder?: Order) => {
    setInventory((currentInventory) =>
      currentInventory.map((item) => {
        const stockChange = getOrderConsumption(previousOrder, item.name) - getOrderConsumption(order, item.name)

        if (!stockChange) return item

        const nextStock = item.stock + stockChange
        return {
          ...item,
          stock: nextStock,
          history: [
            {
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              change: stockChange,
              note: `${stockChange > 0 ? 'Restocked from' : 'Deducted for'} order ${order.number}`,
            },
            ...item.history,
          ].slice(0, 8),
        }
      }),
    )
  }

  const saveOrder = (order: Order, clearCart: boolean) => {
    const previousOrder = data.orders.find((savedOrder) => savedOrder.id === order.id)
    const stockShortage = inventory.find((item) => {
      const change = getOrderConsumption(previousOrder, item.name) - getOrderConsumption(order, item.name)
      return change < 0 && item.stock + change < 0
    })
    if (stockShortage) {
      notify('Not enough stock', `${stockShortage.name} is insufficient. Add stock or update the recipe.`)
      return false
    }
    applyInventoryDeduction(order, previousOrder)
    updateData((current) => ({
      ...current,
      orders: current.orders.some((savedOrder) => savedOrder.id === order.id)
        ? current.orders.map((savedOrder) =>
            savedOrder.id === order.id ? order : savedOrder,
          )
        : [order, ...current.orders],
      activeOrderId: clearCart ? null : order.id,
      cart: clearCart ? [] : current.cart,
      discount: clearCart ? 0 : current.discount,
    }))
  }

  const printOrderDocument = (order: Order, mode: Exclude<PrintMode, null>) => {
    setPrintOrder(order)
    setPrintMode(mode)
    window.setTimeout(() => {
      window.print()
      setPrintMode(null)
    }, 180)
  }

  const printKot = () => {
    const order = makeOrder('pending')
    if (!order) return
    if (!saveOrder(order, false)) return
    notify('Kitchen ticket sent', `${order.number} · ${order.table}`)
    printOrderDocument(order, 'kot')
  }

  const createWaiterOrder = () => {
    const order = makeOrder('pending')
    if (!order) return
    if (!saveOrder(order, true)) return
    notify('Order sent to kitchen', `${order.number} · ${order.table}. Cashier can now open and bill it.`)
    setMobileCartOpen(false)
  }

  const generateBill = () => {
    const order = makeOrder('paid', paymentMethod)
    if (!order) return
    if (!saveOrder(order, true)) return
    notify('Bill generated', `${order.number} · ${formatCurrency(order.total)}`)
    setMobileCartOpen(false)
    printOrderDocument(order, 'receipt')
  }

  const startNewOrder = () => {
    if (!data.cart.length && !data.activeOrderId) return
    updateData((current) => ({
      ...current,
      cart: [],
      activeOrderId: null,
      discount: 0,
    }))
  }

  const cancelActiveOrder = () => {
    const existing = data.orders.find((order) => order.id === data.activeOrderId)
    if (!existing || existing.status === 'paid' || existing.status === 'cancelled') return
    if (!window.confirm(`Cancel ${existing.number}? This will release the table and restore its recipe stock.`)) return
    const cancelled = { ...existing, status: 'cancelled' as const, updatedAt: new Date().toISOString() }
    if (!saveOrder(cancelled, true)) return
    notify('Order cancelled', `${existing.number} · ${existing.table}`)
  }

  const openOrder = (order: Order) => {
    if (order.status === 'paid' || order.status === 'cancelled') return
    if (data.cart.length && data.activeOrderId !== order.id) {
      const continueSelection = window.confirm('This will replace the current unsaved order with the selected order. Continue?')
      if (!continueSelection) return
    }
    updateData((current) => ({
      ...current,
      activeOrderId: order.id,
      orderType: order.orderType,
      selectedTable:
        order.orderType === 'Dine-in' && data.tables.includes(order.table)
          ? order.table
          : current.selectedTable,
      cart: order.items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      })),
      discount: order.discount,
    }))
    setScreen('pos')
    setMobileCartOpen(true)
    notify('Order opened', `${order.number} · ${order.table}`)
  }

  const addTableByName = (name: string) => {
    const tableName = name.trim()
    if (!tableName) {
      notify('Table name required', 'Enter a name for the new table.')
      return false
    }
    if (data.tables.some((table) => table.toLocaleLowerCase() === tableName.toLocaleLowerCase())) {
      notify('Table already exists', 'Choose a name that is not already in use.')
      return false
    }

    updateData((current) => ({ ...current, tables: [...current.tables, tableName] }))
    notify('Table added', `${tableName} is ready for orders.`)
    return true
  }

  const removeTableByName = (tableName: string) => {
    if (activeTableOrders.has(tableName)) {
      notify('Table is in use', 'Pay or cancel its active order before removing this table.')
      return
    }
    if (!window.confirm(`Remove ${tableName}? Past order records will be kept.`)) return
    updateData((current) => ({
      ...current,
      tables: current.tables.filter((table) => table !== tableName),
      selectedTable: current.selectedTable === tableName ? current.tables.find((table) => table !== tableName) ?? '' : current.selectedTable,
    }))
    notify('Table removed', `${tableName} is no longer available for new orders.`)
  }

  const addTable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!addTableByName(newTableName)) return
    setNewTableName('')
    setShowAddTable(false)
  }

  const selectTable = (table: string) => {
    const existingOrder = activeTableOrders.get(table)
    if (existingOrder) {
      openOrder(existingOrder)
      return
    }

    const isCurrentDraft =
      data.cart.length > 0 &&
      !data.activeOrderId &&
      data.orderType === 'Dine-in' &&
      data.selectedTable === table
    if (isCurrentDraft) {
      setScreen('pos')
      return
    }

    if (data.cart.length && (data.activeOrderId || data.selectedTable !== table || data.orderType !== 'Dine-in')) {
      const continueSelection = window.confirm('Start a new order at this free table? The current unsaved order will be cleared.')
      if (!continueSelection) return
    }

    updateData((current) => ({
      ...current,
      orderType: 'Dine-in',
      selectedTable: table,
      activeOrderId: null,
      cart: [],
      discount: 0,
    }))
    setScreen('pos')
    setMobileCartOpen(false)
  }

  const displayName = new Intl.DateTimeFormat('en-PK', { weekday: 'long' }).format(
    now,
  )

  const licenseStatus = useMemo(() => {
    const value = normalizeLicenseKey(licenseState.keyValue)
    if (!value) {
      return { valid: false, expired: false, warning: false, message: 'No valid license key entered.' }
    }

    const machineToken = machineId.replace(/[^A-Z0-9]/g, '').slice(-4).toUpperCase()
    const isLifetime = value.startsWith('LIFE') && value.endsWith(machineToken) && value.length <= 12
    const isTrial = value.startsWith('TRIAL') && value.endsWith(machineToken) && value.length <= 12

    if (!isLifetime && !isTrial) {
      return { valid: false, expired: false, warning: false, message: 'This key is not for this PC.' }
    }

    if (isLifetime) {
      return { valid: true, expired: false, warning: false, message: 'Lifetime key active.' }
    }

    if (!licenseState.expiry) {
      return { valid: false, expired: true, warning: false, message: 'License expired, contact developer.' }
    }

    const expiresAt = new Date(licenseState.expiry)
    const expired = expiresAt.getTime() <= Date.now()
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
    const warning = !expired && daysLeft <= 5

    return {
      valid: !expired,
      expired,
      warning,
      message: expired
        ? 'License expired, contact developer.'
        : `License expires in ${Math.max(daysLeft, 0)} days.`,
    }
  }, [licenseState, machineId])

  const [loginLicenseKey, setLoginLicenseKey] = useState(licenseState.keyValue)

  const allowedScreens: Record<Role, Screen[]> = {
    owner: ['dashboard', 'kitchen', 'inventory', 'menu', 'reports', 'settings'],
    cashier: ['pos', 'kitchen', 'inventory', 'menu', 'expenses', 'reports', 'closing', 'settings'],
    waiter: ['pos'],
    kitchen: ['kitchen'],
  }

  const handleInstallApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') {
      notify('App installed', 'Mehfil is ready to launch from your device.')
    }
    setInstallPrompt(null)
  }

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!licenseStatus.valid) {
      notify('License required', 'Enter a valid machine key before signing in.')
      return
    }

    const match = accounts.find(
      (account) =>
        account.username.toLowerCase() === loginForm.username.trim().toLowerCase() &&
        account.password === loginForm.password,
    )

    if (!match) {
      notify('Incorrect login', 'Use one of the demo accounts from the login panel.')
      return
    }

    setLoggedInUser(match)
    setScreen(match.role === 'kitchen' ? 'kitchen' : match.role === 'owner' ? 'dashboard' : 'pos')
    notify('Welcome back', `${match.displayName} signed in.`)
  }

  const handleLogout = () => {
    if (data.cart.length && !window.confirm('Sign out and clear the unsaved order draft? Sent orders will remain saved.')) return
    updateData((current) => ({ ...current, cart: [], activeOrderId: null, discount: 0 }))
    setLoggedInUser(null)
    setLoginForm({ username: '', password: '' })
    notify('Signed out', 'You have safely logged out.')
  }

  const activateLicenseFromLogin = () => {
    const nextState = createLicenseStateForMachine(machineId, loginLicenseKey)
    setLicenseState(nextState)
    if (nextState.kind === 'none') {
      notify('Invalid key', 'Use a valid 12-character key for this PC.')
    } else {
      notify('License activated', nextState.kind === 'lifetime' ? 'Lifetime key accepted.' : 'Trial key accepted.')
    }
  }

  const handleAddAccount = (nextAccount: Account) => {
    const normalizedUsername = nextAccount.username.trim()
    if (!normalizedUsername || !nextAccount.password.trim()) return

    setAccounts((current) => {
      const existingIndex = current.findIndex(
        (account) => account.username.toLowerCase() === normalizedUsername.toLowerCase(),
      )

      if (existingIndex >= 0) {
        return current.map((account, index) =>
          index === existingIndex ? { ...account, ...nextAccount, username: normalizedUsername } : account,
        )
      }

      return [
        ...current,
        {
          ...nextAccount,
          username: normalizedUsername,
          displayName: nextAccount.displayName || nextAccount.username,
        },
      ]
    })
  }

  const handleDeleteAccount = (username: string) => {
    if (username.toLowerCase() === 'owner') return
    setAccounts((current) => current.filter((account) => account.username !== username))
  }

  const canViewScreen = (target: Screen) => !loggedInUser || allowedScreens[loggedInUser.role].includes(target)

  useEffect(() => {
    if (loggedInUser && !canViewScreen(screen)) {
      setScreen(allowedScreens[loggedInUser.role][0])
    }
  }, [loggedInUser, screen])

  if (loading) {
    return (
      <div className="loading-screen" aria-label="Loading restaurant system">
        <div className="loading-mark">
          <UtensilsCrossed size={27} strokeWidth={2.2} />
        </div>
        <div className="loading-title">Mehfil <span>Kitchen</span></div>
        <div className="loading-track"><span /></div>
        <p>Getting your restaurant ready</p>
        <div className="loading-brand">Developed by Devqueld AI</div>
      </div>
    )
  }

  if (!loggedInUser) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark"><UtensilsCrossed size={21} /></span>
            <div>
              <strong>{data.settings.restaurantName.split(' ')[0] || 'Mehfil'}</strong>
              <small>Restaurant OS</small>
            </div>
          </div>

          <div className="license-tagline">
            <span>Machine code</span>
            <strong>{machineId}</strong>
          </div>
          <div className={`login-license-badge ${licenseStatus.valid ? 'good' : licenseStatus.warning ? 'warn' : 'bad'}`}>
            {licenseStatus.message}
          </div>

          <div className="login-head">
            <div className="eyebrow"><span className="eyebrow-dot" /> STAFF LOGIN</div>
            <h1>Sign in to continue</h1>
            <p>Online or offline — username and password are all you need.</p>
          </div>

          {!licenseStatus.valid && (
            <div className="license-gate">
              <label>
                <span>Activation key</span>
                <input
                  value={loginLicenseKey}
                  onChange={(event) => setLoginLicenseKey(event.target.value)}
                  placeholder="TRIALXK92"
                  maxLength={12}
                />
              </label>
              <button type="button" className="primary-button login-button" onClick={activateLicenseFromLogin}>Activate key</button>
            </div>
          )}

          {licenseStatus.valid && (
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                <span>Username</span>
                <input
                  value={loginForm.username}
                  onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="owner / cashier / waiter / kitchen"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter password"
                />
              </label>

              <div className="demo-accounts">
                {accounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className="demo-account"
                    onClick={() => setLoginForm({ username: account.username, password: account.password })}
                  >
                    {account.displayName}
                  </button>
                ))}
              </div>

              <button type="submit" className="primary-button login-button">Login</button>
            </form>
          )}

          <div className="login-meta">
            <span>Protected by local access</span>
            <div className="login-meta-actions">
              {installPrompt && (
                <button type="button" className="inline-install-button" onClick={handleInstallApp}>Install app</button>
              )}
              <strong>Developed by Devqueld AI</strong>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const navButtons = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, allowed: allowedScreens[loggedInUser.role].includes('dashboard') },
    { key: 'pos', label: 'Point of sale', icon: ShoppingCart, allowed: allowedScreens[loggedInUser.role].includes('pos') },
    { key: 'kitchen', label: 'Kitchen display', icon: ChefHat, allowed: allowedScreens[loggedInUser.role].includes('kitchen') },
    { key: 'inventory', label: 'Inventory', icon: ShoppingBag, allowed: allowedScreens[loggedInUser.role].includes('inventory') },
    { key: 'menu', label: 'Menu', icon: UtensilsCrossed, allowed: allowedScreens[loggedInUser.role].includes('menu') },
    { key: 'expenses', label: 'Expenses', icon: CircleDollarSign, allowed: allowedScreens[loggedInUser.role].includes('expenses') },
    { key: 'reports', label: 'Reports', icon: BarChart3, allowed: allowedScreens[loggedInUser.role].includes('reports') },
    { key: 'closing', label: 'Closing', icon: CircleDollarSign, allowed: allowedScreens[loggedInUser.role].includes('closing') },
    { key: 'settings', label: 'Settings', icon: Monitor, allowed: allowedScreens[loggedInUser.role].includes('settings') },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => setScreen(allowedScreens[loggedInUser.role][0])}>
          <span className="brand-mark"><UtensilsCrossed size={21} /></span>
          <span className="brand-copy">
            <strong>Mehfil</strong>
            <small>RESTAURANT OS</small>
          </span>
        </button>

        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navButtons
            .filter((item) => item.allowed)
            .map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  className={`nav-item ${screen === item.key ? 'active' : ''}`}
                  onClick={() => setScreen(item.key as Screen)}
                  type="button"
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {screen === item.key && <span className="nav-active-dot" />}
                </button>
              )
            })}
        </nav>

        <div className="sidebar-separator" />
        <div className="sidebar-caption">LIVE</div>
        <div className="coming-list">
          <div className="coming-item"><ChefHat size={17} /><span>Kitchen status</span></div>
          <div className="coming-item"><ShoppingBag size={17} /><span>Inventory levels</span></div>
          <div className="coming-item"><CircleDollarSign size={17} /><span>Sales pulse</span></div>
        </div>

        <div className="sidebar-bottom">
          <div className="device-card">
            <div className="device-icon"><Monitor size={16} /></div>
            <div>
              <strong>{loggedInUser.displayName}</strong>
              <span>{loggedInUser.role.toUpperCase()}</span>
            </div>
            <span className="device-status" />
          </div>
          <p className="sidebar-brand">Developed by Devqueld AI</p>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{data.settings.restaurantName}</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{navButtons.find((item) => item.key === screen)?.label ?? 'Restaurant workspace'}</strong>
          </div>
          <div className="topbar-actions">
            <div className={`connection-pill ${online ? 'is-online' : 'is-offline'}`}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{online ? 'Online · saved locally' : 'Offline · saved locally'}</span>
            </div>
            <button
              className="icon-button notification-button"
              type="button"
              aria-label={`${loggedInUser.role === 'cashier' ? data.orders.filter((order) => order.status !== 'paid' && order.status !== 'cancelled' && (order.submittedByRole === 'waiter' || order.status === 'ready')).length : 0} order notifications`}
              title="Waiter orders and kitchen-ready notifications"
              onClick={() => {
                const notificationOrder = data.orders.find((order) => order.status === 'ready') ??
                  data.orders.find((order) => order.status !== 'paid' && order.status !== 'cancelled' && order.submittedByRole === 'waiter')
                if (loggedInUser.role === 'cashier' && notificationOrder) openOrder(notificationOrder)
              }}
            >
              <Bell size={18} />
              {loggedInUser.role === 'cashier' && data.orders.some((order) => order.status !== 'paid' && order.status !== 'cancelled' && (order.submittedByRole === 'waiter' || order.status === 'ready')) && <span className="notification-dot" />}
            </button>
            <div className="avatar">{loggedInUser.displayName.slice(0, 1).toUpperCase()}</div>
            <div className="profile-name">
              <strong>{loggedInUser.displayName}</strong>
              <span>{loggedInUser.role[0].toUpperCase() + loggedInUser.role.slice(1)} account</span>
            </div>
            <button className="logout-button" type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={17} /><span>Log out</span>
            </button>
          </div>
        </header>

        {storageError && (
          <div className="storage-alert" role="alert">
            <span>{storageError}</span>
            <button type="button" onClick={() => setStorageError(null)} aria-label="Dismiss storage warning">
              <X size={15} />
            </button>
          </div>
        )}

        {screen === 'dashboard' ? (
          <Dashboard
            dayName={displayName}
            now={now}
            todayRevenue={todayRevenue}
            todayProfit={todayProfit}
            todayExpenseTotal={todayExpenseTotal}
            todaysOrders={todaysOrders}
            todaysPaidOrders={todaysPaidOrders}
            orders={data.orders}
            menu={data.menu}
            inventory={inventory}
            onNavigate={() => setScreen(canViewScreen('pos') ? 'pos' : 'reports')}
            onInventory={() => setScreen('inventory')}
            onOpenOrder={(order) => {
              if (canViewScreen('pos')) openOrder(order)
              else {
                setScreen('kitchen')
                notify('Kitchen status', `${order.number} · ${order.status}`)
              }
            }}
            canCreateOrders={canViewScreen('pos')}
          />
        ) : screen === 'inventory' ? (
          <InventoryPanel
            inventory={inventory}
            onAdjustInventory={(itemName, amount, note) => adjustInventory(itemName, amount, note)}
          />
        ) : screen === 'kitchen' ? (
          <KitchenDisplay
            orders={data.orders}
            onAdvanceStatus={(orderId, status) => {
              updateData((current) => ({
                ...current,
                orders: current.orders.map((order) =>
                  order.id === orderId ? { ...order, status, updatedAt: new Date().toISOString() } : order,
                ),
              }))
            }}
          />
        ) : screen === 'menu' ? (
          <MenuManagerPanel
            menu={data.menu}
            inventory={inventory}
            onUpdateMenu={(nextMenu) => updateData((current) => ({ ...current, menu: nextMenu }))}
          />
        ) : screen === 'expenses' ? (
          <ExpensePanel
            expenses={data.expenses}
            onAddExpense={(expense) => updateData((current) => ({ ...current, expenses: [expense, ...current.expenses] }))}
            onDeleteExpense={(expenseId) => updateData((current) => ({
              ...current,
              expenses: current.expenses.filter((item) => item.id !== expenseId),
            }))}
          />
        ) : screen === 'reports' ? (
          <ReportsPanel
            orders={data.orders}
            expenses={data.expenses}
            menu={data.menu}
            closings={data.closings}
            now={now}
          />
        ) : screen === 'closing' ? (
          <DailyClosingPanel
            orders={data.orders}
            expenses={data.expenses}
            closings={data.closings}
            shift={data.settings.shift}
            closedBy={loggedInUser.displayName}
            now={now}
            onClose={(closing) => {
              updateData((current) => ({ ...current, closings: [closing, ...current.closings] }))
              notify('Shift closed', 'Closing report saved in Reports.')
              setScreen('reports')
            }}
          />
        ) : screen === 'settings' ? (
          <SettingsPanel
            settings={data.settings}
            accounts={accounts}
            tables={data.tables}
            canManageAccounts={loggedInUser.role === 'owner'}
            syncSettings={syncSettings}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            pendingSyncSnapshot={pendingSyncSnapshot}
            onAddAccount={handleAddAccount}
            onDeleteAccount={handleDeleteAccount}
            onAddTable={addTableByName}
            onRemoveTable={removeTableByName}
            onSyncSettingsChange={setSyncSettings}
            onSyncNow={() => { void syncNow() }}
            onResolveSyncConflict={(choice) => { void resolveSyncConflict(choice) }}
            onChange={(nextSettings) => updateData((current) => ({
              ...current,
              settings: nextSettings,
              thankYouMessage: nextSettings.thankYouMessage,
            }))}
          />
        ) : (
          <section className="screen-content pos-content">
            <div className="page-heading pos-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot" /> QUICK SERVICE</div>
                <h1>Let’s take an order</h1>
                <p>Tap a dish to add it. Your order is saved on this device.</p>
              </div>
              <div className="service-time"><Clock3 size={15} /> {now.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</div>
            </div>

            <section className="table-service-board" aria-label="Table status and unpaid orders">
              <div className="table-service-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-dot" /> TABLE SERVICE</div>
                  <h2>Table status</h2>
                  <p>Select any table to open its order or start a new one.</p>
                </div>
                <div className="table-service-controls">
                  <div className="table-service-summary">
                    <span className="table-legend free"><i /> {data.tables.length - occupiedTableCount} Free</span>
                    <span className="table-legend occupied"><i /> {occupiedTableCount} Reserved</span>
                  </div>
                  {loggedInUser.role === 'cashier' && <button
                    className="add-table-button"
                    type="button"
                    onClick={() => setShowAddTable((visible) => !visible)}
                  >
                    <Plus size={15} /> Add table
                  </button>}
                </div>
              </div>
              {showAddTable && loggedInUser.role === 'cashier' && (
                <form className="add-table-form" onSubmit={addTable}>
                  <label>
                    <span>New table name</span>
                    <input
                      autoFocus
                      maxLength={40}
                      value={newTableName}
                      onChange={(event) => setNewTableName(event.target.value)}
                      placeholder={`Table ${data.tables.length + 1}`}
                    />
                  </label>
                  <button className="primary-button" type="submit">Save table</button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => { setShowAddTable(false); setNewTableName('') }}
                  >
                    Cancel
                  </button>
                </form>
              )}
              <div className="table-service-grid">
                {data.tables.map((table, index) => {
                  const order = activeTableOrders.get(table)
                  const isSelected = data.orderType === 'Dine-in' && data.selectedTable === table
                  const tableStatus = order?.status ?? 'free'
                  const itemCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
                  return (
                    <button
                      key={table}
                      type="button"
                      className={`service-table-card ${tableStatus === 'free' ? 'free' : `occupied status-${tableStatus}`} ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectTable(table)}
                      aria-label={order
                        ? `${table}, reserved, ${order.status}, unpaid bill ${formatCurrency(order.total)}. Open order`
                        : `${table}, free. Start new order`}
                    >
                      <span className="service-table-top">
                        <span className="service-table-number">{String(index + 1).padStart(2, '0')}</span>
                        <span className={`service-table-state ${order ? 'occupied' : 'free'}`}>
                          <i /> {order ? 'Reserved' : 'Free'}
                        </span>
                      </span>
                      <strong>{table}</strong>
                      {order ? (
                        <>
                          <span className="service-table-order">{order.number} · {order.status}</span>
                          <span className="service-table-total">{formatCurrency(order.total)}</span>
                          <small>{itemCount} items · unpaid</small>
                        </>
                      ) : (
                        <>
                          <span className="service-table-order">Ready for guests</span>
                          <span className="service-table-total">—</span>
                          <small>Tap to take an order</small>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            <div className="pos-layout">
              <section className="menu-column" aria-label="Menu items">
                <div className="menu-toolbar">
                  <div className="category-tabs" role="tablist" aria-label="Menu categories">
                    {categories.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.name}
                          className={`category-tab ${category === item.name ? 'selected' : ''}`}
                          type="button"
                          role="tab"
                          aria-selected={category === item.name}
                          onClick={() => setCategory(item.name)}
                        >
                          <Icon size={15} />
                          {item.name}
                        </button>
                      )
                    })}
                  </div>
                  <label className="search-field menu-search">
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a dish..."
                      aria-label="Search menu"
                    />
                    {search && (
                      <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>

                <div className="menu-grid">
                  {visibleMenu.map((item, index) => {
                    const cartItem = data.cart.find((entry) => entry.menuItemId === item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`menu-card menu-tone-${index % 6}`}
                        onClick={() => addItem(item)}
                        aria-label={`Add ${item.name}, ${formatCurrency(item.price)}`}
                      >
                        <span className="menu-card-art">
                          <span className="menu-emoji">{item.emoji}</span>
                          {cartItem && <span className="item-quantity-badge">{cartItem.quantity}</span>}
                          <span className="menu-add-badge"><Plus size={15} strokeWidth={2.5} /></span>
                        </span>
                        <span className="menu-card-copy">
                          <span className="menu-category-label">{item.category}</span>
                          <strong>{item.name}</strong>
                          <span className="menu-price">{formatCurrency(item.price)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {visibleMenu.length === 0 && (
                  <div className="empty-menu">
                    <span className="empty-menu-icon"><Search size={21} /></span>
                    <strong>No dishes found</strong>
                    <span>Try another search or category.</span>
                    <button type="button" onClick={() => { setSearch(''); setCategory('All items') }}>Show all dishes</button>
                  </div>
                )}
              </section>

              <aside className={`order-panel ${mobileCartOpen ? 'mobile-open' : ''}`} aria-label="Current order">
                <div className="order-panel-header">
                  <div>
                    <div className="order-overline">YOUR ORDER</div>
                    <h2>{data.activeOrderId ? 'Continue order' : 'New order'}</h2>
                  </div>
                  <div className="order-count">{cartCount} {cartCount === 1 ? 'item' : 'items'}</div>
                  {cartCount > 0 && (
                    <button className="mobile-cart-close" type="button" onClick={() => setMobileCartOpen(false)} aria-label="Close order">
                      <X size={18} />
                    </button>
                  )}
                </div>

                <div className="order-type-switch" role="group" aria-label="Order type">
                  {(['Dine-in', 'Takeaway', 'Delivery'] as const).map((type) => (
                    <button
                      key={type}
                      className={data.orderType === type ? 'selected' : ''}
                      type="button"
                      disabled={Boolean(data.activeOrderId) && data.orderType !== type}
                      onClick={() => updateData((current) => ({
                        ...current,
                        orderType: type,
                        selectedTable: type === 'Dine-in' ? current.selectedTable : type,
                      }))}
                    >
                      {type === 'Dine-in' ? <UtensilsCrossed size={14} /> : type === 'Takeaway' ? <ShoppingBag size={14} /> : <ArrowUpRight size={14} />}
                      {type}
                    </button>
                  ))}
                </div>

                {data.orderType === 'Dine-in' && (
                  <div className="table-selector">
                    <div className="field-label">SELECT A TABLE <span>• Required</span></div>
                    <div className="table-grid">
                      {data.tables.map((table, index) => (
                        <button
                          key={table}
                          className={`table-chip ${data.selectedTable === table ? 'selected' : ''} ${activeTableOrders.has(table) ? `occupied status-${activeTableOrders.get(table)?.status}` : 'free'}`}
                          type="button"
                          onClick={() => selectTable(table)}
                          aria-label={activeTableOrders.has(table)
                            ? `${table}, reserved, ${activeTableOrders.get(table)?.status}, bill ${formatCurrency(activeTableOrders.get(table)?.total ?? 0)}`
                            : `${table}, free`}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <small>{activeTableOrders.has(table) ? 'Reserved' : 'Table'}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {data.orderType !== 'Dine-in' && (
                  <div className="order-location">
                    <span className="location-dot" />
                    <span>{data.orderType === 'Delivery' ? 'Home delivery' : 'Takeaway counter'}</span>
                    <Check size={15} />
                  </div>
                )}

                <div className="order-items">
                  {data.cart.length === 0 ? (
                    <div className="empty-order">
                      <div className="empty-order-icon"><ShoppingCart size={22} /></div>
                      <strong>Your order is empty</strong>
                      <span>Tap any dish to add it here</span>
                    </div>
                  ) : (
                    data.cart.map((entry) => {
                      const item = menuSelections.find((menuItem) => menuItem.id === entry.menuItemId)
                      if (!item) return null
                      return (
                        <div className="order-line" key={entry.menuItemId}>
                          <span className="order-line-emoji">{item.emoji}</span>
                          <div className="order-line-copy">
                            <strong>{item.name}</strong>
                            <span>{formatCurrency(item.price)} each</span>
                          </div>
                          <div className="quantity-control">
                            <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}>
                              <Minus size={13} />
                            </button>
                            <span>{entry.quantity}</span>
                            <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}>
                              <Plus size={13} />
                            </button>
                          </div>
                          <strong className="order-line-total">{formatCurrency(item.price * entry.quantity)}</strong>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="order-calculation">
                  {loggedInUser.role !== 'waiter' && (
                  <label className="discount-field">
                    <span>Discount</span>
                    <span className="discount-input-wrap">
                      <span>Rs</span>
                      <input
                        type="number"
                        min="0"
                        max={cartSubtotal}
                        value={data.discount || ''}
                        placeholder="0"
                        aria-label="Discount amount in rupees"
                        onChange={(event) => {
                          const amount = Number(event.target.value)
                          updateData((current) => ({ ...current, discount: Number.isFinite(amount) ? Math.max(0, amount) : 0 }))
                        }}
                      />
                    </span>
                  </label>
                  )}
                  <div className="total-row"><span>Subtotal</span><strong>{formatCurrency(cartSubtotal)}</strong></div>
                  {discount > 0 && <div className="total-row discount-row"><span>Discount</span><strong>− {formatCurrency(discount)}</strong></div>}
                  <div className="grand-total"><span>Total due</span><strong>{formatCurrency(cartTotal)}</strong></div>
                </div>

                {loggedInUser.role !== 'waiter' && <div className="payment-selector">
                  <span className="field-label">PAYMENT METHOD</span>
                  <div className="payment-options">
                    <button
                      type="button"
                      className={paymentMethod === 'Cash' ? 'selected' : ''}
                      onClick={() => setPaymentMethod('Cash')}
                    ><Wallet size={15} /> Cash</button>
                    <button
                      type="button"
                      className={paymentMethod === 'Card' ? 'selected' : ''}
                      onClick={() => setPaymentMethod('Card')}
                    ><CreditCard size={15} /> Card</button>
                  </div>
                </div>}

                <div className="order-actions">
                  {loggedInUser.role === 'waiter' ? (
                    <button className="kot-button" type="button" onClick={createWaiterOrder} disabled={cartCount === 0}>
                      <ChefHat size={16} /> Create &amp; send to kitchen
                    </button>
                  ) : <button
                    className="kot-button"
                    type="button"
                    onClick={printKot}
                    disabled={cartCount === 0}
                  >
                    <Printer size={16} /> Print KOT &amp; send to kitchen
                  </button>}
                  {loggedInUser.role === 'cashier' && <button className="bill-button" type="button" onClick={generateBill} disabled={cartCount === 0 || !data.activeOrderId} title={!data.activeOrderId ? 'Send the order to the kitchen first' : 'Generate paid bill'}>
                    <span>{data.activeOrderId ? 'Generate bill' : 'Send order first'}</span><span>{formatCurrency(cartTotal)} <ArrowUpRight size={15} /></span>
                  </button>}
                  {loggedInUser.role === 'cashier' && data.activeOrderId && (
                    <button className="new-order-button cancel-order-button" type="button" onClick={cancelActiveOrder}>Cancel this order</button>
                  )}
                  {(data.cart.length > 0 || data.activeOrderId) && (
                    <button className="new-order-button" type="button" onClick={startNewOrder}>
                      Start a new order
                    </button>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}

        <footer className="app-footer">
          <span>Made for smooth service, from first chai to last call.</span>
          <strong>Developed by Devqueld AI</strong>
        </footer>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navButtons
            .filter((item) => item.allowed)
            .slice(0, 2)
            .map((item) => (
              <button
                key={item.key}
                className={screen === item.key ? 'active' : ''}
                type="button"
                onClick={() => { setScreen(item.key as Screen); setMobileCartOpen(false) }}
              >
                {item.key === 'dashboard' ? <LayoutDashboard size={19} /> : <ShoppingCart size={19} />}
                <span>{item.key === 'dashboard' ? 'Dashboard' : item.key === 'pos' ? 'New order' : item.label}</span>
                {item.key === 'pos' && cartCount > 0 && <i>{cartCount}</i>}
              </button>
            ))}
        </nav>
        {screen === 'pos' && cartCount > 0 && !mobileCartOpen && (
          <button className="mobile-view-cart" type="button" onClick={() => setMobileCartOpen(true)}>
            <span><ShoppingCart size={17} /> View order · {cartCount}</span>
            <strong>{formatCurrency(cartTotal)}</strong>
          </button>
        )}
      </main>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-check"><Check size={17} /></span>
          <span><strong>{toast.title}</strong><small>{toast.detail}</small></span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button>
        </div>
      )}

      {printOrder && (
        <section className={`print-document ${printMode ?? ''}`} aria-label={printMode === 'kot' ? 'Kitchen order ticket' : 'Customer receipt'}>
          <div className="print-brand">{data.settings.restaurantName.toUpperCase()}</div>
          <div className="print-subtitle">{printMode === 'kot' ? 'KITCHEN ORDER TICKET' : 'CUSTOMER RECEIPT'}</div>
          <div className="print-rule" />
          <div className="print-meta"><span>Order {printOrder.number}</span><span>{formatTime(printOrder.createdAt)}</span></div>
          <div className="print-meta"><span>{printOrder.orderType}</span><span>{printOrder.table}</span></div>
          <div className="print-rule" />
          {printOrder.items.map((item) => (
            <div className="print-line" key={item.menuItemId}>
              <span>{item.quantity} × {item.name}</span>
              {printMode === 'receipt' && <span>{formatCurrency(item.price * item.quantity)}</span>}
            </div>
          ))}
          {printMode === 'receipt' && (
            <>
              <div className="print-rule" />
              <div className="print-meta"><span>Subtotal</span><span>{formatCurrency(printOrder.subtotal)}</span></div>
              {printOrder.discount > 0 && <div className="print-meta"><span>Discount</span><span>− {formatCurrency(printOrder.discount)}</span></div>}
              <div className="print-total"><span>Total</span><strong>{formatCurrency(printOrder.total)}</strong></div>
              <div className="print-meta"><span>Paid by</span><span>{printOrder.paymentMethod}</span></div>
              <p className="print-thanks">{data.thankYouMessage}</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}

function KitchenDisplay({
  orders,
  onAdvanceStatus,
}: {
  orders: Order[]
  onAdvanceStatus: (orderId: string, status: Order['status']) => void
}) {
  const kitchenOrders = orders.filter(
    (order) => order.status === 'pending' || order.status === 'preparing' || order.status === 'ready',
  )

  return (
    <section className="screen-content kitchen-content">
      <div className="page-heading pos-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> KITCHEN DISPLAY</div>
          <h1>Live orders board</h1>
          <p>Track the rush and change each ticket by a single tap.</p>
        </div>
        <div className="service-time"><Clock3 size={15} /> {new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</div>
      </div>

      <div className="kitchen-grid">
        {kitchenOrders.length === 0 ? (
          <div className="kitchen-empty">
            <span>🍽️</span>
            <strong>No active kitchen tickets</strong>
            <small>New tickets appear here when the restaurant data syncs.</small>
          </div>
        ) : (
          kitchenOrders.map((order) => (
            <article
              key={order.id}
              className={`kitchen-card status-${order.status}`}
            >
              <div className="kitchen-card-top">
                <div>
                  <small>{order.number}</small>
                  <strong>{order.table}</strong>
                </div>
                <span>{order.status}</span>
              </div>

              <ul className="kitchen-items">
                {order.items.map((item) => (
                  <li key={`${order.id}-${item.menuItemId}`}>
                    <span>{item.quantity}×</span>
                    <strong>{item.name}</strong>
                  </li>
                ))}
              </ul>

              <div className="kitchen-actions">
                {order.status === 'pending' && (
                  <button type="button" onClick={() => onAdvanceStatus(order.id, 'preparing')}>Preparing</button>
                )}
                {order.status === 'preparing' && (
                  <button type="button" onClick={() => onAdvanceStatus(order.id, 'ready')}>Ready</button>
                )}
                {order.status === 'ready' && (
                  <button type="button" onClick={() => onAdvanceStatus(order.id, 'served')}>Served</button>
                )}
                {order.status === 'served' && (
                  <button type="button" className="muted" disabled>Served</button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function InventoryPanel({ inventory, onAdjustInventory }: { inventory: InventoryItem[]; onAdjustInventory: (name: string, amount: number, note: string) => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const lowStock = inventory.filter((item) => item.stock <= item.alertThreshold)
  const totalStockValue = inventory.reduce((sum, item) => sum + item.stock * item.unitCost, 0)

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> INVENTORY</div>
          <h1>Ingredient control</h1>
          <p>Track stock, low alerts, and live kitchen consumption.</p>
        </div>
        <div className="service-time"><ShoppingBag size={15} /> {formatCurrency(totalStockValue)}</div>
      </div>

      <div className="inventory-highlight-row">
        <div className="inventory-stat-card">
          <span>Total stock value</span>
          <strong>{formatCurrency(totalStockValue)}</strong>
        </div>
        <div className="inventory-stat-card warning">
          <span>Low stock alerts</span>
          <strong>{lowStock.length}</strong>
        </div>
      </div>

      <div className="inventory-grid">
        {inventory.map((item) => (
          <article key={item.name} className={`inventory-card ${item.stock <= item.alertThreshold ? 'low' : ''}`}>
            <div className="inventory-card-top">
              <span>{item.name}</span>
              {item.stock <= item.alertThreshold && <strong>Low stock</strong>}
            </div>
            <div className="inventory-card-body">
              <h3>{item.stock} {item.unit}</h3>
              <small>Critical: {item.alertThreshold} {item.unit}</small>
            </div>
            <div className="inventory-bar">
              <span style={{ width: `${Math.min(100, (item.stock / (item.alertThreshold * 2)) * 100)}%` }} />
            </div>
            <div className="inventory-actions">
              <input
                type="number"
                min="0"
                step="0.1"
                aria-label={`Quantity of ${item.name}`}
                placeholder="Qty"
                value={quantities[item.name] ?? ''}
                onChange={(event) => setQuantities((current) => ({ ...current, [item.name]: event.target.value }))}
              />
              <button type="button" onClick={() => {
                const amount = Number(quantities[item.name])
                if (amount > 0) onAdjustInventory(item.name, amount, 'Manual stock added')
              }}>+ Add</button>
              <button type="button" className="secondary" onClick={() => {
                const amount = Number(quantities[item.name])
                if (amount > 0) onAdjustInventory(item.name, -amount, 'Manual stock usage')
              }}>− Use</button>
              <button type="button" className="secondary" onClick={() => {
                const amount = Number(quantities[item.name])
                if (quantities[item.name] !== undefined && amount >= 0) onAdjustInventory(item.name, amount - item.stock, 'Manual stock count correction')
              }}>Set</button>
            </div>
            <div className="inventory-history">
              {item.history.slice(0, 3).map((entry) => (
                <span key={entry.id} className={entry.change >= 0 ? 'positive' : 'negative'}>
                  {entry.change >= 0 ? '+' : ''}{entry.change} {entry.note}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function MenuManagerPanel({
  menu,
  inventory,
  onUpdateMenu,
}: {
  menu: MenuItem[]
  inventory: InventoryItem[]
  onUpdateMenu: (nextMenu: MenuItem[]) => void
}) {
  const [form, setForm] = useState({
    name: '',
    category: 'Karahi' as MenuCategory,
    price: '0',
    emoji: '🍲',
    halfPrice: '',
    fullPrice: '',
  })
  const [recipe, setRecipe] = useState<Record<string, string>>({})
  const [editingPrice, setEditingPrice] = useState<{ id: string; value: string } | null>(null)
  const [editingVariants, setEditingVariants] = useState<{ id: string; half: string; full: string } | null>(null)

  const addMenuItem = () => {
    const price = Number(form.price)
    if (!form.name.trim() || price <= 0 || Boolean(form.halfPrice) !== Boolean(form.fullPrice)) return
    const recipeValues = Object.fromEntries(
      Object.entries(recipe).filter(([, amount]) => Number(amount) > 0).map(([name, amount]) => [name, Number(amount)]),
    )
    const variants = [
      form.halfPrice ? { id: 'half', name: 'Half', price: Number(form.halfPrice), unitCost: Math.round(price * 0.21), recipeMultiplier: 0.5 } : null,
      form.fullPrice ? { id: 'full', name: 'Full', price: Number(form.fullPrice), unitCost: Math.round(price * 0.42), recipeMultiplier: 1 } : null,
    ].filter((variant): variant is NonNullable<typeof variant> => Boolean(variant && variant.price > 0))
    const nextItem: MenuItem = {
      id: `${form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      price,
      unitCost: Math.max(10, Math.round(price * 0.42)),
      emoji: form.emoji || '🍽️',
      available: true,
      ...(Object.keys(recipeValues).length ? { recipe: recipeValues } : {}),
      ...(variants.length ? { variants } : {}),
    }
    onUpdateMenu([...menu, nextItem])
    setForm({ name: '', category: 'Karahi', price: '0', emoji: '🍲', halfPrice: '', fullPrice: '' })
    setRecipe({})
  }

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> MENU MANAGEMENT</div>
          <h1>Menu & pricing</h1>
          <p>Maintain dishes, category placement, and live availability.</p>
        </div>
      </div>

      <div className="module-layout">
        <div className="panel form-panel">
          <h2>Add menu item</h2>
          <div className="form-grid">
            <label>
              <span>Dish name</span>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>Category</span>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as MenuCategory }))}>
                {['Breakfast', 'Lunch / Dinner', 'Karahi', 'Platter', 'BBQ', 'Drinks', 'Sides'].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Price</span>
              <input type="number" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
            </label>
            <label>
              <span>Emoji</span>
              <input value={form.emoji} onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))} />
            </label>
            <label>
              <span>Half price (optional)</span>
              <input type="number" min="1" value={form.halfPrice} onChange={(event) => setForm((current) => ({ ...current, halfPrice: event.target.value }))} />
            </label>
            <label>
              <span>Full price (optional)</span>
              <input type="number" min="1" value={form.fullPrice} onChange={(event) => setForm((current) => ({ ...current, fullPrice: event.target.value }))} />
            </label>
          </div>
          <details className="recipe-editor">
            <summary>Inventory recipe (amount used per full serving)</summary>
            <div className="form-grid">
              {inventory.map((item) => (
                <label key={item.name}>
                  <span>{item.name} ({item.unit})</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recipe[item.name] ?? ''}
                    onChange={(event) => setRecipe((current) => ({ ...current, [item.name]: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
          </details>
          {Boolean(form.halfPrice) !== Boolean(form.fullPrice) && <p className="form-hint">Enter both Half and Full prices, or leave both blank.</p>}
          <button className="primary-button" type="button" onClick={addMenuItem} disabled={!form.name.trim() || Number(form.price) <= 0 || Boolean(form.halfPrice) !== Boolean(form.fullPrice)}>Add item</button>
        </div>

        <div className="panel list-panel">
          <h2>Live menu</h2>
          <div className="stack-list">
            {menu.map((item) => (
              <div key={item.id} className="stack-row">
                <span className="stack-emoji">{item.emoji}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.category} · {formatCurrency(item.price)}{item.variants?.length ? ` · ${item.variants.map((variant) => `${variant.name} ${formatCurrency(variant.price)}`).join(' / ')}` : ''}</small>
                </div>
                {item.variants?.length ? editingVariants?.id === item.id ? (
                  <>
                    <input
                      type="number"
                      min="1"
                      aria-label={`Half serving price for ${item.name}`}
                      value={editingVariants.half}
                      onChange={(event) => setEditingVariants({ ...editingVariants, half: event.target.value })}
                    />
                    <input
                      type="number"
                      min="1"
                      aria-label={`Full serving price for ${item.name}`}
                      value={editingVariants.full}
                      onChange={(event) => setEditingVariants({ ...editingVariants, full: event.target.value })}
                    />
                    <button type="button" className="chip success" disabled={Number(editingVariants.half) <= 0 || Number(editingVariants.full) <= 0} onClick={() => {
                      onUpdateMenu(menu.map((entry) => entry.id === item.id ? {
                        ...entry,
                        variants: entry.variants?.map((variant) => ({
                          ...variant,
                          price: Number(variant.id === 'half' ? editingVariants.half : editingVariants.full),
                        })),
                      } : entry))
                      setEditingVariants(null)
                    }}>Save sizes</button>
                    <button type="button" className="chip" onClick={() => setEditingVariants(null)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className="chip" onClick={() => setEditingVariants({
                    id: item.id,
                    half: String(item.variants?.find((variant) => variant.id === 'half')?.price ?? ''),
                    full: String(item.variants?.find((variant) => variant.id === 'full')?.price ?? ''),
                  })}>Edit size prices</button>
                ) : editingPrice?.id === item.id ? (
                  <>
                    <input
                      type="number"
                      min="1"
                      aria-label={`New price for ${item.name}`}
                      value={editingPrice.value}
                      onChange={(event) => setEditingPrice({ id: item.id, value: event.target.value })}
                    />
                    <button type="button" className="chip success" onClick={() => {
                      const price = Number(editingPrice.value)
                      if (price > 0) onUpdateMenu(menu.map((entry) => entry.id === item.id ? { ...entry, price } : entry))
                      setEditingPrice(null)
                    }}>Save price</button>
                  </>
                ) : (
                  <button type="button" className="chip" onClick={() => setEditingPrice({ id: item.id, value: String(item.price) })}>Edit price</button>
                )}
                <button
                  type="button"
                  className={item.available ? 'chip success' : 'chip muted'}
                  onClick={() => onUpdateMenu(menu.map((entry) => entry.id === item.id ? { ...entry, available: !entry.available } : entry))}
                >
                  {item.available ? 'Available' : 'Out of stock'}
                </button>
                <button
                  type="button"
                  className="chip danger"
                  onClick={() => onUpdateMenu(menu.filter((entry) => entry.id !== item.id))}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ExpensePanel({
  expenses,
  onAddExpense,
  onDeleteExpense,
}: {
  expenses: Expense[]
  onAddExpense: (expense: Expense) => void
  onDeleteExpense: (expenseId: string) => void
}) {
  const [form, setForm] = useState({
    category: 'Rent' as Expense['category'],
    title: '',
    amount: '0',
    note: '',
  })

  const addExpense = () => {
    if (Number(form.amount) <= 0) return
    if (form.category === 'Other' && !form.title.trim()) return
    onAddExpense({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      category: form.category,
      title: form.title.trim() || form.category,
      amount: Number(form.amount),
      note: form.note.trim() || 'General expense',
    })
    setForm({ category: 'Rent', title: '', amount: '0', note: '' })
  }

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> EXPENSES</div>
          <h1>Daily expense log</h1>
          <p>Track rent, salaries, food costs, and daily shop operations.</p>
        </div>
      </div>

      <div className="module-layout">
        <div className="panel form-panel">
          <h2>Add expense</h2>
          <div className="form-grid">
            <label>
              <span>Category</span>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Expense['category'] }))}>
                {['Rent', 'Staff Salary', 'Sabzi / Gosht', 'Gas', 'Other'].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount</span>
              <input type="number" min="1" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
            <label>
              <span>{form.category === 'Other' ? 'Expense name (required)' : 'Expense name'}</span>
              <input required={form.category === 'Other'} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Water delivery" />
            </label>
            <label className="full-span">
              <span>Note</span>
              <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Shop rent, meat order, gas refill..." />
            </label>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={addExpense}
            disabled={Number(form.amount) <= 0 || (form.category === 'Other' && !form.title.trim())}
          >Save expense</button>
        </div>

        <div className="panel list-panel">
          <h2>Recent expenses</h2>
          <div className="stack-list">
            {expenses.length === 0 ? (
              <div className="empty-box">No expense records yet.</div>
            ) : (
              expenses.slice(0, 8).map((expense) => (
                <div key={expense.id} className="stack-row expense-row">
                  <span className="stack-tag">{expense.category}</span>
                  <div>
                    <strong>{formatCurrency(expense.amount)}</strong>
                    <small>{expense.title ?? expense.note} · {expense.note}</small>
                  </div>
                  <button type="button" className="chip danger" onClick={() => onDeleteExpense(expense.id)}>Remove</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ReportsPanel({
  orders,
  expenses,
  menu,
  closings,
  now,
}: {
  orders: Order[]
  expenses: Expense[]
  menu: MenuItem[]
  closings: DailyClosing[]
  now: Date
}) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  } else if (period === 'month') {
    start.setDate(1)
  }
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const inPeriod = (value: string) => new Date(value) >= start && new Date(value) < periodEnd
  const paidOrders = orders.filter((order) => order.status === 'paid' && inPeriod(order.createdAt))
  const periodExpenses = expenses.filter((expense) => inPeriod(expense.date))
  const totalSales = paidOrders.reduce((sum, order) => sum + order.total, 0)
  const totalExpense = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const itemCost = paidOrders.reduce((sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + item.unitCost * item.quantity, 0), 0)
  const bestSeller = (() => {
    const counts = new Map<string, number>()
    paidOrders.forEach((order) => {
      order.items.forEach((item) => counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity))
    })
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return top ? `${top[0]} · ${top[1]} sold` : 'No sales yet'
  })()
  const menuCount = menu.filter((item) => item.available).length
  const periodLabel = period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'
  const periodClosings = closings.filter((closing) => inPeriod(`${closing.date}T00:00:00`)).sort((a, b) => b.closedAt.localeCompare(a.closedAt))
  const barLabels = period === 'day'
    ? ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p']
    : period === 'week'
      ? Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat('en-PK', { weekday: 'short' }).format(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)))
      : ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']
  const salesBars = barLabels.map((label, index) => {
    const sales = paidOrders.reduce((sum, order) => {
      const created = new Date(order.createdAt)
      const bucket = period === 'day'
        ? Math.min(7, Math.floor(created.getHours() / 3))
        : period === 'week'
          ? Math.floor((new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime() - start.getTime()) / 86400000)
          : Math.min(4, Math.floor((created.getDate() - 1) / 7))
      return sum + (bucket === index ? order.total : 0)
    }, 0)
    return { label, sales }
  })
  const maxPeriodSales = Math.max(1, ...salesBars.map((bar) => bar.sales))

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> REPORTS</div>
          <h1>Sales & profit overview</h1>
          <p>Sales, estimated ingredient costs, expenses, and saved closing reports.</p>
        </div>
        <label className="report-period">
          <span>Report period</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
      </div>

      <div className="report-grid">
        <div className="report-card"><span>{periodLabel} sales</span><strong>{formatCurrency(totalSales)}</strong></div>
        <div className="report-card"><span>{periodLabel} expenses</span><strong>{formatCurrency(totalExpense)}</strong></div>
        <div className="report-card"><span>Estimated item cost</span><strong>{formatCurrency(itemCost)}</strong></div>
        <div className="report-card"><span>Profit / loss</span><strong>{formatCurrency(totalSales - totalExpense - itemCost)}</strong></div>
        <div className="report-card"><span>Best seller</span><strong>{bestSeller}</strong></div>
      </div>

      <div className="panel list-panel report-list">
        <h2>{periodLabel} sales graph</h2>
        <div className="report-bars" role="img" aria-label={`${periodLabel} paid sales graph`}>
          {salesBars.map((bar) => (
            <div className="report-bar-column" key={bar.label} title={`${bar.label}: ${formatCurrency(bar.sales)}`}>
              <span className="report-bar-value">{bar.sales ? formatCurrency(bar.sales) : ''}</span>
              <span className="report-bar-track"><i style={{ height: `${Math.max(bar.sales ? 5 : 0, bar.sales / maxPeriodSales * 100)}%` }} /></span>
              <small>{bar.label}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="panel list-panel report-list">
        <h2>{periodLabel} cashflow summary</h2>
        <div className="stack-list">
          <div className="stack-row"><div><strong>Menu items live</strong><small>{menuCount} available dishes</small></div><span className="stack-tag">Live</span></div>
          <div className="stack-row"><div><strong>Paid orders</strong><small>{paidOrders.length} completed bills</small></div><span className="stack-tag">{paidOrders.length}</span></div>
          <div className="stack-row"><div><strong>Estimated profit</strong><small>Sales − expenses − estimated item cost</small></div><span className="stack-tag">{formatCurrency(totalSales - totalExpense - itemCost)}</span></div>
          {periodExpenses.slice(0, 5).map((expense) => (
            <div className="stack-row" key={expense.id}><div><strong>{expense.title ?? expense.category}</strong><small>{expense.category} · {new Date(expense.date).toLocaleDateString()}</small></div><span className="stack-tag">{formatCurrency(expense.amount)}</span></div>
          ))}
        </div>
      </div>
      <div className="panel list-panel report-list">
        <h2>Saved daily closings</h2>
        <div className="stack-list">
          {periodClosings.length ? periodClosings.map((closing) => (
            <div className="stack-row" key={closing.id}>
              <div><strong>{closing.date} · {closing.shift} shift</strong><small>Closed by {closing.closedBy} · {formatTime(closing.closedAt)}</small></div>
              <span className="stack-tag">{formatCurrency(closing.profit)} profit</span>
            </div>
          )) : <div className="empty-box">No saved closings in this period.</div>}
        </div>
      </div>
    </section>
  )
}

function SettingsPanel({
  settings,
  accounts,
  tables,
  canManageAccounts,
  syncSettings,
  syncStatus,
  syncMessage,
  pendingSyncSnapshot,
  onAddAccount,
  onDeleteAccount,
  onAddTable,
  onRemoveTable,
  onSyncSettingsChange,
  onSyncNow,
  onResolveSyncConflict,
  onChange,
}: {
  settings: RestaurantSettings
  accounts: Account[]
  tables: string[]
  canManageAccounts: boolean
  syncSettings: SyncSettings
  syncStatus: 'idle' | 'syncing' | 'synced' | 'conflict' | 'error'
  syncMessage: string
  pendingSyncSnapshot: SyncSnapshot | null
  onAddAccount: (next: Account) => void
  onDeleteAccount: (username: string) => void
  onAddTable: (tableName: string) => boolean
  onRemoveTable: (tableName: string) => void
  onSyncSettingsChange: (settings: SyncSettings) => void
  onSyncNow: () => void
  onResolveSyncConflict: (choice: 'server' | 'device') => void
  onChange: (next: RestaurantSettings) => void
}) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'cashier' as Role,
    displayName: '',
  })
  const [newTableName, setNewTableName] = useState('')

  const addAccount = () => {
    if (!form.username.trim() || !form.password.trim()) return
    onAddAccount({
      username: form.username.trim(),
      password: form.password,
      role: form.role,
      displayName: form.displayName.trim() || form.username.trim(),
    })
    setForm({ username: '', password: '', role: 'cashier', displayName: '' })
  }

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> SETTINGS</div>
          <h1>Restaurant details</h1>
          <p>Customize the restaurant profile while keeping the required Devqueld AI footer fixed.</p>
        </div>
      </div>

      <div className="module-layout">
        <div className="panel form-panel settings-panel">
          <div className="panel-heading-row">
            <div>
              <h2>Table management</h2>
              <p>Add the dine-in tables available in your restaurant.</p>
            </div>
            <span className="sync-status-pill synced">{tables.length} tables</span>
          </div>
          <form
            className="add-table-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (onAddTable(newTableName)) setNewTableName('')
            }}
          >
            <label>
              <span>New table name</span>
              <input
                maxLength={40}
                value={newTableName}
                onChange={(event) => setNewTableName(event.target.value)}
                placeholder={`Table ${tables.length + 1}`}
              />
            </label>
            <button className="primary-button" type="submit"><Plus size={15} /> Add table</button>
          </form>
          <div className="table-settings-list">
            {tables.map((table, index) => (
              <span className="table-settings-chip" key={table}>
                <small>{String(index + 1).padStart(2, '0')}</small>
                {table}
                <button type="button" className="chip danger" onClick={() => onRemoveTable(table)} aria-label={`Remove ${table}`}>Remove</button>
              </span>
            ))}
          </div>
          <div className="settings-note">Tables with unpaid orders cannot be removed; past order records are preserved.</div>
        </div>

        <div className="panel form-panel settings-panel">
          <div className="panel-heading-row">
            <div>
              <h2><Cloud size={18} /> Offline-first device sync</h2>
              <p>Data stays on this device and syncs to your restaurant server when connected.</p>
            </div>
            <span className={`sync-status-pill ${syncStatus}`}>
              {syncStatus === 'syncing' ? <RefreshCw size={13} className="sync-spin" /> : <span className="sync-status-dot" />}
              {syncStatus === 'synced' ? 'Synced' : syncStatus === 'conflict' ? 'Needs review' : syncStatus === 'error' ? 'Connection issue' : syncStatus === 'syncing' ? 'Syncing' : 'Offline ready'}
            </span>
          </div>
          <div className="form-grid">
            <label>
              <span>Server address</span>
              <input
                value={syncSettings.serverUrl}
                onChange={(event) => onSyncSettingsChange({ ...syncSettings, serverUrl: event.target.value })}
                placeholder="/api"
                autoComplete="url"
              />
            </label>
            <label>
              <span>Sync access token</span>
              <input
                value={syncSettings.accessToken}
                onChange={(event) => onSyncSettingsChange({ ...syncSettings, accessToken: event.target.value })}
                placeholder="Paste token from the restaurant PC"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <p className={`sync-message ${syncStatus}`}>{syncMessage}</p>
          <div className="settings-actions">
            <button type="button" className="primary-button" onClick={onSyncNow} disabled={syncStatus === 'syncing'}>
              <RefreshCw size={15} /> Sync now
            </button>
            {pendingSyncSnapshot && (
              <>
                {pendingSyncSnapshot.payload && (
                  <button type="button" className="secondary-button" onClick={() => onResolveSyncConflict('server')}>
                    Use server copy on this device
                  </button>
                )}
                <button type="button" className="secondary-button" onClick={() => onResolveSyncConflict('device')}>
                  Replace server with this device
                </button>
              </>
            )}
          </div>
          <div className="settings-note">
            Run the desktop app on the restaurant PC, then use its local network address on other devices. Copy the access token from <code>data/sync-token.txt</code> in the server app-data folder (or the project data folder when developing). Replacing the server copy affects every device. Keep the server on a trusted network; public internet access requires HTTPS and secure hosting.
          </div>
        </div>

        <div className="panel form-panel settings-panel">
          <h2>General settings</h2>
          <div className="form-grid">
            <label>
              <span>Restaurant name</span>
              <input value={settings.restaurantName} onChange={(event) => onChange({ ...settings, restaurantName: event.target.value })} />
            </label>
            <label>
              <span>Phone</span>
              <input value={settings.phone} onChange={(event) => onChange({ ...settings, phone: event.target.value })} />
            </label>
            <label className="full-span">
              <span>Address</span>
              <input value={settings.address} onChange={(event) => onChange({ ...settings, address: event.target.value })} />
            </label>
            <label>
              <span>Shift</span>
              <select value={settings.shift} onChange={(event) => onChange({ ...settings, shift: event.target.value as RestaurantSettings['shift'] })}>
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
              </select>
            </label>
            <label>
              <span>Printer size</span>
              <select value={settings.printerSize} onChange={(event) => onChange({ ...settings, printerSize: event.target.value as RestaurantSettings['printerSize'] })}>
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </label>
            <label className="full-span">
              <span>Bill thank-you message</span>
              <input value={settings.thankYouMessage} onChange={(event) => onChange({ ...settings, thankYouMessage: event.target.value })} />
            </label>
          </div>
          <div className="settings-note">Fixed branding remains: “Developed by Devqueld AI” on all app screens and login, and is never editable.</div>
        </div>

        {canManageAccounts && <div className="panel form-panel settings-panel">
          <h2>Create staff account</h2>
          <div className="form-grid">
            <label>
              <span>Display name</span>
              <input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
            </label>
            <label>
              <span>Username</span>
              <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <label>
              <span>Role</span>
              <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}>
                <option value="owner">Owner</option>
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </label>
          </div>
          <button type="button" className="primary-button" onClick={addAccount}>Create account</button>
        </div>}

        {canManageAccounts && <div className="panel list-panel">
          <h2>Staff accounts</h2>
          <div className="stack-list">
            {accounts.map((account) => (
              <div key={account.username} className="stack-row">
                <span className="stack-tag">{account.role}</span>
                <div>
                  <strong>{account.displayName}</strong>
                  <small>{account.username}</small>
                </div>
                {account.username.toLowerCase() !== 'owner' && (
                  <button type="button" className="chip danger" onClick={() => onDeleteAccount(account.username)}>Remove</button>
                )}
              </div>
            ))}
          </div>
        </div>}
      </div>
    </section>
  )
}

function DailyClosingPanel({
  orders,
  expenses,
  closings,
  shift,
  closedBy,
  now,
  onClose,
}: {
  orders: Order[]
  expenses: Expense[]
  closings: DailyClosing[]
  shift: RestaurantSettings['shift']
  closedBy: string
  now: Date
  onClose: (closing: DailyClosing) => void
}) {
  const date = localDateKey(now)
  const [submittedAmount, setSubmittedAmount] = useState('')
  const saleOrders = orders.filter((order) => order.status === 'paid' && localDateKey(new Date(order.createdAt)) === date && (!order.shift || order.shift === shift))
  const totalSale = saleOrders.reduce((sum, order) => sum + order.total, 0)
  const totalCash = saleOrders
    .filter((order) => order.paymentMethod === 'Cash')
    .reduce((sum, order) => sum + order.total, 0)
  const totalCard = saleOrders
    .filter((order) => order.paymentMethod === 'Card')
    .reduce((sum, order) => sum + order.total, 0)
  const totalExpense = expenses.filter((expense) => localDateKey(new Date(expense.date)) === date).reduce((sum, expense) => sum + expense.amount, 0)
  const estimatedItemCost = saleOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.unitCost * item.quantity, 0), 0)
  const cashierSubmittedAmount = Number(submittedAmount) || 0
  const cashInHand = totalCash - cashierSubmittedAmount
  const existingClosing = closings.find((closing) => closing.date === date && closing.shift === shift)

  const closeDay = () => {
    if (existingClosing) return
    onClose({
      id: crypto.randomUUID(),
      date,
      shift,
      closedAt: new Date().toISOString(),
      closedBy,
      totalSale,
      totalCash,
      totalCard,
      totalExpense,
      cashInHand,
      cashierSubmittedAmount,
      estimatedItemCost,
      profit: totalSale - totalExpense - estimatedItemCost,
    })
  }

  return (
    <section className="screen-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> DAILY CLOSING</div>
          <h1>Close the day confidently</h1>
          <p>{date} · {shift} shift. Review this shift’s sales, expenses, and cash before saving its closing report.</p>
        </div>
      </div>

      <div className="report-grid">
        <div className="report-card"><span>Total sale</span><strong>{formatCurrency(totalSale)}</strong></div>
        <div className="report-card"><span>Total cash</span><strong>{formatCurrency(totalCash)}</strong></div>
        <div className="report-card"><span>Total card</span><strong>{formatCurrency(totalCard)}</strong></div>
        <div className="report-card"><span>Cash in hand</span><strong>{formatCurrency(cashInHand)}</strong></div>
      </div>

      <div className="panel list-panel report-list">
        <h2>Closing summary</h2>
        <div className="stack-list">
          <div className="stack-row"><div><strong>Total expense</strong><small>Expenses entered today</small></div><span className="stack-tag">{formatCurrency(totalExpense)}</span></div>
          <div className="stack-row"><div><strong>Estimated item cost</strong><small>From order item costs</small></div><span className="stack-tag">{formatCurrency(estimatedItemCost)}</span></div>
          <div className="stack-row"><div><strong>Cashier submitted</strong><small>Enter the amount handed over</small></div><label className="closing-submitted"><span>Rs</span><input type="number" min="0" required aria-label="Cashier submitted amount" value={submittedAmount} onChange={(event) => setSubmittedAmount(event.target.value)} /></label></div>
          <div className="stack-row"><div><strong>Net operating result</strong><small>Sales − expenses − estimated item cost</small></div><span className="stack-tag">{formatCurrency(totalSale - totalExpense - estimatedItemCost)}</span></div>
        </div>
        {existingClosing ? (
          <div className="settings-note">This {shift.toLowerCase()} shift was closed by {existingClosing.closedBy} at {formatTime(existingClosing.closedAt)}. Its saved report is available in Reports.</div>
        ) : (
          <button className="primary-button" type="button" style={{ marginTop: '14px' }} disabled={!submittedAmount.trim() || cashierSubmittedAmount < 0} onClick={closeDay}>Close {shift.toLowerCase()} shift and save report</button>
        )}
      </div>
    </section>
  )
}

type DashboardProps = {
  dayName: string
  now: Date
  todayRevenue: number
  todayProfit: number
  todayExpenseTotal: number
  todaysOrders: Order[]
  todaysPaidOrders: Order[]
  orders: Order[]
  menu: MenuItem[]
  inventory: InventoryItem[]
  onNavigate: () => void
  onInventory: () => void
  onOpenOrder: (order: Order) => void
  canCreateOrders: boolean
}

function Dashboard({
  dayName,
  now,
  todayRevenue,
  todayProfit,
  todayExpenseTotal,
  todaysOrders,
  todaysPaidOrders,
  orders,
  menu,
  inventory,
  onNavigate,
  onInventory,
  onOpenOrder,
  canCreateOrders,
}: DashboardProps) {
  const bestSellers = useMemo(() => {
    const counts = new Map<string, number>()
    todaysPaidOrders.forEach((order) =>
      order.items.forEach((item) => counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity)),
    )
    return [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 3)
  }, [todaysPaidOrders])
  const today = now
  const startOfWeek = new Date(today)
  const mondayOffset = (today.getDay() + 6) % 7
  startOfWeek.setDate(today.getDate() - mondayOffset)
  startOfWeek.setHours(0, 0, 0, 0)
  const weekData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + index)
    const key = localDateKey(date)
    const sales = orders
      .filter((order) => order.status === 'paid' && localDateKey(new Date(order.createdAt)) === key)
      .reduce((sum, order) => sum + order.total, 0)
    return {
      key,
      label: new Intl.DateTimeFormat('en-PK', { weekday: 'short' }).format(date),
      day: date.getDate(),
      sales,
      active: key === localDateKey(today),
    }
  })
  const maxSales = Math.max(...weekData.map((day) => day.sales), 1)
  const recentOrders = [...todaysOrders]
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
    .slice(0, 5)
  const lowStock = inventory.filter((item) => item.stock <= item.alertThreshold)

  return (
    <section className="screen-content dashboard-content">
      <div className="dashboard-welcome">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> {dayName.toUpperCase()} AT A GLANCE</div>
          <h1>Good food. <span>Great business.</span></h1>
          <p>Here’s how your restaurant is doing today.</p>
        </div>
        <button className="primary-button dashboard-cta" type="button" onClick={onNavigate}>
          {canCreateOrders ? <><Plus size={17} /> Create an order</> : <><BarChart3 size={17} /> View reports</>}
        </button>
        <div className="welcome-decoration" aria-hidden="true">
          <span className="welcome-orbit orbit-one" />
          <span className="welcome-orbit orbit-two" />
          <span className="welcome-leaf">✳</span>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard
          title="Today’s revenue"
          value={formatCurrency(todayRevenue)}
          caption={todayRevenue > 0 ? 'Collected from paid bills' : 'No paid bills recorded yet'}
          icon={<Wallet size={19} />}
          tone="green"
          trend={todayRevenue > 0 ? 'Live total' : undefined}
        />
        <MetricCard
          title="Today’s profit"
          value={formatCurrency(todayProfit)}
          caption="After estimated dish cost and expenses"
          icon={<BarChart3 size={19} />}
          tone="blue"
          trend={todayProfit > 0 ? 'Estimated' : undefined}
        />
        <MetricCard
          title="Total orders"
          value={String(todaysOrders.length)}
          caption="Orders started today"
          icon={<ShoppingBag size={19} />}
          tone="amber"
          trend={todaysOrders.length > 0 ? 'Today' : undefined}
        />
        <MetricCard
          title="Expenses"
          value={formatCurrency(todayExpenseTotal)}
          caption={todayExpenseTotal > 0 ? 'Logged today' : 'No expenses logged yet'}
          icon={<CircleDollarSign size={19} />}
          tone="rose"
          trend={todayExpenseTotal > 0 ? 'Today' : 'Pending'}
        />
      </div>

      <div className="dashboard-main-grid">
        <section className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <h2>Sales overview</h2>
              <p>Your paid sales this week</p>
            </div>
            <span className="panel-select"><span>This week</span><ChevronDown size={14} /></span>
          </div>
          <div className="chart-summary">
            <strong>{formatCurrency(weekData.reduce((sum, day) => sum + day.sales, 0))}</strong>
            <span><span className="chart-summary-dot" /> Revenue</span>
          </div>
          <div className="sales-chart" role="img" aria-label="Daily sales this week">
            <div className="chart-y-labels">
              <span>{formatCurrency(maxSales)}</span>
              <span>{formatCurrency(maxSales / 2)}</span>
              <span>Rs 0</span>
            </div>
            <div className="chart-plot">
              <div className="chart-gridline line-one" />
              <div className="chart-gridline line-two" />
              <div className="chart-gridline line-three" />
              <div className="chart-bars">
                {weekData.map((day) => (
                  <div className="chart-day" key={day.key}>
                    <div className="bar-track">
                      <span
                        className={`sales-bar ${day.active ? 'today-bar' : ''} ${day.sales === 0 ? 'empty-bar' : ''}`}
                        style={{ height: `${Math.max(day.sales > 0 ? 8 : 3, (day.sales / maxSales) * 100)}%` }}
                        title={`${day.label}: ${formatCurrency(day.sales)}`}
                      />
                    </div>
                    <span className={`chart-day-label ${day.active ? 'today-label' : ''}`}>{day.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {weekData.every((day) => day.sales === 0) && (
            <p className="chart-empty-note">Your sales will appear here as soon as the first bill is paid.</p>
          )}
        </section>

        <section className="panel bestseller-panel">
          <div className="panel-heading">
            <div>
              <h2>Today’s favourites</h2>
              <p>Top dishes by quantity sold</p>
            </div>
            <span className="mini-icon mint"><Flame size={17} /></span>
          </div>
          {bestSellers.length > 0 ? (
            <div className="bestseller-list">
              {bestSellers.map(([name, count], index) => {
                const item = menu.find((menuItem) => menuItem.name === name)
                return (
                  <div className="bestseller-row" key={name}>
                    <span className={`bestseller-emoji rank-${index}`}>{item?.emoji ?? '🍽️'}</span>
                    <span className="bestseller-name"><strong>{name}</strong><small>{index === 0 ? 'Best seller today' : 'Popular choice'}</small></span>
                    <span className="bestseller-count">{count}<small>{count === 1 ? ' plate' : ' plates'}</small></span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bestseller-empty">
              <span className="empty-plate">🍽️</span>
              <strong>Your next signature dish starts here</strong>
              <span>Paid orders will reveal your best sellers.</span>
              <button type="button" onClick={onNavigate}>{canCreateOrders ? 'Take your first order' : 'View reports'} <ArrowUpRight size={14} /></button>
            </div>
          )}
        </section>
      </div>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p>Your latest service at a glance</p>
          </div>
          <button className="text-button" type="button" onClick={onNavigate}>{canCreateOrders ? 'New order' : 'View reports'} <ArrowUpRight size={14} /></button>
        </div>
        {recentOrders.length > 0 ? (
          <div className="recent-table-wrap">
            <table className="recent-table">
              <thead>
                <tr><th>ORDER</th><th>TABLE / TYPE</th><th>ITEMS</th><th>AMOUNT</th><th>TIME</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} onClick={() => onOpenOrder(order)} className={order.status === 'pending' ? 'order-row-clickable' : ''}>
                    <td><strong className="order-number">{order.number}</strong></td>
                    <td><span className="table-pill">{order.table}</span></td>
                    <td className="recent-items">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</td>
                    <td><strong>{formatCurrency(order.total)}</strong></td>
                    <td className="recent-time">{formatTime(order.createdAt)}</td>
                    <td><span className={`status-pill ${order.status}`}>{order.status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Cancelled' : `${order.status[0].toUpperCase()}${order.status.slice(1)}`}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="recent-empty">
            <span className="recent-empty-icon"><ShoppingBag size={18} /></span>
            <div><strong>No orders yet today</strong><span>Your service starts with one tap.</span></div>
            <button type="button" onClick={onNavigate}>{canCreateOrders ? 'Create an order' : 'View reports'} <ArrowUpRight size={14} /></button>
          </div>
        )}
      </section>
      {lowStock.length > 0 && (
        <section className="panel dashboard-low-stock" aria-label="Low stock alerts">
          <div className="panel-heading">
            <div><h2>Low stock alert</h2><p>{lowStock.length} ingredient{lowStock.length === 1 ? '' : 's'} at or below reorder level</p></div>
            <button type="button" className="text-button" onClick={onInventory}>Review inventory <ArrowUpRight size={14} /></button>
          </div>
          <div className="low-stock-list">
            {lowStock.map((item) => (
              <span className="low-stock-chip" key={item.name}><strong>{item.name}</strong><small>{item.stock} {item.unit} left · alert at {item.alertThreshold}</small></span>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

type MetricCardProps = {
  title: string
  value: string
  caption: string
  icon: React.ReactNode
  tone: 'green' | 'blue' | 'amber' | 'rose'
  trend?: string
}

function MetricCard({ title, value, caption, icon, tone, trend }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        {trend && (
          <span className={`metric-trend ${trend === 'Coming next' ? 'muted' : ''}`}>
            {trend === 'Coming next' ? <Clock3 size={12} /> : trend === 'Estimated' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
            {trend}
          </span>
        )}
      </div>
      <div className="metric-title">{title}</div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-caption">{caption}</span>
    </article>
  )
}

export default App
