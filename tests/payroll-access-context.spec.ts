import { describe, expect, it } from 'vitest';

import { isPayrollOwnerFromContextResult } from '../src/ui/payroll/access/payroll-access-context';

describe('payroll owner context', () => {
  it('allows only the exact owner role', () => {
    expect(isPayrollOwnerFromContextResult({ content: [{ text: JSON.stringify({ userRoles: ['owner'] }) }] })).toBe(true);
    expect(isPayrollOwnerFromContextResult({ content: [{ text: JSON.stringify({ userRoles: ['admin'] }) }] })).toBe(false);
  });

  it('fails closed for malformed or failed context', () => {
    expect(isPayrollOwnerFromContextResult({ content: [{ text: '{bad' }] })).toBe(false);
    expect(isPayrollOwnerFromContextResult(undefined)).toBe(false);
  });
});
