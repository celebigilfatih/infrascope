import type { ComponentPropsWithoutRef } from 'react';
import { CircleAlert, CircleCheck, CircleHelp, Info, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './semantic-badge.module.css';

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const toneIcons: Record<SemanticTone, LucideIcon> = {
  success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info, neutral: CircleHelp,
};
export interface SemanticBadgeProps extends ComponentPropsWithoutRef<'span'> {
  tone?: SemanticTone;
  icon?: LucideIcon | null;
}
export function SemanticBadge({ tone = 'neutral', icon, children, className, ...props }: SemanticBadgeProps) {
  const Icon = icon === undefined ? toneIcons[tone] : icon;
  return <span className={cn(styles.badge, styles[tone], className)} {...props}>
    {Icon && <Icon size={14} aria-hidden="true" />}{children}
  </span>;
}
