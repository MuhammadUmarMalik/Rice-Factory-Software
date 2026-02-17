import type { Request, Response } from "express";
import { z } from "zod";
import { insertEmployeeSchema, insertEmployeeSalaryStructureSchema } from "../db/schema";
import * as employeesService from "../services/employees.service";
import { getUserId } from "../utils/auth";
import { parseRequiredInt } from "../utils/parse";

export async function listEmployees(req: Request, res: Response) {
  try {
    const rows = await employeesService.listEmployees();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
}

export async function getEmployee(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid employee id" });
    const row = await employeesService.getEmployee(id);
    if (!row) return res.status(404).json({ error: "Employee not found" });
    res.json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
}

export async function createEmployee(req: Request, res: Response) {
  try {
    const data = insertEmployeeSchema.parse(req.body);
    const created = await employeesService.createEmployee(data, getUserId(req));
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to create employee" });
  }
}

export async function updateEmployee(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid employee id" });
    const data = insertEmployeeSchema.partial().parse(req.body);
    const updated = await employeesService.updateEmployee(id, data);
    if (!updated) return res.status(404).json({ error: "Employee not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to update employee" });
  }
}

export async function getSalaryStructures(req: Request, res: Response) {
  try {
    const employeeId = parseRequiredInt(req.params.id, "id");
    if (employeeId === undefined) return res.status(400).json({ error: "Invalid employee id" });
    const rows = await employeesService.getSalaryStructures(employeeId);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch salary structures" });
  }
}

export async function createSalaryStructure(req: Request, res: Response) {
  try {
    const employeeId = parseRequiredInt(req.params.id, "id");
    if (employeeId === undefined) return res.status(400).json({ error: "Invalid employee id" });
    const body = insertEmployeeSalaryStructureSchema.omit({ employeeId: true }).parse({
      ...req.body,
      effectiveFrom: req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
    });
    const created = await employeesService.createSalaryStructure(employeeId, body, getUserId(req));
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to create salary structure" });
  }
}

export async function updateSalaryStructure(req: Request, res: Response) {
  try {
    const employeeId = parseRequiredInt(req.params.id, "id");
    const structureId = parseRequiredInt(req.params.structureId, "structureId");
    if (employeeId === undefined || structureId === undefined) {
      return res.status(400).json({ error: "Invalid salary structure id" });
    }
    const body = insertEmployeeSalaryStructureSchema
      .omit({ employeeId: true })
      .partial()
      .parse({
        ...req.body,
        effectiveFrom: req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
      });
    const updated = await employeesService.updateSalaryStructure(employeeId, structureId, body);
    if (!updated) return res.status(404).json({ error: "Salary structure not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error(error);
    res.status(500).json({ error: "Failed to update salary structure" });
  }
}

export async function deleteSalaryStructure(req: Request, res: Response) {
  try {
    const employeeId = parseRequiredInt(req.params.id, "id");
    const structureId = parseRequiredInt(req.params.structureId, "structureId");
    if (employeeId === undefined || structureId === undefined) {
      return res.status(400).json({ error: "Invalid salary structure id" });
    }
    const deleted = await employeesService.deleteSalaryStructure(employeeId, structureId);
    if (!deleted) return res.status(404).json({ error: "Salary structure not found" });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete salary structure" });
  }
}
