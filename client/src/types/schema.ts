/**
 * API entity types - matches backend response shapes.
 * Dates come as ISO strings from JSON serialization.
 */

export type Account = {
  id: number;
  name: string;
  nameUrdu: string | null;
  type: string;
  parentId: number | null;
  level: number;
  phone: string | null;
  address: string | null;
  addressUrdu: string | null;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
  isSystemAccount: boolean;
  createdAt: Date | string;
};

export type Product = {
  id: number;
  name: string;
  nameUrdu: string | null;
  productType: string;
  unit: string;
  currentStock: string;
  avgPurchasePrice: string;
  salePrice: string;
  isActive: boolean;
  createdAt: Date | string;
};

export type Purchase = {
  id: number;
  invoiceNumber: string;
  billNo: string | null;
  bookNo: string | null;
  supplierId: number;
  expenseAccountId: number | null;
  vehicleNumber: string | null;
  dueDate: Date | string | null;
  brokerId: number | null;
  brokerCommissionPercent: string | null;
  brokerCommissionAmount: string | null;
  subtotal: string;
  totalAmount: string;
  totalBags: string;
  totalGrossWeightKg: string;
  totalNetWeightKg: string;
  totalMoundQty: string;
  totalMoundRemainderKg: string;
  chargesAdd: string;
  chargesLess: string;
  taxTypeId: number | null;
  taxAmount: string;
  buyerAmount: string;
  balanceDue: string;
  paidAmount: string;
  notes: string | null;
  purchaseDate: Date | string;
  createdBy: number | null;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  deletedBy: number | null;
  items?: Array<Record<string, unknown>>;
  charges?: Array<Record<string, unknown>>;
};

export type Sale = {
  id: number;
  invoiceNumber: string;
  customerId: number;
  vehicleNumber: string | null;
  loadingCharges: string | null;
  weighingCharges: string | null;
  otherCharges: string | null;
  taxTypeId: number | null;
  taxAmount: string;
  subtotal: string;
  totalAmount: string;
  balanceDue: string;
  paidAmount: string;
  notes: string | null;
  gatePassNumber: string | null;
  saleDate: Date | string;
  createdBy: number | null;
  createdAt: Date | string;
};

export type ExpenseEntry = {
  id: number;
  voucherNo: string;
  expenseAccountId: number;
  payFromAccountId: number;
  amount: string;
  description: string | null;
  expenseDate: Date | string;
  createdBy: number | null;
  createdAt: Date | string;
};

export type Processing = {
  id: number;
  batchNumber: string;
  sourceProductId: number;
  sourceQuantity: string;
  outputProductId: number | null;
  outputCategory: string | null;
  outputQuantity: string | null;
  wastageQuantity: string | null;
  status: string;
  notes: string | null;
  startDate: Date | string;
  completedDate: Date | string | null;
  createdBy: number | null;
  createdAt: Date | string;
};

export type Employee = {
  id: number;
  employeeCode: string;
  name: string;
  fatherName: string | null;
  cnic: string | null;
  phone: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  joiningDate: Date | string | null;
  employmentType: string;
  status: string;
  accountId: number | null;
  createdBy: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Present when API joins with salary structure */
  basicSalary?: string;
};

export type EmployeeSalaryStructure = {
  id: number;
  employeeId: number;
  basicSalary: string;
  allowances: string;
  deductions: string;
  grossSalary: string;
  netSalary: string;
  allowancesJson: string | null;
  deductionsJson: string | null;
  effectiveFrom: Date | string;
  createdBy: number | null;
  createdAt: Date | string;
};

export type Payroll = {
  id: number;
  payrollMonth: string;
  employeeId: number;
  basicSalary: string;
  allowances: string;
  deductions: string;
  netSalary: string;
  paymentMethod: string | null;
  paymentAccountId: number | null;
  status: string;
  journalVoucherId: number | null;
  paymentJournalVoucherId: number | null;
  approvedBy: number | null;
  approvedByRole: string | null;
  approvedAt: Date | string | null;
  createdBy: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  paidAt: Date | string | null;
  /** Present when API includes payment state (e.g. Paid/Unpaid) */
  paymentStatus?: string;
};
