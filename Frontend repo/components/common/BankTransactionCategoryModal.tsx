import {
  BROKER_CATEGORY_VALUES,
  formatCategoryLabel,
  type BrokerCategoryValue,
} from '../applications/bankTransactionCategoryUi'

type Props = {
  description: string
  pickCategory: BrokerCategoryValue
  onPickCategory: (v: BrokerCategoryValue) => void
  saving: boolean
  onDismiss: () => void
  onSave: () => void
}

/** Modal for brokers to pick a category when editing a bank line item. */
export function BankTransactionCategoryModal({
  description,
  pickCategory,
  onPickCategory,
  saving,
  onDismiss,
  onSave,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => !saving && onDismiss()}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="mb-2 text-lg font-bold text-slate-900">Set category</h4>
        <p className="mb-4 line-clamp-3 text-sm text-slate-600">{description}</p>
        <label className="mb-4 block text-xs font-semibold uppercase text-slate-500">
          Category
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={pickCategory}
            onChange={(e) => onPickCategory(e.target.value as BrokerCategoryValue)}
          >
            {BROKER_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {formatCategoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => !saving && onDismiss()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
