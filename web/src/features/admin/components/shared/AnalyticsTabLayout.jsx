function joinClasses(...values) {
 return values.filter(Boolean).join(" ");
}

export default function AnalyticsTabLayout({
 header = null,
 children,
 sidebar = null,
 className = "",
 headerClassName = "",
 bodyClassName = "",
 mainClassName = "",
 sidebarClassName = "",
}) {
 return (
 <section
 className={joinClasses(
 "flex flex-col gap-6 md:gap-8 w-full max-w-[1440px] mx-auto py-2 md:py-4 px-1 md:px-0",
 className,
 )}
 >
 {header ? (
 <div className={joinClasses("mb-2", headerClassName)}>{header}</div>
 ) : null}
 <div
 className={joinClasses(
 `grid grid-cols-1 ${sidebar ? "lg:grid-cols-12" : ""} gap-6 md:gap-8 items-start`,
 bodyClassName,
 )}
 >
 <div
 className={joinClasses(
 `flex flex-col gap-6 w-full ${sidebar ? "lg:col-span-8 xl:col-span-9" : ""}`,
 mainClassName,
 )}
 >
 {children}
 </div>
 {sidebar ? (
 <aside
 className={joinClasses(
 "w-full flex md:sticky md:top-6 lg:col-span-4 xl:col-span-3 flex-col gap-6 h-auto self-start",
 sidebarClassName,
 )}
 >
 {sidebar}
 </aside>
 ) : null}
 </div>
 </section>
 );
}
