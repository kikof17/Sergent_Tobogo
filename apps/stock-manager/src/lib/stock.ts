import type {
  MovementsData,
  StockAction,
  StockData,
  StockMovement,
  StockProduct,
} from '../types'

function findVariant(products: StockProduct[], productId: string, variantId: string) {
  const productIndex = products.findIndex((product) => product.id === productId)

  if (productIndex === -1) {
    return null
  }

  const variantIndex = products[productIndex].variants.findIndex(
    (variant) => variant.id === variantId,
  )

  if (variantIndex === -1) {
    return null
  }

  return {
    productIndex,
    variantIndex,
  }
}

function resolveDelta(action: StockAction, quantity: number) {
  if (action === 'sale') {
    return -Math.abs(quantity)
  }

  if (action === 'entry') {
    return Math.abs(quantity)
  }

  return quantity
}

export function applyStockMovement(input: {
  products: StockData
  movements: MovementsData
  productId: string
  variantId: string
  action: StockAction
  quantity: number
  note: string
}) {
  const products = structuredClone(input.products)
  const movements = structuredClone(input.movements)
  const match = findVariant(products.products, input.productId, input.variantId)

  if (!match) {
    throw new Error('Variante introuvable pour ce mouvement.')
  }

  const delta = resolveDelta(input.action, input.quantity)
  const variant = products.products[match.productIndex].variants[match.variantIndex]
  const nextQuantity = variant.quantity + delta

  if (nextQuantity < 0) {
    throw new Error('Le stock ne peut pas devenir negatif.')
  }

  variant.quantity = nextQuantity

  const movement: StockMovement = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    action: input.action,
    productId: input.productId,
    variantId: input.variantId,
    quantity: delta,
    note: input.note.trim(),
  }

  movements.movements.unshift(movement)

  return {
    products: {
      ...products,
      updatedAt: movement.createdAt,
    },
    movements: {
      ...movements,
      updatedAt: movement.createdAt,
    },
  }
}

export function formatActionLabel(action: StockAction) {
  switch (action) {
    case 'entry':
      return 'Entree'
    case 'sale':
      return 'Sortie'
    case 'adjustment':
      return 'Correction'
  }
}
