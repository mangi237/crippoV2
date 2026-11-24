import React from 'react';

interface CrippoLogoProps {
  size?: number;
  className?: string;
}

export function CrippoLogo({ size = 34, className = '' }: CrippoLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Crippo Exchange Emblem"
    >
      <rect width="40" height="40" rx="10" fill="#0B0514" />
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="9.25"
        stroke="#6F30DC"
        strokeWidth="1.5"
        strokeOpacity="0.65"
      />
      {/* Stylized Creator Face Silhouette */}
      <path
        d="M14.5 29.5C14.5 25.6 17.1 23 20.4 23C22.2 23 23.8 23.7 24.9 24.9"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M17.2 19.6C14.9 18.6 13.8 15.9 14.5 13.3C15.2 10.6 17.9 9 20.6 9.5C22.7 9.9 24.3 11.5 24.7 13.5"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="18.3" cy="14.2" r="1.1" fill="#FFFFFF" />
      {/* Upward IPO Stock Arrow Line */}
      <path
        d="M10 27L16.5 21.5L21 24.2L29.5 13.5"
        stroke="#8B5CF6"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.2 13.3H29.7V18.8"
        stroke="#10B981"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
