/**
 * Employee, salary structure and payroll persistence, extracted from the
 * "// HR / Employees", "// Salary Structures" and "// Payroll" sections of
 * storage.ts.
 *
 * The auto-mark helpers at the top were private methods of DatabaseStorage
 * defined outside those sections; they belong to payroll and are called from
 * journal-vouchers.model and ledger.model when a payable account is settled.
 * See the cycle note in journal-vouchers.model.
 */
import { db } from "./db";
import { eq, and, or, desc, lte } from "drizzle-orm";
import {
  accounts,
  employees,
  employeeSalaryStructures,
  payrolls,
  payrollAuditLogs,
  journalVouchers,
  journalVoucherEntries,
  cashAccounts,
  cashPayments,
  auditLogs,
  type Employee,
  type InsertEmployee,
  type EmployeeSalaryStructure,
  type InsertEmployeeSalaryStructure,
  type Payroll,
  type JournalVoucher,
  type PayrollAuditLog,
} from "../db/schema";
import { parseAmount } from "../utils/parse";
import { endOfMonth, parsePayrollMonth, startOfPayrollMonth } from "../utils/dates";
import { assertPostingAllowed } from "../services/posting-guard.service";
import * as ledgerModel from "./ledger.model";
import * as jvModel from "./journal-vouchers.model";
import type { JournalEntryInput } from "./journal-vouchers.model";

type DbClient = typeof db;

export function autoMarkPayrollApprovedForEmployee(
  client: DbClient,
  opts: {
    employeeAccountId: number;
    amount: number;
    postingDate: Date;
    journalVoucherId?: number | null;
    source: string;
    actorUserId?: number;
    actorRole?: string;
  },
) {
  if (!Number.isFinite(opts.amount) || opts.amount <= 0) return;

  const [emp] = client
    .select({ id: employees.id, employeeCode: employees.employeeCode })
    .from(employees)
    .where(eq(employees.accountId, opts.employeeAccountId))
    .limit(1)
    .all();
  if (!emp) return;

  const generatedRows = client
    .select()
    .from(payrolls)
    .where(and(eq(payrolls.employeeId, emp.id), eq(payrolls.status, "generated")))
    .orderBy(payrolls.payrollMonth, payrolls.id)
    .all();
  if (!generatedRows.length) return;

  const postingMonth = opts.postingDate.toISOString().slice(0, 7);
  const amount = opts.amount;
  const sameMonthExact = generatedRows.find(
    (p) => p.payrollMonth === postingMonth && Math.abs(parseAmount(p.netSalary || "0") - amount) < 0.0001,
  );
  const exactAnyMonth = generatedRows.find((p) => Math.abs(parseAmount(p.netSalary || "0") - amount) < 0.0001);
  const target = sameMonthExact ?? exactAnyMonth;
  if (!target) return;

  client
    .update(payrolls)
    .set({
      status: "approved",
      approvedBy: opts.actorUserId,
      approvedByRole: opts.actorRole,
      approvedAt: opts.postingDate,
      journalVoucherId: opts.journalVoucherId ?? target.journalVoucherId ?? null,
      updatedAt: new Date(),
    } as any)
    .where(eq(payrolls.id, target.id))
    .run();

  client
    .insert(payrollAuditLogs)
    .values({
      payrollId: target.id,
      action: "approved",
      performedBy: opts.actorUserId,
      performedByRole: opts.actorRole,
      detailsJson: JSON.stringify({
        autoMatched: true,
        source: opts.source,
        amount: amount.toString(),
        postingDate: opts.postingDate.toISOString(),
        journalVoucherId: opts.journalVoucherId ?? null,
      }),
    } as any)
    .run();
}

