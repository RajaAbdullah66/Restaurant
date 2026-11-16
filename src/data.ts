export const categoryNames = [
  'Breakfast',
  'Lunch / Dinner',
  'Karahi',
  'Platter',
  'BBQ',
  'Drinks',
  'Sides',
] as const

export type MenuCategory = (typeof categoryNames)[number]

export type MenuItem = {
  id: string
  name: string
  category: MenuCategory
  price: number
  unitCost: number
  emoji: string
  available: boolean
  recipe?: Record<string, number>
  variants?: MenuVariant[]
}

export type MenuVariant = {
  id: string
  name: string
  price: number
  unitCost: number
  recipeMultiplier: number
}

export type CartEntry = {
  menuItemId: string
  quantity: number
}

export type InventoryMovement = {
  id: string
  date: string
  change: number
  note: string
}

export type InventoryItem = {
  name: string
  unit: string
  stock: number
  alertThreshold: number
  unitCost: number
  history: InventoryMovement[]
}

export type Order = {
  id: string
  number: string
  orderType: 'Dine-in' | 'Takeaway' | 'Delivery'
  table: string
  items: Array<{
    menuItemId: string
    name: string
    emoji: string
    price: number
    unitCost: number
    quantity: number
    recipe?: Record<string, number>
  }>
  subtotal: number
  discount: number
  total: number
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled'
  paymentMethod?: 'Cash' | 'Card'
  shift?: RestaurantSettings['shift']
  submittedBy?: string
  submittedByRole?: 'owner' | 'cashier' | 'waiter' | 'kitchen'
  createdAt: string
  updatedAt: string
}

export type ExpenseCategory = 'Rent' | 'Staff Salary' | 'Sabzi / Gosht' | 'Gas' | 'Other'

export type Expense = {
  id: string
  date: string
  category: ExpenseCategory
  title?: string
  amount: number
  note: string
}

export type DailyClosing = {
  id: string
  date: string
  shift: RestaurantSettings['shift']
  closedAt: string
  closedBy: string
  totalSale: number
  totalCash: number
  totalCard: number
  totalExpense: number
  cashInHand: number
  cashierSubmittedAmount: number
  estimatedItemCost: number
  profit: number
}

export type RestaurantSettings = {
  restaurantName: string
  address: string
  phone: string
  shift: 'Morning' | 'Evening'
  printerSize: '80mm' | '58mm'
  cashierSubmittedAmount: number
  thankYouMessage: string
}

export type RestaurantData = {
  menu: MenuItem[]
  orders: Order[]
  tables: string[]
  closings: DailyClosing[]
  cart: CartEntry[]
  orderType: Order['orderType']
  selectedTable: string
  discount: number
  activeOrderId: string | null
  thankYouMessage: string
  expenses: Expense[]
  settings: RestaurantSettings
}

export const defaultRestaurantSettings: RestaurantSettings = {
  restaurantName: 'Mehfil Restaurant',
  address: 'Lahore, Pakistan',
  phone: '+92 300 1234567',
  shift: 'Morning',
  printerSize: '80mm',
  cashierSubmittedAmount: 25000,
  thankYouMessage: 'Shukriya, dobara tashreef layein!',
}

export const defaultExpenses: Expense[] = []

export const initialRestaurantData: RestaurantData = {
  tables: Array.from({ length: 6 }, (_, index) => `Table ${index + 1}`),
  menu: [
    { id: 'halwa-puri', name: 'Halwa Puri', category: 'Breakfast', price: 480, unitCost: 185, emoji: '🥘', available: true },
    { id: 'anda-paratha', name: 'Anda Paratha', category: 'Breakfast', price: 320, unitCost: 112, emoji: '🍳', available: true },
    { id: 'nashta-platter', name: 'Nashta Platter', category: 'Breakfast', price: 790, unitCost: 315, emoji: '🍽️', available: true },
    { id: 'chicken-karahi', name: 'Chicken Karahi', category: 'Karahi', price: 1850, unitCost: 850, emoji: '🍲', available: true },
    { id: 'mutton-karahi', name: 'Mutton Karahi', category: 'Karahi', price: 2950, unitCost: 1540, emoji: '🍛', available: true },
    { id: 'white-karahi', name: 'White Karahi', category: 'Karahi', price: 2150, unitCost: 980, emoji: '🥘', available: true },
    { id: 'bbq-platter', name: 'BBQ Family Platter', category: 'Platter', price: 3290, unitCost: 1460, emoji: '🍱', available: true },
    { id: 'tikka-platter', name: 'Chicken Tikka Platter', category: 'Platter', price: 1690, unitCost: 710, emoji: '🍗', available: true },
    { id: 'malai-boti', name: 'Malai Boti', category: 'BBQ', price: 890, unitCost: 370, emoji: '🍢', available: true },
    { id: 'seekh-kebab', name: 'Seekh Kebab', category: 'BBQ', price: 690, unitCost: 285, emoji: '🥙', available: true },
    { id: 'chicken-tikka', name: 'Chicken Tikka', category: 'BBQ', price: 790, unitCost: 335, emoji: '🍗', available: true },
    { id: 'mint-margarita', name: 'Mint Margarita', category: 'Drinks', price: 390, unitCost: 105, emoji: '🍹', available: true },
    { id: 'mango-lassi', name: 'Mango Lassi', category: 'Drinks', price: 350, unitCost: 130, emoji: '🥤', available: true },
    { id: 'doodh-patti', name: 'Doodh Patti Chai', category: 'Drinks', price: 180, unitCost: 52, emoji: '☕', available: true },
    { id: 'butter-naan', name: 'Butter Naan', category: 'Sides', price: 100, unitCost: 34, emoji: '🫓', available: true },
    { id: 'fresh-salad', name: 'Fresh Salad', category: 'Sides', price: 180, unitCost: 60, emoji: '🥗', available: true },
  ],
  orders: [],
  closings: [],
  cart: [],
  orderType: 'Dine-in',
  selectedTable: 'Table 1',
  discount: 0,
  activeOrderId: null,
  thankYouMessage: defaultRestaurantSettings.thankYouMessage,
  expenses: defaultExpenses,
  settings: defaultRestaurantSettings,
}
