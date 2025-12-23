export type Language = "en" | "ur";

export const translations = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    accounts: "Accounts",
    products: "Products",
    purchases: "Purchases",
    processing: "Processing",
    sales: "Sales",
    reports: "Reports",
    hrPayroll: "HR & Payroll",
    settings: "Settings",
    journal: "Journal",
    journalVoucher: "Journal Voucher",
    logout: "Logout",
    
    // Account types
    customers: "Customers",
    suppliers: "Suppliers",
    banks: "Banks",
    expenses: "Expenses",
    
    // Common actions
    add: "Add",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    search: "Search",
    filter: "Filter",
    print: "Print",
    export: "Export",
    
    // Form labels
    name: "Name",
    nameUrdu: "Name (Urdu)",
    phone: "Phone",
    address: "Address",
    balance: "Balance",
    openingBalance: "Opening Balance",
    currentBalance: "Current Balance",
    
    // Purchase related
    purchaseDate: "Purchase Date",
    vehicleNumber: "Vehicle Number",
    supplier: "Supplier",
    broker: "Broker",
    brokerCommission: "Broker Commission",
    invoiceNumber: "Invoice Number",
    quantity: "Quantity",
    pricePerUnit: "Price/Unit",
    total: "Total",
    subtotal: "Subtotal",
    paidAmount: "Paid Amount",
    
    // Processing related
    batchNumber: "Batch Number",
    sourceProduct: "Source Product",
    outputProduct: "Output Product",
    inputQuantity: "Input Quantity",
    outputQuantity: "Output Quantity",
    wastage: "Wastage",
    status: "Status",
    pending: "Pending",
    inProgress: "In Progress",
    completed: "Completed",
    
    // Sales related
    saleDate: "Sale Date",
    customer: "Customer",
    loadingCharges: "Loading Charges",
    weighingCharges: "Weighing Charges",
    otherCharges: "Other Charges",
    gatePass: "Gate Pass",
    
    // Reports
    stockReport: "Stock Report",
    purchaseReport: "Purchase Report",
    cashReceipts: "Cash Receipts",
    cashPayments: "Cash Payments",
    cashInHand: "Cash in Hand",
    approve: "Approve",
    approved: "Approved",
    draft: "Draft",
    voucherNumber: "Voucher Number",
    voucherDate: "Voucher Date",
    voucherType: "Voucher Type",
    account: "Account",
    narration: "Narration",
    debit: "Debit",
    credit: "Credit",
    amountInWords: "Amount in Words",
    salesReport: "Sales Report",
    ledger: "Ledger",
    salesLedger: "Sales Ledger",
    purchaseLedger: "Purchase Ledger",
    journalLedger: "Journal Ledger",
    expenseLedger: "Expense Ledger",
    payrollLedger: "Payroll Ledger",
    employeePayLedger: "Employee Pay Ledger",
    cashLedger: "Cash Ledger",
    bankLedger: "Bank Ledger",
    trialBalance: "Trial Balance",
    profitLoss: "Profit & Loss",
    periodPurchases: "Period-wise Purchases",
    periodSales: "Period-wise Sales",
    grossProfit: "Gross Profit",
    dayBook: "Day Book",
    outstandingCustomers: "Outstanding Customers",
    outstandingSuppliers: "Outstanding Suppliers",
    incomeStatement: "Income Statement",
    balanceSheet: "Balance Sheet",
    capitalAccount: "Capital Account",
    salaryAccount: "Salary Account",
    employees: "Employees",
    payroll: "Payroll",
    
    // Dashboard
    totalPurchases: "Total Purchases",
    totalSales: "Total Sales",
    stockValue: "Stock Value",
    totalProfit: "Total Profit",
    recentActivity: "Recent Activity",
    quickActions: "Quick Actions",
    newPurchase: "New Purchase",
    newSale: "New Sale",
    processStock: "Process Stock",
    
    // Units
    kg: "kg",
    rs: "Rs.",
    
    // Messages
    noRecords: "No records found",
    loading: "Loading...",
    confirmDelete: "Are you sure you want to delete this item?",
    savedSuccessfully: "Saved successfully",
    deletedSuccessfully: "Deleted successfully",
    
    // Auth
    login: "Login",
    username: "Username",
    password: "Password",
    welcomeBack: "Welcome Back",
    signInToContinue: "Sign in to continue to your account",
    
    // Additional
    saveSettings: "Save Settings",
    actions: "Actions",
  },
  ur: {
    // Navigation
    dashboard: "ڈیش بورڈ",
    accounts: "کھاتے",
    products: "مصنوعات",
    purchases: "خریداری",
    processing: "پروسیسنگ",
    sales: "فروخت",
    reports: "رپورٹس",
    hrPayroll: "HR & Payroll",
    employees: "Employees",
    payroll: "Payroll",
    settings: "ترتیبات",
    logout: "لاگ آؤٹ",

    // Account types
    customers: "گاہک",
    suppliers: "سپلائرز",
    banks: "بینک",
    expenses: "اخراجات",

    // Common actions
    add: "شامل کریں",
    edit: "ترمیم کریں",
    delete: "حذف کریں",
    save: "محفوظ کریں",
    cancel: "منسوخ کریں",
    search: "تلاش",
    filter: "فلٹر",
    print: "پرنٹ",
    export: "ایکسپورٹ",

    // Form labels
    name: "نام",
    nameUrdu: "نام (اردو)",
    phone: "فون",
    address: "پتہ",
    balance: "بیلنس",
    openingBalance: "ابتدائی بیلنس",
    currentBalance: "موجودہ بیلنس",

    // Purchase related
    purchaseDate: "خریداری کی تاریخ",
    vehicleNumber: "گاڑی نمبر",
    supplier: "سپلائر",
    broker: "بروکر",
    brokerCommission: "بروکر کمیشن",
    invoiceNumber: "انوائس نمبر",
    quantity: "مقدار",
    pricePerUnit: "قیمت فی یونٹ",
    total: "کل",
    subtotal: "ذیلی کل",
    paidAmount: "ادا شدہ رقم",

    // Processing related
    batchNumber: "بیچ نمبر",
    sourceProduct: "سورس پروڈکٹ",
    outputProduct: "آؤٹ پٹ پروڈکٹ",
    inputQuantity: "ان پٹ مقدار",
    outputQuantity: "آؤٹ پٹ مقدار",
    wastage: "ضائع",
    status: "حالت",
    pending: "زیر التواء",
    inProgress: "جاری",
    completed: "مکمل",

    // Sales related
    saleDate: "فروخت کی تاریخ",
    customer: "گاہک",
    loadingCharges: "لوڈنگ چارجز",
    weighingCharges: "وزن چارجز",
    otherCharges: "دیگر چارجز",
    gatePass: "گیٹ پاس",

    // Reports
    stockReport: "اسٹاک رپورٹ",
    purchaseReport: "خریداری رپورٹ",
    cashReceipts: "نقد وصولیاں",
    cashPayments: "نقد ادائیگیاں",
    cashInHand: "نقد رقم",
    voucherNumber: "واؤچر نمبر",
    voucherDate: "واؤچر تاریخ",
    voucherType: "واؤچر قسم",
    account: "کھاتہ",
    narration: "تفصیل",
    debit: "ڈیبٹ",
    credit: "کریڈٹ",
    amountInWords: "رقم الفاظ میں",
    salesReport: "فروخت رپورٹ",
    ledger: "لیجر",
    salesLedger: "Sales Ledger",
    purchaseLedger: "Purchase Ledger",
    journalLedger: "جرنل لیجر",
    expenseLedger: "اخراجات لیجر",
    payrollLedger: "پے رول لیجر",
    employeePayLedger: "ملازم ادائیگی لیجر",
    cashLedger: "کیش لیجر",
    bankLedger: "بینک لیجر",
    trialBalance: "ٹرائل بیلنس",
    profitLoss: "نفع و نقصان",
    periodPurchases: "Period-wise Purchases",
    periodSales: "Period-wise Sales",
    grossProfit: "Gross Profit",
    dayBook: "Day Book",
    outstandingCustomers: "Outstanding Customers",
    outstandingSuppliers: "Outstanding Suppliers",
    incomeStatement: "Income Statement",
    balanceSheet: "Balance Sheet",
    capitalAccount: "Capital Account",
    salaryAccount: "Salary Account",

    // Dashboard
    totalPurchases: "کل خریداری",
    totalSales: "کل فروخت",
    stockValue: "اسٹاک ویلیو",
    totalProfit: "کل منافع",
    recentActivity: "حالیہ سرگرمیاں",
    quickActions: "فوری اقدامات",
    newPurchase: "نئی خریداری",
    newSale: "نئی فروخت",
    processStock: "اسٹاک پروسیس کریں",

    // Units
    kg: "کلو",
    rs: "روپے",

    // Messages
    noRecords: "کوئی ریکارڈ نہیں ملا",
    loading: "لوڈ ہو رہا ہے...",
    confirmDelete: "کیا آپ واقعی یہ آئٹم حذف کرنا چاہتے ہیں؟",
    savedSuccessfully: "کامیابی سے محفوظ ہو گیا",
    deletedSuccessfully: "کامیابی سے حذف ہو گیا",

    // Auth
    login: "لاگ ان",
    username: "یوزر نیم",
    password: "پاس ورڈ",
    welcomeBack: "خوش آمدید",
    signInToContinue: "جاری رکھنے کے لیے سائن ان کریں",

    // Additional
    saveSettings: "ترتیبات محفوظ کریں",
    actions: "اعمال",
    journal: "جرنل",
    journalVoucher: "جرنل ووچر",
    approve: "منظور کریں",
    approved: "منظور شدہ",
    draft: "ڈرافٹ",
  }
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getTranslation(lang: Language, key: TranslationKey): string {
  return translations[lang][key];
}