export function autoMarkPayrollPaidForEmployee(
  client: DbClient,
  opts: {
    employeeAccountId: number;
    amount: number;
    paymentDate: Date;
    method: "Cash" | "Bank";
    paymentJournalVoucherId?: number | null;
    source: string;
    actorUserId?: number;
    actorRole?: string;
  },
) {
  if (!Number.isFinite(opts.amount) || opts.amount <= 0) return;

  const [emp] = client
    .select({ id: employees.id, employeeCode: employees.employeeCode })
    .from(employees)
    .where(eq(employees.accountId, opts.employeeAccountId))
    .limit(1)
    .all();
  if (!emp) return;

  const approvedRows = client
    .select()
    .from(payrolls)
    .where(and(eq(payrolls.employeeId, emp.id), eq(payrolls.status, "approved")))
    .orderBy(payrolls.payrollMonth, payrolls.id)
    .all();
  if (!approvedRows.length) return;

  const paymentMonth = opts.paymentDate.toISOString().slice(0, 7);
  const amount = opts.amount;
  const sameMonthExact = approvedRows.find(
    (p) => p.payrollMonth === paymentMonth && Math.abs(parseAmount(p.netSalary || "0") - amount) < 0.0001,
  );
  const exactAnyMonth = approvedRows.find((p) => Math.abs(parseAmount(p.netSalary || "0") - amount) < 0.0001);
  const target = sameMonthExact ?? exactAnyMonth;
  if (!target) return;

  client
    .update(payrolls)
    .set({
      status: "paid",
      paymentMethod: opts.method,
      paidAt: opts.paymentDate,
      paymentJournalVoucherId: opts.paymentJournalVoucherId ?? target.paymentJournalVoucherId ?? null,
      updatedAt: new Date(),
    } as any)
    .where(eq(payrolls.id, target.id))
    .run();

  client
    .insert(payrollAuditLogs)
    .values({
      payrollId: target.id,
      action: "paid",
      performedBy: opts.actorUserId,
      performedByRole: opts.actorRole,
      detailsJson: JSON.stringify({
        autoMatched: true,
        source: opts.source,
        amount: amount.toString(),
        method: opts.method,
        paymentDate: opts.paymentDate.toISOString(),
        paymentJournalVoucherId: opts.paymentJournalVoucherId ?? null,
      }),
    } as any)
    .run();
}

// Employees
export async function getEmployees(): Promise<Employee[]> {
  const rows = db.select().from(employees).orderBy(employees.name).all();
  const salaryRows = db
    .select({
      employeeId: employeeSalaryStructures.employeeId,
      basicSalary: employeeSalaryStructures.basicSalary,
      effectiveFrom: employeeSalaryStructures.effectiveFrom,
      id: employeeSalaryStructures.id,
    })
    .from(employeeSalaryStructures)
    .orderBy(desc(employeeSalaryStructures.effectiveFrom), desc(employeeSalaryStructures.id))
    .all();

  const latestByEmployee = new Map<number, string>();
  for (const s of salaryRows) {
    if (!latestByEmployee.has(s.employeeId)) {
      latestByEmployee.set(s.employeeId, s.basicSalary || "0");
    }
  }

  return rows.map((row) => ({
    ...row,
    basicSalary: latestByEmployee.get(row.id) || "0",
  })) as any;
}

export async function getEmployee(id: number): Promise<Employee | undefined> {
  const [row] = db.select().from(employees).where(eq(employees.id, id)).all();
  if (!row) return undefined;
  const [latest] = db
    .select({ basicSalary: employeeSalaryStructures.basicSalary })
    .from(employeeSalaryStructures)
    .where(eq(employeeSalaryStructures.employeeId, id))
    .orderBy(desc(employeeSalaryStructures.effectiveFrom), desc(employeeSalaryStructures.id))
    .limit(1)
    .all();
  return {
    ...row,
    basicSalary: latest?.basicSalary || "0",
  } as any;
}

export function generateEmployeeCodeInternal(client: DbClient): string {
  const [last] = client.select({ code: employees.employeeCode }).from(employees).orderBy(desc(employees.id)).limit(1).all();
  const prefix = `EMP-${new Date().getFullYear()}-`;
  if (!last?.code || !last.code.startsWith(prefix)) {
    return `${prefix}${String(1).padStart(5, "0")}`;
  }
  const n = parseInt(last.code.slice(prefix.length), 10);
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export async function createEmployee(employee: InsertEmployee): Promise<Employee> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const employeeCode = generateEmployeeCodeInternal(client);

    const employeeAccount = tx.insert(accounts).values({
      name: `Employee Payable: ${employee.name} (${employeeCode})`,
      type: "employee" as any,
      openingBalance: "0",
      currentBalance: "0",
      isActive: true as any,
      isSystemAccount: false as any,
    }).returning().get();

    const created = tx.insert(employees).values({
      ...employee,
      employeeCode,
      accountId: employeeAccount.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning().get();

    return created as any;
  });
}

