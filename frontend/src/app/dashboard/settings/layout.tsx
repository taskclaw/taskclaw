export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {children}
        </div>
    )
}
