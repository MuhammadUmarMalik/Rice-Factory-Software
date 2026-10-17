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
  description: string | null;
  isActive: boolean;
  isSystemAccount: boolean;
  createdAt: Date | string;
};

export type Product = {
  id: number;
  /** Has purchases/sales/processing/gate passes, so opening stock is fixed. */
  stockLocked?: boolean;
  name: string;
  nameUrdu: string | null;
  productType: string;
  unit: string;
  currentStock: string;
  avgPurchasePrice: string;
  salePrice: string;
  reorderLevel: string;
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
  moundBaseKg: number;
  chargesAdd: string;
  chargesLess: string;
  taxTypeId: number | null;
  taxAmount: string;
  buyerAmount: string;
  balanceDue: string;
  paidAmount: string;
  paymentMode?: string | null;
  cashPaymentId?: number | null;
  cashPaymentVoucherNo?: string | null;
  notes: string | null;
  purchaseDate: Date | string;
  createdBy: number | null;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  deletedBy: number | null;
  items?: Array<Record<string, unknown>>;
  charges?: Array<Record<string, unknown>>;
  /** Gate passes linked to this purchase (usually the arrival IN pass). */
  gatePasses?: LinkedGatePassRef[];
};

export type Sale = {
  id: number;
  invoiceNumber: string;
  customerId: number;
  vehicleNumber: string | null;
  loadingCharges: string | null;
  weighingCharges: string | null;
  otherCharges: string | null;
  rentCharges: string | null;
  discountAmount: string | null;
  taxTypeId: number | null;
  taxAmount: string;
  subtotal: string;
  totalAmount: string;
  balanceDue: string;
  paidAmount: string;
  notes: string | null;
  gatePassNumber: string | null;
  saleDate: Date | string;
  dueDate?: Date | string | null;
  paymentMode?: string | null;
  cashReceiptId?: number | null;
  cashReceiptVoucherNo?: string | null;
  /** Per-sale dispatch roll-up attached by the list endpoint. */
  dispatch?: SaleDispatchProgress | null;
  createdBy: number | null;
  createdAt: Date | string;
};

export type ExpenseEntry = {
  id: number;
  voucherNo: string;
  expenseAccountId: number;
  payFromAccountId: number;
  direction: string;
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

export type ProcessingOutput = {
  id: number;
  processingId: number;
  productId: number;
  quantity: string;
  outputType: "raw" | "bio";
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  openingBalance: string;
  openingBalanceType: "debit" | "credit";
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

// ---------------------------------------------------------------------------
// Gate passes
// ---------------------------------------------------------------------------

export type GatePassDirection = "IN" | "OUT";
export type GatePassStatus = "ISSUED" | "COMPLETED" | "CANCELLED";
export type GatePassSourceType = "PURCHASE" | "SALE" | "JOB_RECEIVE" | "JOB_RETURN";
export type DispatchLineStatus = "not_dispatched" | "partly_dispatched" | "fully_dispatched";

export type GatePassItem = {
  id: number;
  productId: number;
  productName: string | null;
  productNameUrdu: string | null;
  bags: number;
  /** Weight in integer grams. */
  weightG: number;
  /** Weight in decimal kilograms, as a string from the server. */
  weightKg: string;
  saleItemId: number | null;
  purchaseItemId: number | null;
};

export type GatePassLinkedDocument = {
  type: GatePassSourceType;
  id: number;
  number: string;
  label: string;
  date: string | null;
};

export type GatePass = {
  id: number;
  number: string;
  direction: GatePassDirection;
  status: GatePassStatus;
  issuedAt: string;
  completedAt: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  partyId: number | null;
  sourceType: GatePassSourceType | null;
  sourceId: number | null;
  /** Weights in integer grams. */
  grossG: number | null;
  tareG: number | null;
  netG: number | null;
  remarks: string | null;
  createdBy: number | null;
  cancelledReason: string | null;
  cancelledBy: number | null;
  cancelledAt: string | null;
  fiscalYearId: number | null;
  createdAt: string;
  updatedAt: string;
  // Detail-only fields (present on GET /api/gate-passes/:id)
  items?: GatePassItem[];
  totalBags?: number;
  totalWeightG?: number;
  totalWeightKg?: string;
  partyName?: string | null;
  linkedDocument?: GatePassLinkedDocument | null;
  /** Set by the server when the weighbridge net differs from the linked document net by >0.5%. */
  weighbridgeWarning?: string | null;
};

export type GatePassListRow = {
  id: number;
  number: string;
  direction: GatePassDirection;
  status: GatePassStatus;
  issuedAt: string;
  completedAt: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  partyId: number | null;
  partyName: string | null;
  sourceType: GatePassSourceType | null;
  sourceId: number | null;
  netG: number | null;
  totalBags: number;
  totalWeightG: number;
  itemCount: number;
};

export type LinkedGatePassRef = {
  id: number;
  number: string;
  status: GatePassStatus;
  direction: GatePassDirection;
};

/** Per-sale dispatch roll-up attached to sale list rows. */
export type SaleDispatchProgress = {
  saleId: number;
  status: DispatchLineStatus;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  orderedBags: number | null;
  dispatchedBags: number;
};

export type DispatchItemSummary = {
  productId: number;
  productName: string | null;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  orderedBags: number | null;
  dispatchedBags: number;
  status: DispatchLineStatus;
};

export type SaleDispatchSummary = {
  saleId: number;
  invoiceNumber: string;
  status: DispatchLineStatus;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  items: DispatchItemSummary[];
  passes: GatePassListRow[];
};

export type GatePassDashboard = {
  vehiclesInside: number;
  dispatchedBagsToday: number;
  openPasses: number;
  staleOpenPasses: GatePassListRow[];
};