export async function updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
  return db.transaction((tx) => {
    const [existing] = tx.select().from(employees).where(eq(employees.id, id)).all();
    if (!existing) return undefined;

    const updated = tx.update(employees).set({
      ...employee,
      updatedAt: new Date(),
    } as any).where(eq(employees.id, id)).returning().get();

    if (employee.name && existing.accountId) {
      tx.update(accounts).set({
        name: `Employee Payable: ${employee.name} (${existing.employeeCode})`,
      } as any).where(eq(accounts.id, existing.accountId)).run();
    }

    return updated as any;
  });
}

// Salary Structures
export async function getEmployeeSalaryStructures(employeeId: number): Promise<EmployeeSalaryStructure[]> {
  return db
    .select()
    .from(employeeSalaryStructures)
    .where(eq(employeeSalaryStructures.employeeId, employeeId))
    .orderBy(desc(employeeSalaryStructures.effectiveFrom))
    .all();
}

export async function getEffectiveSalaryStructure(employeeId: number, asOf: Date): Promise<EmployeeSalaryStructure | undefined> {
  const [row] = db
    .select()
    .from(employeeSalaryStructures)
    .where(and(eq(employeeSalaryStructures.employeeId, employeeId), lte(employeeSalaryStructures.effectiveFrom, asOf)))
    .orderBy(desc(employeeSalaryStructures.effectiveFrom))
    .limit(1)
    .all();
  return row;
}

export async function createEmployeeSalaryStructure(data: InsertEmployeeSalaryStructure): Promise<EmployeeSalaryStructure> {
  const basic = parseAmount((data as any).basicSalary || "0");
  const allowances = parseAmount((data as any).allowances || "0");
  const deductions = parseAmount((data as any).deductions || "0");
  const gross = basic + allowances;
  const net = gross - deductions;
  if (net < 0) throw new Error("Net salary cannot be negative");

  const created = db.insert(employeeSalaryStructures).values({
    ...data,
    grossSalary: gross.toString(),
    netSalary: net.toString(),
    createdAt: new Date(),
  } as any).returning().get();

  return created as any;
}

export async function updateEmployeeSalaryStructure(
  employeeId: number,
  structureId: number,
  data: Partial<InsertEmployeeSalaryStructure>,
): Promise<EmployeeSalaryStructure | undefined> {
  return db.transaction((tx) => {
    const [existing] = tx
      .select()
      .from(employeeSalaryStructures)
      .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
      .all();
    if (!existing) return undefined;

    const basic =
      data.basicSalary !== undefined ? parseAmount(data.basicSalary as any) : parseAmount(existing.basicSalary);
    const allowances =
      data.allowances !== undefined ? parseAmount(data.allowances as any) : parseAmount(existing.allowances);
    const deductions =
      data.deductions !== undefined ? parseAmount(data.deductions as any) : parseAmount(existing.deductions);
    const gross = basic + allowances;
    const net = gross - deductions;
    if (net < 0) throw new Error("Net salary cannot be negative");

    const updateData: any = {
      grossSalary: gross.toString(),
      netSalary: net.toString(),
    };
    if (data.basicSalary !== undefined) updateData.basicSalary = data.basicSalary;
    if (data.allowances !== undefined) updateData.allowances = data.allowances;
    if (data.deductions !== undefined) updateData.deductions = data.deductions;
    if (data.effectiveFrom !== undefined) updateData.effectiveFrom = data.effectiveFrom as any;

    const updated = tx
      .update(employeeSalaryStructures)
      .set(updateData)
      .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
      .returning()
      .get();
    return updated as any;
  });
}

export async function deleteEmployeeSalaryStructure(employeeId: number, structureId: number): Promise<boolean> {
  const result = await db
    .delete(employeeSalaryStructures)
    .where(and(eq(employeeSalaryStructures.id, structureId), eq(employeeSalaryStructures.employeeId, employeeId)))
    .run();
  return result.changes > 0;
}

// Payroll
export async function getPayrollById(payrollId: number): Promise<Payroll | undefined> {
  const [row] = db.select().from(payrolls).where(eq(payrolls.id, payrollId)).limit(1).all();
  return row;
}

