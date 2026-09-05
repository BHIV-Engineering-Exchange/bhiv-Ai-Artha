import clsx from 'clsx';

export default function ProgressBar({ value = 0, className = '' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx('w-full h-2 bg-muted rounded-full overflow-hidden', className)}>
      <div
        className="h-full bg-primary rounded-full transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
