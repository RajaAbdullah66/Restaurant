import { openDB, type DBSchema } from 'idb'
import { defaultRestaurantSettings, initialRestaurantData, type RestaurantData } from './data'

const databaseName = 'mehfil-restaurant'
const storeName = 'workspace'
const recordKey = 'restaurant-data'

interface RestaurantDatabase extends DBSchema {
  workspace: {
    key: string
    value: RestaurantData
  }
}

const database = openDB<RestaurantDatabase>(databaseName, 1, {
  upgrade(db) {
    db.createObjectStore(storeName)
  },
})

let writeQueue: Promise<void> = Promise.resolve()

export async function loadRestaurantData(): Promise<RestaurantData> {
  const db = await database
  const savedData = await db.get(storeName, recordKey)
  if (!savedData) return initialRestaurantData

  const settings = {
    ...defaultRestaurantSettings,
    ...savedData.settings,
  }
  return {
    ...initialRestaurantData,
    ...savedData,
    tables: savedData.tables ?? initialRestaurantData.tables,
    closings: savedData.closings ?? [],
    orders: (savedData.orders ?? []).map((order) => ({
      ...order,
      shift: order.shift ?? settings.shift,
    })),
    settings,
    expenses: savedData.expenses ?? initialRestaurantData.expenses,
    menu: savedData.menu ?? initialRestaurantData.menu,
    thankYouMessage: savedData.thankYouMessage ?? initialRestaurantData.thankYouMessage,
  }
}

export function saveRestaurantData(data: RestaurantData): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const db = await database
    await db.put(storeName, data, recordKey)
  })
  return writeQueue
}
