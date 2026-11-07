import { Metadata } from "next";
import { getAllFaqTopics, FAQ_SECTIONS } from "@/lib/docs/faq";

export const metadata: Metadata = {
  title: "FAQ - Veelgestelde Vragen",
  description: "Vragen over kilometers, belastingen, verzekering, uitzendkrachten, en technische processen",
};

export default function FaqPage() {
  const topics = getAllFaqTopics();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Veelgestelde Vragen</h1>
          <p className="text-lg text-gray-600">Antwoorden op vragen over kilometers, belastingen, verzekeringen, payroll en techniek.</p>
        </div>

        <div className="space-y-8">
          {topics.map((topic) => {
            const section = FAQ_SECTIONS[topic];
            if (!section) return null;

            return (
              <div key={topic} className="rounded-lg border border-gray-200 bg-white p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">{section.title}</h2>

                <div className="space-y-6">
                  {section.items.map((item, idx) => (
                    <details key={idx} className="border-l-4 border-blue-500 pl-4 py-2 cursor-pointer">
                      <summary className="font-semibold text-gray-900 hover:text-blue-600 transition">
                        {item.q}
                      </summary>
                      <div className="mt-3 text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-lg bg-blue-50 border border-blue-200 p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Nog vragen?</h3>
          <p className="text-blue-800 text-sm">
            Voor specifieke vragen over je account of profiel: neem contact op met{" "}
            <a href="mailto:support@zekerflex.com" className="underline">
              support@zekerflex.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