export async function getPayrolls(filters?: { month?: string; status?: string; employeeId?: number }): Promise<Payroll[]> {
  const where: any[] = [];
  if (filters?.month) where.push(eq(payrolls.payrollMonth, filters.month));
  if (filters?.status) where.push(eq(payrolls.status, filters.status as any));
  if (filters?.employeeId) where.push(eq(payrolls.employeeId, filters.employeeId));

  const rows = where.length
    ? db.select().from(payrolls).where(and(...(where as any))).orderBy(desc(payrolls.id)).all()
    : db.select().from(payrolls).orderBy(desc(payrolls.id)).all();

  // Repair stale generated rows that are stuck at zero net.
  // Use effective structure for payroll month; if missing, fallback to latest known structure.
  for (const row of rows) {
    if (row.status !== "generated") continue;
    const currentNet = parseAmount((row as any).netSalary || "0");
    if (currentNet > 0) continue;

    const { year, month } = parsePayrollMonth(row.payrollMonth);
    const monthEnd = endOfMonth(new Date(year, month - 1, 1));

    const [effectiveStructure] = db
      .select()
      .from(employeeSalaryStructures)
      .where(and(eq(employeeSalaryStructures.employeeId, row.employeeId), lte(employeeSalaryStructures.effectiveFrom, monthEnd)))
      .orderBy(desc(employeeSalaryStructures.effectiveFrom), desc(employeeSalaryStructures.id))
      .limit(1)
      .all();
    const [latestStructure] = effectiveStructure
      ? [effectiveStructure]
      : db
        .select()
        .from(employeeSalaryStructures)
        .where(eq(employeeSalaryStructures.employeeId, row.employeeId))
        .orderBy(desc(employeeSalaryStructures.effectiveFrom), desc(employeeSalaryStructures.id))
        .limit(1)
        .all();
    if (!latestStructure) continue;

    const basic = parseAmount(latestStructure.basicSalary || "0");
    const allowances = parseAmount(latestStructure.allowances || "0");
    const deductions = parseAmount(latestStructure.deductions || "0");
    const net = Math.max(basic + allowances - deductions, 0);
    if (net <= 0) continue;

    db.update(payrolls).set({
      basicSalary: basic.toString(),
      allowances: allowances.toString(),
      deductions: deductions.toString(),
      netSalary: net.toString(),
      updatedAt: new Date(),
    } as any).where(eq(payrolls.id, row.id)).run();

    (row as any).basicSalary = basic.toString();
    (row as any).allowances = allowances.toString();
    (row as any).deductions = deductions.toString();
    (row as any).netSalary = net.toString();
  }

  return rows;
}

export async function updatePayroll(
  payrollId: number,
  payload: { basicSalary?: number; allowances?: number; deductions?: number },
  performedBy?: { userId?: number; role?: string },
): Promise<Payroll | undefined> {
  const existing = await getPayrollById(payrollId);
  if (!existing) return undefined;
  if (existing.status === "paid") {
    throw new Error("Paid payroll cannot be edited");
  }
  // If approved, remove accrual JV first so payroll is rolled back to generated state.
  if (existing.status === "approved" && existing.journalVoucherId) {
    await jvModel.deleteJournalVoucher(existing.journalVoucherId);
  }

  return db.transaction((tx) => {
    const [current] = tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).limit(1).all();
    if (!current) return undefined;
    if (current.status !== "generated") {
      throw new Error("Only generated or approved-unpaid payroll can be edited");
    }

    const basicSalary = payload.basicSalary !== undefined ? parseAmount(payload.basicSalary) : parseAmount(current.basicSalary || "0");
    const allowances = payload.allowances !== undefined ? parseAmount(payload.allowances) : parseAmount(current.allowances || "0");
    const deductions = payload.deductions !== undefined ? parseAmount(payload.deductions) : parseAmount(current.deductions || "0");
    const netSalary = basicSalary + allowances - deductions;
    if (netSalary < 0) throw new Error("Net salary cannot be negative");

    const updated = tx
      .update(payrolls)
      .set({
        basicSalary: basicSalary.toString(),
        allowances: allowances.toString(),
        deductions: deductions.toString(),
        netSalary: netSalary.toString(),
        updatedAt: new Date(),
      } as any)
      .where(eq(payrolls.id, payrollId))
      .returning()
      .get();

    tx.insert(payrollAuditLogs).values({
      payrollId,
      action: "updated",
      performedBy: performedBy?.userId,
      performedByRole: performedBy?.role,
      detailsJson: JSON.stringify({
        source: "payroll:manual_edit",
        before: {
          basicSalary: current.basicSalary,
          allowances: current.allowances,
          deductions: current.deductions,
          netSalary: current.netSalary,
        },
        after: {
          basicSalary: basicSalary.toString(),
          allowances: allowances.toString(),
          deductions: deductions.toString(),
          netSalary: netSalary.toString(),
        },
      }),
    } as any).run();

    return updated as any;
  });
}

