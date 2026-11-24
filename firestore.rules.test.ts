// Security TDD verification suite specification for Crippo Firestore rules
export const DIRTY_DOZEN_CASES = [
  { name: 'Unauthenticated read on private PII', path: '/users/u1/private/info', op: 'get', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-user read on private PII', path: '/users/u1/private/info', authUid: 'u2', op: 'get', expected: 'PERMISSION_DENIED' },
  { name: 'Shadow field escalation on user profile', path: '/users/u1', authUid: 'u1', payload: { kycStatus: 'verified' }, op: 'update', expected: 'PERMISSION_DENIED' },
  { name: 'Forged buyerUid on trade creation', path: '/trades/t1', authUid: 'u1', payload: { buyerUid: 'u2' }, op: 'create', expected: 'PERMISSION_DENIED' },
  { name: 'Oversized document ID poisoning', path: `/races/${'a'.repeat(200)}`, authUid: 'u1', op: 'get', expected: 'PERMISSION_DENIED' },
  { name: 'Unverified email admin spoof', path: '/entities/e1', authUid: 'u1', emailVerified: false, op: 'delete', expected: 'PERMISSION_DENIED' },
  { name: 'Cap-table tampering on open race', path: '/races/r1', authUid: 'u1', payload: { totalShares: 999999 }, op: 'update', expected: 'PERMISSION_DENIED' },
  { name: 'Client-forged createdAt timestamp', path: '/memos/m1', authUid: 'u1', payload: { createdAt: '2020-01-01T00:00:00Z' }, op: 'create', expected: 'PERMISSION_DENIED' },
  { name: 'Invalid negative budget race creation', path: '/races/r1', authUid: 'u1', payload: { netBudgetXAF: -500 }, op: 'create', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-user payment status tampering', path: '/payments/p1', authUid: 'u2', payload: { status: 'SUCCESSFUL' }, op: 'update', expected: 'PERMISSION_DENIED' },
  { name: 'Blanket list on private payments', path: '/payments', authUid: 'u1', op: 'list', expected: 'PERMISSION_DENIED' },
  { name: 'Deleting immutable settled trade', path: '/trades/t1', authUid: 'u1', op: 'delete', expected: 'PERMISSION_DENIED' },
];
