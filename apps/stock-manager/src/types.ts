export type StockAction = 'entry' | 'sale' | 'adjustment'

export type StockVariant = {
  id: string
  size: string
  color: string
  detail: string | null
  quantity: number
  threshold: number
  lineLabel: string | null
}

export type StockProduct = {
  id: string
  name: string
  category: string
  collection: string | null
  sourceSheet: string
  variants: StockVariant[]
}

export type StockData = {
  updatedAt: string
  source: string
  products: StockProduct[]
}

export type StockMovement = {
  id: string
  createdAt: string
  action: StockAction
  productId: string
  variantId: string
  quantity: number
  note: string
}

export type MovementsData = {
  updatedAt: string
  movements: StockMovement[]
}

export type RepoFile<T> = {
  sha: string
  data: T
}
