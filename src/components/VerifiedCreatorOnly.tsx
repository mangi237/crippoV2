import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMarket } from '../contexts/MarketContext';

interface VerifiedCreatorOnlyProps {
  children: React.ReactNode;
  targetEntityId?: string;
  requireCanLaunch?: boolean;
  fallback?: React.ReactNode;
}

export function VerifiedCreatorOnly({
  children,
  targetEntityId,
  requireCanLaunch = false,
  fallback = null,
}: VerifiedCreatorOnlyProps) {
  const { user } = useAuth();
  const {
    entities,
    claimedEntity,
    isVerifiedCreator,
    isLabelAffiliatedCreator,
    canLaunchRace,
    isAdmin,
  } = useMarket();

  if (!user) {
    return <>{fallback}</>;
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  if (requireCanLaunch && !canLaunchRace) {
    return <>{fallback}</>;
  }

  if (!isVerifiedCreator || !claimedEntity) {
    return <>{fallback}</>;
  }

  if (targetEntityId) {
    const targetEntity = entities.find((e) => e.id === targetEntityId);
    const isOwnEntity = claimedEntity.id === targetEntityId;
    const isRosterArtist = Boolean(targetEntity && targetEntity.affiliatedAgencyUid === user.uid);
    if (!isOwnEntity && !isRosterArtist) {
      return <>{fallback}</>;
    }
    if (requireCanLaunch && isOwnEntity && isLabelAffiliatedCreator) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}
