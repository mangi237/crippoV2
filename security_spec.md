# Crippo Firestore Security Specification

## 1. Data Invariants
- Every user PII record (`email`, `phone`, `cniNumber`, `niuNumber`, KYC URLs) lives strictly inside `/users/{userId}/private/info` and is readable/writable only by `userId` or a verified admin.
- Public market entities (`/entities`), active Races (`/races`), unified social catalysts (`/catalysts`), and brand campaigns (`/campaigns`) require authentication + `isPublic == true` for list queries.
- Financial trades (`/trades`) and Mobile Money payments (`/payments`) strictly bind `buyerUid` / `uid` to `request.auth.uid` on creation and cannot be mutated by other users.
- Race terminal states (`rejected`, `clearing`) lock core terms (`netBudgetXAF`, `revSharePct`, `totalShares`, `capTableHash`) against modification once opened.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read on `/users/{uid}/private/info` -> `PERMISSION_DENIED`
2. Authenticated non-owner read on `/users/{otherUid}/private/info` -> `PERMISSION_DENIED`
3. Shadow field injection (`kycStatus: "verified"`, `isAdmin: true`) during `/users/{uid}` update -> `PERMISSION_DENIED`
4. Forged `buyerUid` on `/trades/{tradeId}` creation -> `PERMISSION_DENIED`
5. Oversized 10KB document ID (`isValidId` poisoning) -> `PERMISSION_DENIED`
6. Unverified email admin spoof (`email == admin`, `email_verified == false`) -> `PERMISSION_DENIED`
7. Modifying `capTableHash` or `totalShares` on an open Race -> `PERMISSION_DENIED`
8. Client-spoofed `createdAt` timestamp not equal to `request.time` -> `PERMISSION_DENIED`
9. Creating a Race with `netBudgetXAF <= 0` or `revSharePct > 90` -> `PERMISSION_DENIED`
10. Modifying another user's `/payments/{paymentId}` status -> `PERMISSION_DENIED`
11. Listing `/payments` without filtering by own `uid` -> `PERMISSION_DENIED`
12. Deleting settled `/trades/{tradeId}` or `/dividend_payouts/{payoutId}` -> `PERMISSION_DENIED`
