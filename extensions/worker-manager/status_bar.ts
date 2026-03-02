/**
 * Status bar theming for worker-manager extension
 */

import type { ManagerHandlers } from './handlers.js';

export function updateManagerStatus(ctx: any, managerName: string, handlers: ManagerHandlers) {
  const registry = handlers.getWorkerRegistry();
  const count = registry.size;
  
  // Apply theme colors
  const theme = ctx.ui.theme;
  const label = theme.fg("dim", "Manager:");
  const name = theme.fg("success", managerName);  // success = manager name
  
  let text;
  if (count > 0) {
    const workerCount = theme.fg("accent", `${count} worker${count === 1 ? '' : 's'}`);  // accent = worker count
    text = `${label} ${name} ${theme.fg("dim", "(")}${workerCount}${theme.fg("dim", ")")}`;
  } else {
    text = `${label} ${name}`;
  }
  
  ctx.ui.setStatus('worker-manager', text);
}

export function updateWorkerStatus(ctx: any, workerId: string, workerState: { managerName: string | null }) {
  const theme = ctx.ui.theme;
  const label = theme.fg("dim", "Worker:");
  const id = theme.fg("accent", workerId);
  
  let status;
  if (workerState.managerName) {
    const arrow = theme.fg("dim", "→");
    const manager = theme.fg("success", workerState.managerName);
    status = `${label} ${id} ${arrow} ${manager}`;
  } else {
    const notConnected = theme.fg("muted", "(not connected)");
    status = `${label} ${id} ${notConnected}`;
  }
  
  ctx.ui.setStatus('worker-manager', status);
}
