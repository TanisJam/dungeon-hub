export type IconName =
  | 'shield'
  | 'sword'
  | 'scroll'
  | 'user'
  | 'dice'
  | 'sparkle'
  | 'heart'
  | 'flame'
  | 'bow'
  | 'wand'
  | 'cross'
  | 'leaf'
  | 'star'
  | 'feather'
  | 'compass'
  | 'hammer'
  | 'book'
  | 'crown'
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'plus'
  | 'minus'
  | 'edit'
  | 'bag'
  | 'home'
  | 'bolt'
  | 'eye';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function IconPaths({ name }: { name: IconName }) {
  switch (name) {
    case 'shield':
      return <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />;
    case 'sword':
      return (
        <>
          <path d="M14 4l6 6-3 3-3-3M14 4l-9 9 3 3 9-9M5 13l-2 4 2 2 4-2" />
        </>
      );
    case 'scroll':
      return (
        <>
          <path d="M4 4h12a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V4z" />
          <path d="M4 4v13a3 3 0 003 3" />
          <path d="M19 7H8" />
          <path d="M19 11H8" />
        </>
      );
    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        </>
      );
    case 'dice':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="9" cy="9" r="1.2" fill="currentColor" />
          <circle cx="15" cy="15" r="1.2" fill="currentColor" />
          <circle cx="15" cy="9" r="1.2" fill="currentColor" />
          <circle cx="9" cy="15" r="1.2" fill="currentColor" />
        </>
      );
    case 'sparkle':
      return (
        <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" />
      );
    case 'heart':
      return <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />;
    case 'flame':
      return <path d="M12 3s4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-3s-2 1-2 4a6 6 0 0012 0c0-5-7-9-7-9z" />;
    case 'bow':
      return (
        <>
          <path d="M4 20C4 12 12 4 20 4M4 20l16-16M6 18l3-3M15 9l3-3" />
        </>
      );
    case 'wand':
      return (
        <path d="M4 20l10-10M14 6l4 4M16 4l1 1M20 8l1 1M19 4l-1 1M21 5l1 1" />
      );
    case 'cross':
      return <path d="M12 3v18M5 9h14" />;
    case 'leaf':
      return <path d="M20 4c-9 0-14 6-14 12a4 4 0 008 0c0-6 6-10 6-12zM5 19l4-4" />;
    case 'star':
      return <path d="M12 3l2.6 5.6 6.2.8-4.6 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.2 9.4l6.2-.8z" />;
    case 'feather':
      return <path d="M20 4c0 7-5 12-12 12L4 20l4 .5M20 4l-9 9M16 7l-4 4" />;
    case 'compass':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M16 8l-2 6-6 2 2-6z" />
        </>
      );
    case 'hammer':
      return (
        <>
          <path d="M14 4l6 6-3 3-6-6zM11 7L4 14l3 3 7-7" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-4-2V5z" />
          <path d="M4 19a2 2 0 012-2h12" />
        </>
      );
    case 'crown':
      return <path d="M3 18h18M5 18l-1-9 5 4 3-7 3 7 5-4-1 9" />;
    case 'arrow-left':
      return <path d="M19 12H5M11 6l-6 6 6 6" />;
    case 'arrow-right':
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case 'check':
      return <path d="M4 12l5 5L20 6" />;
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'minus':
      return <path d="M5 12h14" />;
    case 'edit':
      return (
        <>
          <path d="M4 20h4l10-10-4-4L4 16v4z" />
          <path d="M14 6l4 4" />
        </>
      );
    case 'bag':
      return (
        <>
          <path d="M5 8h14l-1 12H6L5 8z" />
          <path d="M8 8V6a4 4 0 018 0v2" />
        </>
      );
    case 'home':
      return <path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2v-9z" />;
    case 'bolt':
      return <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" />;
    case 'eye':
      return (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
  }
}

export function Icon({ name, size = 20, className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <IconPaths name={name} />
    </svg>
  );
}
