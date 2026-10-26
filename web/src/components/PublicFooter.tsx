import { Logo } from "./Logo";

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-5 py-8 md:flex-row md:items-center md:px-8">
        <Logo size="sm" />
        <p className="text-[12px] text-faint">© 2026 PensionBridge Africa</p>
      </div>
    </footer>
  );
}
