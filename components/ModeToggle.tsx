import type { GenerationMode } from "@/lib/types";

interface ModeToggleProps {
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void;
}

const CAPTIONS: Record<GenerationMode, string> = {
  strict: "Chat answers from the course sources",
  open: "Chat can add general knowledge",
};

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex border border-[#423e42] bg-[#28262a] p-0.5 text-xs">
        {(["strict", "open"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            title={CAPTIONS[m]}
            className={
              mode === m
                ? "rounded px-2.5 py-1 font-medium text-[#1c140d] bg-accent-300"
                : "rounded px-2.5 py-1 text-[#696A61] hover:text-[#8F8978]"
            }
          >
            {m === "strict" ? "Strict" : "Open"}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-none text-[#696A61]">{CAPTIONS[mode]}</p>
    </div>
  );
}