export async function deletePayroll(payrollId: number, performedBy?: { userId?: number; role?: string }): Promise<boolean> {
  const existing = await getPayrollById(payrollId);
  if (!existing) return false;

  // Remove payment JV first, then accrual JV. This keeps payroll rollback logic consistent.
  if (existing.paymentJournalVoucherId) {
    await jvModel.deleteJournalVoucher(existing.paymentJournalVoucherId);
  }
  if (existing.journalVoucherId) {
    await jvModel.deleteJournalVoucher(existing.journalVoucherId);
  }

  const result = await db.delete(payrolls).where(eq(payrolls.id, payrollId)).run();
  if (result.changes > 0) {
    await db.insert(auditLogs).values({
      entity: "payroll",
      entityId: payrollId,
      action: "delete",
      performedBy: performedBy?.userId,
      performedByRole: performedBy?.role,
      source: "api",
    } as any).run();
  }
  return result.changes > 0;
}

export async function generateMonthlyPayroll(month: string, performedBy?: { userId?: number; role?: string }) {
  parsePayrollMonth(month);
  const asOf = startOfPayrollMonth(month);

  return db.transaction((tx) => {
    const activeEmployees = tx.select().from(employees).where(eq(employees.status, "active" as any)).all();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let skippedNoStructure = 0;
    let skippedZeroNet = 0;
    let cleanedStaleGenerated = 0;

    for (const emp of activeEmployees) {
      const [existing] = tx
        .select()
        .from(payrolls)
        .where(and(eq(payrolls.payrollMonth, month), eq(payrolls.employeeId, emp.id)))
        .limit(1)
        .all();

      const [structure] = tx
        .select()
        .from(employeeSalaryStructures)
        .where(and(eq(employeeSalaryStructures.employeeId, emp.id), lte(employeeSalaryStructures.effectiveFrom, asOf)))
        .orderBy(desc(employeeSalaryStructures.effectiveFrom))
        .limit(1)
        .all();
      if (!structure) {
        skippedNoStructure += 1;
        continue;
      }

      const basic = parseAmount(structure?.basicSalary ?? "0");
      const allowances = parseAmount(structure?.allowances ?? "0");
      const deductions = parseAmount(structure?.deductions ?? "0");
      const net = Math.max(basic + allowances - deductions, 0);

      if (existing) {
        // Approved/paid rows should never be altered by re-generate.
        if (existing.status !== "generated") {
          skipped += 1;
          continue;
        }

        if (!structure || net <= 0) {
          tx.delete(payrolls).where(eq(payrolls.id, existing.id)).run();
          cleanedStaleGenerated += 1;
          if (!structure) skippedNoStructure += 1;
          else skippedZeroNet += 1;
          continue;
        }

        tx.update(payrolls).set({
          basicSalary: basic.toString(),
          allowances: allowances.toString(),
          deductions: deductions.toString(),
          netSalary: net.toString(),
          updatedAt: new Date(),
        } as any).where(eq(payrolls.id, existing.id)).run();

        tx.insert(payrollAuditLogs).values({
          payrollId: existing.id,
          action: "updated",
          performedBy: performedBy?.userId,
          performedByRole: performedBy?.role,
          detailsJson: JSON.stringify({ month, employeeId: emp.id, reason: "regenerated" }),
        } as any).run();
        updated += 1;
        continue;
      }

      if (!structure) {
        skippedNoStructure += 1;
        continue;
      }
      if (net <= 0) {
        skippedZeroNet += 1;
        continue;
      }

      const payroll = tx.insert(payrolls).values({
        payrollMonth: month,
        employeeId: emp.id,
        basicSalary: basic.toString(),
        allowances: allowances.toString(),
        deductions: deductions.toString(),
        netSalary: net.toString(),
        status: "generated",
        createdBy: performedBy?.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning().get();

      tx.insert(payrollAuditLogs).values({
        payrollId: payroll.id,
        action: "generated",
        performedBy: performedBy?.userId,
        performedByRole: performedBy?.role,
        detailsJson: JSON.stringify({ month, employeeId: emp.id }),
      } as any).run();

      created += 1;
    }

    return { created, updated, skipped, skippedNoStructure, skippedZeroNet, cleanedStaleGenerated };
  });
}

export async function approvePayroll(payrollId: number, performedBy?: { userId?: number; role?: string }, postingDate?: Date) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [payroll] = tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).all();
    if (!payroll) return undefined;
    if (payroll.status !== "generated") throw new Error("Payroll cannot be approved in its current state");

    const [emp] = tx.select().from(employees).where(eq(employees.id, payroll.employeeId)).all();
    if (!emp) throw new Error("Employee not found");
    if (!emp.accountId) throw new Error("Employee payable account is not configured");

    const salaryExpense = ledgerModel.ensureSystemAccount(client, "Salary Expense", "salary");

    const voucherDate = postingDate ?? new Date();
    assertPostingAllowed(client, voucherDate, "payroll approval");

    const month = payroll.payrollMonth;
    const netAmount = parseAmount(payroll.netSalary || "0");
    if (netAmount <= 0) throw new Error("Payroll net salary must be greater than 0 before approval");
    const amount = netAmount.toString();
    const narration = `Payroll ${month} - ${emp.employeeCode} ${emp.name}`;

    const createdVoucher = (() => {
      const entries: JournalEntryInput[] = [
        { accountId: salaryExpense.id, entryType: "DEBIT", amount },
        { accountId: emp.accountId!, entryType: "CREDIT", amount },
      ];
      const { normalized, total } = jvModel.normalizeJournalEntries(entries);

      const [last] = tx.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
      const year = new Date().getFullYear();
      const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
      const voucherNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
      const v = tx.insert(journalVouchers).values({
        voucherNo,
        voucherDate,
        narration,
        status: "approved",
        totalAmount: total.toString(),
        createdBy: performedBy?.userId,
        approvedBy: performedBy?.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning().get();

      for (const entry of normalized) {
        tx.insert(journalVoucherEntries).values({
          ...entry,
          journalVoucherId: v.id,
          amount: parseAmount(entry.amount).toString(),
        } as any).run();
      }

      jvModel.postJournalToLedger(client, v as any, normalized);
      return v as any as JournalVoucher;
    })();

    const updated = tx.update(payrolls).set({
      status: "approved",
      approvedBy: performedBy?.userId,
      approvedByRole: performedBy?.role,
      approvedAt: new Date(),
      journalVoucherId: createdVoucher.id,
      updatedAt: new Date(),
    } as any).where(eq(payrolls.id, payrollId)).returning().get();

    tx.insert(payrollAuditLogs).values({
      payrollId,
      action: "approved",
      performedBy: performedBy?.userId,
      performedByRole: performedBy?.role,
      detailsJson: JSON.stringify({ journalVoucherId: createdVoucher.id, postingDate: voucherDate.toISOString() }),
    } as any).run();

    return updated as any;
  });
}

