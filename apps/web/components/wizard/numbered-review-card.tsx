import Link from 'next/link';

interface PillItem {
  label: string;
}

interface NumberedReviewCardProps {
  num: string;
  title: string;
  subtitle?: string;
  pills?: PillItem[];
  editHref: string;
}

export function NumberedReviewCard({
  num,
  title,
  subtitle,
  pills,
  editHref,
}: NumberedReviewCardProps) {
  return (
    <div className="flex gap-3 rounded-md bg-surface border border-line shadow-stamp-md p-4">
      {/* Number badge */}
      <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
        <span className="font-display font-bold text-sm text-accent-deep leading-none">
          {num}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display font-semibold text-[15px] text-ink leading-tight">
            {title}
          </p>
          <Link
            href={editHref}
            className="flex-shrink-0 text-[11px] text-ink-mute hover:text-ink transition-colors"
          >
            ✎ Editar
          </Link>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs italic text-ink-mute">{subtitle}</p>
        )}
        {pills && pills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {pills.map((pill) => (
              <span
                key={pill.label}
                className="inline-flex items-center rounded-pill bg-paper-soft px-2 py-0.5 text-[10px] font-medium text-ink-soft"
              >
                {pill.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
