import { requirePrincipal } from "@/lib/auth";
import { getMyWork } from "@/lib/dashboard/my-work";
import { MyKlussenView } from "@/components/app/MyKlussenView";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MijnKlussenPage() {
  const principal = await requirePrincipal();
  const work = await getMyWork(principal.userId);
  const ft = await getFreelancerDict();

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
          {ft.work.title}
        </h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
      </div>

      <MyKlussenView work={work} />
    </>
  );
}
