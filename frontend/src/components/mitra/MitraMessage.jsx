const MitraMessage = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
          isUser
            ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-md shadow-sm'
            : isError
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-bl-md'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-md'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Mitra
            </span>
            {message.confidence != null && message.confidence > 0 && (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
                {Math.round(message.confidence * 100)}% confident
              </span>
            )}
          </div>
        )}

        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {message.capability_used && (
          <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
            <span className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[10px] px-2 py-0.5 rounded-md font-mono">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {message.capability_used}
            </span>
          </div>
        )}

        {message.entities && Object.keys(message.entities).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(message.entities).map(([key, value]) => (
              <span
                key={key}
                className="inline-block bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-300 text-[10px] px-2 py-0.5 rounded-md"
              >
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}

        <div
          className={`text-[10px] mt-1.5 ${
            isUser ? 'text-white/50' : 'text-zinc-400 dark:text-zinc-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
};

export default MitraMessage;
