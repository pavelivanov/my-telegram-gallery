export function EnvUnsupported() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-night px-6 text-center text-ink">
      <img
        alt="Telegram sticker"
        src="https://xelene.me/telegram.gif"
        className="block h-36 w-36"
      />
      <h1 className="font-display text-2xl">Oops</h1>
      <p className="max-w-xs text-[14px] text-ink-dim">
        You are using too old Telegram client to run this application
      </p>
    </div>
  );
}
