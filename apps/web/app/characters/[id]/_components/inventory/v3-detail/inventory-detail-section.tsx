/**
 * InventoryDetailSection — server component.
 * Shared section primitive: head + body. Renders only when children are present.
 */
import type { ReactNode } from 'react';

interface InventoryDetailSectionProps {
  title: string;
  children: ReactNode;
}

export function InventoryDetailSection({ title, children }: InventoryDetailSectionProps) {
  return (
    <div className="inventory-init-detail-section">
      <div className="head">{title}</div>
      <div>{children}</div>
    </div>
  );
}
