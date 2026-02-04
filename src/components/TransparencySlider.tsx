interface TransparencySliderProps {
  opacity: number;
  onChange: (opacity: number) => void;
}

export function TransparencySlider({ opacity, onChange }: TransparencySliderProps) {
  return (
    <div className="opacity-slider">
      <input
        type="range"
        min="0.3"
        max="1"
        step="0.05"
        value={opacity}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        title={`Opacity: ${Math.round(opacity * 100)}%`}
      />
    </div>
  );
}
