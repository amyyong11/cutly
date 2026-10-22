export function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-ink shrink-0">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="6" cy="6" r="3" stroke="#FAF8F5" strokeWidth="2" />
          <circle cx="6" cy="18" r="3" stroke="#FAF8F5" strokeWidth="2" />
          <path
            d="M8.5 7.5L20 18M20 6L8.5 16.5"
            stroke="#FAF8F5"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1 className="text-xl font-medium tracking-tight text-ink">cutly</h1>
    </div>
  );
}
