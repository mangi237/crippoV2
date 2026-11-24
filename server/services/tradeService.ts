// server/services/tradeService.ts
import { db } from '../firebaseAdmin'; // Assume you have initialized firebase-admin
import { FieldValue } from 'firebase-admin/firestore';

export async function executeTrade(
  userId: string,
  raceId: string,
  side: 'BUY' | 'SELL',
  shares: number,
  expectedPrice: number
) {
  const raceRef = db.collection('races').doc(raceId);
  const userRef = db.collection('users').doc(userId);

  return await db.runTransaction(async (transaction) => {
    // 1. Read all documents
    const raceDoc = await transaction.get(raceRef);
    if (!raceDoc.exists) throw new Error('Race not found');
    const race = raceDoc.data()!;

    if (race.status !== 'open') throw new Error('Race is not open for trading');

    // Validate price (prevent stale quotes)
    const currentPrice = race.currentSharePriceXAF;
    if (Math.abs(currentPrice - expectedPrice) > 0.01) {
      throw new Error(`Price changed from ${expectedPrice} to ${currentPrice}, please refresh`);
    }

    const totalShares = race.totalShares;
    const sharesSold = race.sharesSold;

    if (side === 'BUY') {
      if (sharesSold + shares > totalShares) {
        throw new Error('Not enough shares available');
      }
      // Deduct user balance (simplified, actual needs to check user balance)
      const cost = shares * currentPrice;
      // transaction.update(userRef, { balanceXAF: FieldValue.increment(-cost) });
      transaction.update(raceRef, {
        sharesSold: FieldValue.increment(shares),
        // Price impact can be added here
      });
    } else if (side === 'SELL') {
      // Need to verify user holds shares, simplified here
      if (sharesSold - shares < 0) throw new Error('Invalid sell amount');
      transaction.update(raceRef, {
        sharesSold: FieldValue.increment(-shares),
      });
    }

    // Record trade
    const tradeRef = db.collection('trades').doc();
    transaction.set(tradeRef, {
      raceId,
      buyerUid: userId,
      side,
      shares,
      pricePerShareXAF: currentPrice,
      totalAmountXAF: shares * currentPrice,
      status: 'settled',
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, tradeId: tradeRef.id };
  });
}