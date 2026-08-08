const MitraMessage = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : isError
            ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Mitra
            </span>
            {message.confidence && (
              <span className="text-[10px] text-muted-foreground">
                ({Math.round(message.confidence * 100)}%)
              </span>
            )}
          </div>
        )}

        <div className="whitespace-pre-wrap">{message.content}</div>

        {message.capability_used && (
          <div className="mt-2 pt-2 border-t border-border/20">
            <span className="inline-block bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-mono">
              {message.capability_used}
            </span>
          </div>
        )}

        {message.entities && Object.keys(message.entities).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(message.entities).map(([key, value]) => (
              <span
                key={key}
                className="inline-block bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded"
              >
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}

        <div
          className={`text-[10px] mt-1 ${
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
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
