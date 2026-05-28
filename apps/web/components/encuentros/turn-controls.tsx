'use client';

type Props = {
  onAdvance: () => void;
  pending: boolean;
};

export function TurnControls({ onAdvance, pending }: Props) {
  return (
    <div className="encuentros-init-controls">
      <button
        type="button"
        className="encuentros-init-next"
        disabled={pending}
        onClick={onAdvance}
      >
        Próximo turno →
      </button>
    </div>
  );
}
