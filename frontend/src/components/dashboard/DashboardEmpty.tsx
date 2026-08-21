'use client';

import React from 'react';

interface Props {
  title: string;
  description?: string;
}

export function DashboardEmpty({ title, description }: Props) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-body text-trakk-text-secondary">{title}</p>
      {description && (
        <p className="text-xs text-trakk-text-secondary mt-1">{description}</p>
      )}
    </div>
  );
}
