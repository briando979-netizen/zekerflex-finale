"use client";

const TEMPLATES = [
  { label: "Akkoord", text: "Akkoord, ik kom eraan!" },
  { label: "Later", text: "Kan ik je later terugbellen?" },
  { label: "Bedankt", text: "Bedankt voor het bericht!" },
  { label: "Vraag", text: "Heb je meer info nodig?" },
  { label: "Druk", text: "Ik ben momenteel druk, sorry!" },
];

export function QuickTemplates({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {TEMPLATES.map((template) => (
        <button
          key={template.label}
          onClick={() => onSelect(template.text)}
          className="rounded-full bg-gray-200 px-3 py-1 text-xs hover:bg-gray-300"
          title={template.text}
        >
          {template.label}
        </button>
      ))}
    </div>
  );
}
