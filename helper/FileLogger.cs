namespace Eurocup3;

public sealed class FileLoggerProvider(string folder) : ILoggerProvider
{
    readonly string logFolder = folder;
    readonly object gate = new();

    public ILogger CreateLogger(string categoryName) => new Sink(this, categoryName);

    public void Dispose()
    {
    }

    sealed class Sink(FileLoggerProvider owner, string name) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel level) => level >= LogLevel.Information;

        public void Log<TState>(
            LogLevel level,
            EventId id,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter
        )
        {
            if (!IsEnabled(level))
                return;
            lock (owner.gate)
            {
                Directory.CreateDirectory(owner.logFolder);
                var file = Path.Combine(owner.logFolder, "content-manager.log");
                if (File.Exists(file) && new FileInfo(file).Length > 5 * 1024 * 1024)
                    File.Move(file, file + ".1", true);
                File.AppendAllText(
                    file,
                    $"{DateTimeOffset.Now:O} {level} {name}: {formatter(state, exception)} {exception?.Message}\n"
                );
            }
        }
    }
}
