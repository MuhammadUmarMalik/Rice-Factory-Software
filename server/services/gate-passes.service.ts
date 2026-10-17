import * as gatePassesModel from "../models/gate-passes.model";
import type { GatePassCreateInput, GatePassListQuery } from "../schemas/gate-passes.schema";

/**
 * Gate passes are a physical control document; the service layer is deliberately
 * thin. It exists so controllers never touch the model directly and so the
 * cross-document reads (a sale's dispatch summary, the dashboard roll-up) have
 * one obvious home.
 */

export async function listGatePasses(filters: GatePassListQuery) {
  return gatePassesModel.getGatePasses({
    from: filters.from ?? null,
    to: filters.to ?? null,
    direction: filters.direction ?? null,
    status: filters.status ?? null,
    partyId: filters.partyId ?? null,
    vehicleNo: filters.vehicleNo ?? null,
  });
}

export async function getGatePass(id: number) {
  return gatePassesModel.getGatePass(id);
}

export async function createGatePass(input: GatePassCreateInput, performedBy?: number) {
  return gatePassesModel.createGatePass(input, performedBy);
}

export async function completeGatePass(id: number, performedBy?: number) {
  return gatePassesModel.completeGatePass(id, performedBy);
}

export async function cancelGatePass(id: number, reason: string, performedBy?: number) {
  return gatePassesModel.cancelGatePass(id, reason, performedBy);
}

export async function getSaleDispatchSummary(saleId: number) {
  return gatePassesModel.getSaleDispatchSummary(saleId);
}

export async function getSaleDispatchProgress(saleIds: number[]) {
  return gatePassesModel.getSaleDispatchProgress(saleIds);
}

export async function getGatePassesForSource(
  sourceType: Parameters<typeof gatePassesModel.getGatePassesForSource>[0],
  sourceId: number,
) {
  return gatePassesModel.getGatePassesForSource(sourceType, sourceId);
}

export async function getGatePassRefsForSources(
  sourceType: Parameters<typeof gatePassesModel.getGatePassRefsForSources>[0],
  sourceIds: number[],
) {
  return gatePassesModel.getGatePassRefsForSources(sourceType, sourceIds);
}

export async function getDashboard() {
  return gatePassesModel.getGatePassDashboard();
}
