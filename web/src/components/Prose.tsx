export function Prose({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm opacity-50">Last updated {updated}</p>
      <div className="mt-10 space-y-6 text-sm leading-relaxed opacity-80 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:opacity-100 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </article>
  )
}
