/** Values brokers can assign to a bank transaction line. */
export const BROKER_CATEGORY_VALUES = [
  'income_salary',
  'income_other',
  'rent_mortgage',
  'food_groceries',
  'dining_takeaway',
  'transport_fuel',
  'utilities',
  'subscriptions',
  'loan_repayments',
  'gambling',
  'bnpl_afterpay',
  'other_expense',
] as const

export type BrokerCategoryValue = (typeof BROKER_CATEGORY_VALUES)[number]

/** Returns Tailwind background class for the category legend dot. */
export function categoryDotClass(category: string): string {
  if (category.startsWith('income_')) return 'bg-emerald-500'
  switch (category) {
    case 'rent_mortgage':
    case 'gambling':
    case 'bnpl_afterpay':
      return 'bg-red-500'
    case 'food_groceries':
      return 'bg-orange-500'
    case 'transport_fuel':
      return 'bg-yellow-400'
    case 'loan_repayments':
      return 'bg-purple-500'
    case 'utilities':
      return 'bg-blue-500'
    case 'subscriptions':
      return 'bg-gray-500'
    default:
      return 'bg-slate-300'
  }
}

/** Human-readable label for a stored category key. */
export function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
