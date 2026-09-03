import { useCallback, useEffect, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { usePolling } from '../../hooks/usePolling';
import { hasPayrollOwnerRole } from './owner-role-policy';
import { isPayrollOwnerFromContextResult } from './payroll-access-context';

type PayrollAccessApp = Pick<McpApp, 'callServerTool'>;

export async function refreshPayrollAccess(app: PayrollAccessApp): Promise<boolean> {
  try {
    const result = await app.callServerTool({
      name: 'privos.context.get',
      arguments: {},
    });
    return isPayrollOwnerFromContextResult(result);
  } catch {
    return false;
  }
}

export function usePayrollAccessPolling(
  app: PayrollAccessApp | null,
  userRoles: readonly string[] | null | undefined,
): boolean {
  const [canAccessPayroll, setCanAccessPayroll] = useState(() => hasPayrollOwnerRole(userRoles));

  useEffect(() => {
    setCanAccessPayroll(hasPayrollOwnerRole(userRoles));
  }, [userRoles]);

  const refreshAccess = useCallback(async () => {
    if (!app) {
      setCanAccessPayroll(false);
      return;
    }

    setCanAccessPayroll(await refreshPayrollAccess(app));
  }, [app]);

  usePolling(refreshAccess, {
    enabled: app !== null,
    interval: 1000,
    immediate: true,
    pauseOnTabHidden: false,
  });

  return canAccessPayroll;
}
