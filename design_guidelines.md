# Rice Mill Management Software - Design Guidelines

## Design Approach

**Selected Approach:** Design System with Modern Business Application Standards

**Justification:** This is a utility-focused, information-dense business management system requiring clarity, efficiency, and data organization over visual flair. Drawing inspiration from:
- **Linear** for clean, modern interface patterns and typography
- **Notion** for versatile data display and form interactions
- **QuickBooks/Xero** for accounting-specific patterns and dashboard structure

**Core Principles:**
- Data clarity over decoration
- Workflow efficiency and minimal clicks
- Scannable information hierarchy
- Professional, trustworthy aesthetic suitable for business operations

---

## Typography

**Font Families:**
- **Primary:** Inter (all weights 400-700) - excellent for data tables and forms
- **Monospace:** JetBrains Mono - for numbers, amounts, IDs, invoice numbers
- **Urdu:** Noto Nastaliq Urdu - authentic, readable Urdu script

**Type Scale:**
- **Headings:** text-3xl (dashboard), text-2xl (page titles), text-xl (section headers)
- **Body:** text-base (default forms/tables), text-sm (table cells, labels)
- **Data:** text-lg font-mono (amounts, totals), text-sm font-mono (IDs, codes)
- **Small:** text-xs (metadata, timestamps, helper text)

**Weights:** 400 (regular), 500 (medium for labels), 600 (semibold for headings), 700 (bold for totals/emphasis)

---

## Layout System

**Spacing Primitives:** Use Tailwind units 2, 4, 6, 8, 12, 16

**Application Structure:**
- Fixed sidebar navigation (w-64) with company logo, main modules, user profile
- Top bar (h-16) with breadcrumbs, language toggle, notifications, search
- Content area with max-w-7xl container, generous px-8 py-6 padding

**Grid Patterns:**
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 with gap-6
- Form layouts: Two-column (grid-cols-2 gap-6) for related fields
- Data tables: Full-width with sticky headers

---

## Component Library

### Navigation & Structure
- **Sidebar:** Dark background, icon + label menu items, collapsible sub-sections, active state indicator
- **Top Bar:** Search input (w-96), icon buttons for notifications/settings, language switcher (EN/UR toggle)
- **Breadcrumbs:** text-sm with separator icons for navigation context

### Forms & Inputs
- **Input Fields:** Standard height (h-10), clear labels above, border focus states, supporting text below
- **Select Dropdowns:** Searchable for customers/suppliers/products, recent items at top
- **Date Pickers:** Calendar overlay with range selection for reports
- **Number Inputs:** Right-aligned, monospace font, thousand separators
- **Multi-language Fields:** Side-by-side English/Urdu input pairs with clear labels

### Data Display
- **Tables:** Alternating row backgrounds, sticky headers, sortable columns, right-aligned numbers, action column (fixed right)
- **Cards:** Rounded corners (rounded-lg), subtle shadow, header with icon + title, metric display with large numbers
- **Badges:** Pill-shaped status indicators (Processing, Completed, Pending) with semantic styling
- **Stats:** Large number (text-3xl font-mono), small label below, trend indicator (up/down arrow)

### Actions & Feedback
- **Primary Buttons:** Solid background, medium size (h-10 px-6), clear labels
- **Secondary Buttons:** Outlined style for cancel/alternative actions
- **Icon Buttons:** Square (w-10 h-10) for table row actions, toolbar controls
- **Loading States:** Skeleton loaders for tables, spinner for button actions

### Dashboard Components
- **Summary Cards:** 4-column grid showing total purchases, sales, stock value, profit
- **Charts:** Line charts for trends (purchases/sales over time), bar charts for product-wise analysis, pie charts for expense breakdown
- **Recent Activity:** Timeline-style list showing latest transactions
- **Quick Actions:** Large button tiles for common workflows (New Purchase, New Sale, Process Stock)

### Print/PDF Views
- **Invoices:** A4 portrait, company header, line items table, totals box, Urdu gate-pass section
- **Reports:** Clean typography, minimal borders, clear section breaks
- **Ledgers:** Two-column debit/credit format, running balance column

### Multi-language Considerations
- **RTL Support:** Automatic layout flip for Urdu, mirrored navigation, right-aligned text
- **Language Toggle:** Persistent position, immediate UI update on switch
- **Dual Labels:** Show both languages where space permits (product names, categories)

### Modals & Overlays
- **Dialog Boxes:** Centered, max-w-2xl, clear title, form content, action buttons (footer)
- **Confirmation Dialogs:** Warning states for delete actions, clear consequences
- **Side Panels:** Slide-in from right for details/edit views (w-96 or w-1/3)

---

## Page-Specific Layouts

**Dashboard:** 4-column metrics grid, followed by 2-column layout (left: chart, right: recent activity), full-width table of pending items

**Purchase/Sale Entry:** Three-section layout - Party selection (top), line items table (middle with add row), summary calculation (right sidebar - sticky)

**Reports:** Filter bar (top with date range, party, product selectors), export buttons (PDF, Excel, WhatsApp), data table/chart below

**Ledger:** Party selector (dropdown with search), date range, two-column debit/credit table with running balance, totals footer

**Processing:** Kanban-style view with three columns (Purchased Stock, In Processing, Processed Stock), drag-drop or click to move items

---

## Key Interactions

- **Quick Search:** Global search (Cmd/Ctrl+K) for parties, products, invoices
- **Inline Editing:** Double-click table cells for quick edits where appropriate
- **Bulk Actions:** Checkbox selection in tables with bulk action toolbar
- **Auto-calculations:** Real-time totals, commissions, balances as user types
- **Keyboard Shortcuts:** Tab navigation through forms, Enter to submit, Esc to cancel

---

This design prioritizes operational efficiency, data accuracy, and professional presentation suitable for daily rice mill management tasks while supporting seamless bilingual operation.