export async function paySalary(
  payrollId: number,
  payment: { method: "Cash" | "Bank"; paymentAccountId?: number; paymentDate?: Date },
  performedBy?: { userId?: number; role?: string },
) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [payroll] = tx.select().from(payrolls).where(eq(payrolls.id, payrollId)).all();
    if (!payroll) return undefined;
    if (payroll.status === "paid") throw new Error("Payroll is already paid");
    if (payroll.status !== "approved") throw new Error("Payroll must be approved before payment");

    const [emp] = tx.select().from(employees).where(eq(employees.id, payroll.employeeId)).all();
    if (!emp) throw new Error("Employee not found");
    if (!emp.accountId) throw new Error("Employee payable account is not configured");

    const netAmount = parseAmount(payroll.netSalary || "0");
    if (netAmount <= 0) throw new Error("Payroll net salary must be greater than 0 before payment");
    const amount = netAmount.toString();
    const paymentDate = payment.paymentDate ?? new Date();
    assertPostingAllowed(client, paymentDate, "payroll payment");

    let creditAccountId: number;
    if (payment.method === "Cash") {
      const cash = ledgerModel.ensureCashAccount(client);
      creditAccountId = cash.id;
    } else {
      if (!payment.paymentAccountId) throw new Error("paymentAccountId is required for bank payments");
      const [bank] = tx.select().from(accounts).where(eq(accounts.id, payment.paymentAccountId)).all();
      if (!bank) throw new Error("Invalid bank account");
      if (String(bank.type).toLowerCase() !== "bank") throw new Error("paymentAccountId must be a bank account");
      creditAccountId = bank.id;
    }

    const narration = `Salary Payment ${payroll.payrollMonth} - ${emp.employeeCode} ${emp.name}`;

    const entries: JournalEntryInput[] = [
      { accountId: emp.accountId, entryType: "DEBIT", amount },
      { accountId: creditAccountId, entryType: "CREDIT", amount },
    ];
    const { normalized, total } = jvModel.normalizeJournalEntries(entries);

    const [last] = tx.select().from(journalVouchers).orderBy(desc(journalVouchers.id)).limit(1).all();
    const year = new Date().getFullYear();
    const nextNum = last ? parseInt(last.voucherNo.split("-").pop() || "0") + 1 : 1;
    const voucherNo = `JV-${year}-${String(nextNum).padStart(5, "0")}`;
    const v = tx.insert(journalVouchers).values({
      voucherNo,
      voucherDate: paymentDate,
      narration,
      status: "approved",
      totalAmount: total.toString(),
      createdBy: performedBy?.userId,
      approvedBy: performedBy?.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning().get();

    for (const entry of normalized) {
      tx.insert(journalVoucherEntries).values({
        ...entry,
        journalVoucherId: v.id,
        amount: parseAmount(entry.amount).toString(),
      } as any).run();
    }

    jvModel.postJournalToLedger(client, v as any, normalized);

    let cashPaymentInfo: { id: number; voucherNo: string } | null = null;
    if (payment.method === "Cash") {
      const [cashModuleAccount] = tx.select().from(cashAccounts).where(eq(cashAccounts.id, 1)).limit(1).all();
      if (!cashModuleAccount) {
        tx.insert(cashAccounts).values({
          id: 1,
          accountName: "Main Cash",
          openingBalance: "0",
          createdAt: new Date(),
        } as any).run();
      }

      const [lastCashPayment] = tx.select({ id: cashPayments.id }).from(cashPayments).orderBy(desc(cashPayments.id)).limit(1).all();
      const year = paymentDate.getFullYear();
      const nextNo = (lastCashPayment?.id ?? 0) + 1;
      const cashVoucherNo = `CP-${year}-${String(nextNo).padStart(4, "0")}`;
      const cashPayment = tx.insert(cashPayments).values({
        voucherNo: cashVoucherNo,
        paymentDate,
        paidTo: `${emp.employeeCode} ${emp.name}`,
        amount,
        description: `Salary Payment ${payroll.payrollMonth} (JV ${v.voucherNo})`,
        paymentMode: "cash",
        referenceType: "payroll",
        referenceId: payroll.id,
        cashAccountId: 1,
        createdAt: new Date(),
      } as any).returning().get() as any;
      cashPaymentInfo = cashPayment ? { id: cashPayment.id, voucherNo: cashPayment.voucherNo } : null;
    }

    const updated = tx.update(payrolls).set({
      paymentMethod: payment.method,
      paymentAccountId: payment.method === "Bank" ? payment.paymentAccountId : null,
      status: "paid",
      paidAt: paymentDate,
      paymentJournalVoucherId: v.id,
      updatedAt: new Date(),
    } as any).where(eq(payrolls.id, payrollId)).returning().get();

    tx.insert(payrollAuditLogs).values({
      payrollId,
      action: "paid",
      performedBy: performedBy?.userId,
      performedByRole: performedBy?.role,
      detailsJson: JSON.stringify({
        paymentJournalVoucherId: v.id,
        method: payment.method,
        paymentDate: paymentDate.toISOString(),
        cashPaymentId: cashPaymentInfo?.id ?? null,
        cashPaymentVoucherNo: cashPaymentInfo?.voucherNo ?? null,
      }),
    } as any).run();

    return updated as any;
  });
}

export async function getPayrollAudit(payrollId: number): Promise<PayrollAuditLog[]> {
  return db.select().from(payrollAuditLogs).where(eq(payrollAuditLogs.payrollId, payrollId)).orderBy(desc(payrollAuditLogs.performedAt)).all();
}
