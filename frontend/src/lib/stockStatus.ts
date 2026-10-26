/**
 * The stock status rule, in one place, usable on the server and in the browser.
 * It is the same rule the database uses (apply_stock_movement) and the AI endpoints use:
 * out of stock at 0, below the minimum when `quantity < minimum`, otherwise in stock.
 * Being exactly AT the minimum is still fine.
 */
export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export function inventoryStatus(quantity: number, minStockLevel: number): InventoryStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity < minStockLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}
