import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, postBySlug, nlDate } from "@/lib/kennis/content";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = postBySlug(params.slug);
  if (!p) return { title: "Blog" };
  return { title: p.title, description: p.excerpt };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);
  if (!post) notFound();

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/kennis/blog" className="text-sm font-medium text-white/60 hover:text-white">
            ← Blog
          </Link>
          <h1 className="mt-6 max-w-3xl text-balance font-display text-3xl font-bold leading-tight md:text-[2.7rem]">
            {post.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">{post.excerpt}</p>
          <p className="mt-6 font-mono text-xs uppercase tracking-wide text-white/40">
            {nlDate(post.date)} · {post.author} · {post.readMinutes} min lezen
          </p>
        </div>
      </div>

      <article className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          {post.body.map((block, bi) => (
            <section key={bi} className="mt-10 first:mt-0">
              {block.heading && (
                <h2 className="font-display text-xl font-bold text-ink md:text-2xl">{block.heading}</h2>
              )}
              {block.paragraphs.map((p, i) => (
                <p key={i} className={`text-[1.02rem] leading-relaxed text-neutralx-700 ${block.heading ? "mt-4" : "mt-4 first:mt-0"}`}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          <div className="mt-14 flex flex-wrap gap-3 border-t border-hair pt-8">
            <Link href="/register" className="btn-primary">
              Account aanmaken
            </Link>
            <Link href="/kennis" className="btn-ghost">
              Naar Kennis
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
