export default function AnalyticsTabLayout({ header = null, children, sidebar = null }) {
  return (
    <section className="flex flex-col gap-6 md:gap-8 w-full max-w-[1440px] mx-auto py-2 md:py-4 px-1 md:px-0">
      {header ? <div className="mb-2">{header}</div> : null}
      <div className={`grid grid-cols-1 ${sidebar ? 'lg:grid-cols-12' : ''} gap-6 md:gap-8 items-start`}>
        <div className={`flex flex-col gap-6 w-full ${sidebar ? 'lg:col-span-8 xl:col-span-9' : ''}`}>
          {children}
        </div>
        {sidebar ? (
          <aside className="w-full flex md:sticky md:top-6 lg:col-span-4 xl:col-span-3 flex-col gap-6 h-auto self-start">
            {sidebar}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
