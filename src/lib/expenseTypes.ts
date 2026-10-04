// Expense categories and payment methods, shared by the server code
// (lib/expenses.ts) and the forms in the browser.

export const EXPENSE_CATEGORIES = [
  "Ingredients",
  "Stock for resale",
  "Supplies",
  "Utilities",
  "Rent",
  "Salaries",
  "Transport",
  "Repairs",
  "Other",
] as const;

// Hints shown under the category picker.
export const EXPENSE_CATEGORY_HINTS: Record<string, string> = {
  Ingredients: "Flour, sugar, eggs, butter, yeast… for the bread and pastries",
  "Stock for resale": "Goods bought to sell as they are (when not entered as a delivery)",
  Supplies: "Plastic bags, paper, cleaning things, receipt paper",
  Utilities: "Electricity, water, LPG/gas, internet, load",
  Rent: "Store or space rent",
  Salaries: "Wages and allowances",
  Transport: "Fare, delivery, gasoline",
  Repairs: "Fixing equipment or the store",
  Other: "Anything else",
};

export const EXPENSE_METHODS = ["Cash", "GCash", "Maya", "Card", "Bank"] as const;

export interface Expense {
  id: number;
  spent_on: string; // YYYY-MM-DD, Philippine date
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  from_drawer: number; // 1 = cash taken from the register drawer
  supplier: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string | null;
}
