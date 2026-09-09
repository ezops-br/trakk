'use client';

import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
}

export function DashboardEmpty({ title, description, icon }: Props) {
  return (
    <div className="py-8 text-center">
      {icon && (
        <div className="flex justify-center mb-2 text-trakk-text-tertiary [&_svg]:size-7">
          {icon}
        </div>
      )}
      <p className="text-sm font-body text-trakk-text-secondary">{title}</p>
      {description && (
        <p className="text-xs text-trakk-text-secondary mt-1">{description}</p>
      )}
    </div>
  );
}
