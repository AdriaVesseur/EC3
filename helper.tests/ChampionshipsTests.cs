using System.Net;
using Eurocup3;

static class ChampionshipsTests
{
    const string Round = "1d3ac2ae-bff6-408c-8729-f54f6e8e001f";
    const string WrongRound = "54232026-f850-4d8e-884a-e18f82563df3";
    const string Catalog = """
        <h2>Campeonatos activos</h2><div class="championship-grid">
        <div class="glass-card group/card"><div><img src="/uploads/one.webp"><span>En Curso</span><span>23 / 32</span></div><h3><a href="/championships/series-one">Series One</a></h3>
        <span>Lic. mín.</span><span>Nacional B</span><span>Ranked</span><span>Open</span><span>3 Rondas</span>
        <div onmouseover="showAssetPopup(this, 'car', 'f3', 'Formula 3')"></div><span>Sábado, 24 de octubre - 16:00h</span></div>
        <div class="glass-card group/card"><img src="https://i.imgur.com/two.png"><span>Inscripción abierta</span><h3><a href="/championships/series-two">Series Two</a></h3></div>
        <div class="glass-card group/card"><span>En Curso</span><span>Finalizado</span><h3><a href="/championships/already-finished">Finished</a></h3></div>
        <div class="glass-card group/card"><span>Borrador</span><h3><a href="/championships/draft">Draft</a></h3></div>
        <div class="glass-card group/card"><span>En Curso</span><h3><a href="https://evil.test/championships/injected">Injected</a></h3></div>
        </div><h2>Salón de la Fama</h2>
        <div class="glass-card group/card"><span>En Curso</span><h3><a href="/championships/archive">Archived</a></h3></div>
        """;
    const string Populated = """
        <div id="standings-pane-pilots"><table><tr><td>1</td><td>#16</td><td>Samuel Fernández</td><td>Class</td><td>F3</td><td>Team One</td><td>64</td></tr></table></div>
        <div id="tab-pane-results"><span data-champ="809a391d-6943-4403-ab2c-5fd70fb121f0" data-event="1d3ac2ae-bff6-408c-8729-f54f6e8e001f"></span>
        <span>R1</span><h3>Round One</h3><a href="/championships/series-one/events/1d3ac2ae-bff6-408c-8729-f54f6e8e001f/results">Results</a></div>
        <div id="tab-pane-info"><h2>Descripción del Campeonato</h2><div class="markdown-content"><h1>Series One</h1><p>Public &amp; official competition information.</p></div></div>
        <div id="tab-pane-calendar"><h2>Calendario</h2><div class="glass-card p-0"><div><img src="/track.webp" alt="Fallback Track"></div><div><span>Finalizado</span><h3>Round One</h3><span><i class="fa-solid fa-location-dot"></i>Interlagos</span><span><i class="fa-regular fa-calendar"></i>Sábado, 3 de octubre - 16:00h</span><a href="/championships/series-one/events/1d3ac2ae-bff6-408c-8729-f54f6e8e001f/results">Results</a></div></div>
        <div class="glass-card p-0"><img src="/track-two.webp" alt="Paul Ricard"><div><span>Pendiente</span><h3>Round Two</h3><span><i class="fa-regular fa-calendar"></i>Sábado, 24 de octubre - 16:00h</span></div></div></div>
        <div id="tab-pane-entrants"><div><!-- Race Number (Dorsal) --><span>#16</span><a href="/pilot/samuel">Samuel Fernández</a><i class="fa-solid fa-car"></i><p>Formula 3</p></div></div>
        <div class="glass-card"><h3>Unrelated Page Card</h3></div>
        """;
    const string Empty = """
        <div id="standings-pane-pilots"><p>No standings yet.</p></div>
        <div id="tab-pane-results"><p>No results yet.</p></div>
        """;
    const string Full = """
        <button id="btn-session-2">Carrera 1</button><table><tbody>
        <tr class="result-row-2"><td>1</td><td>1</td><td><div><a href="/pilot/samuel">Samuel Fernández</a></div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>Team One</td><td>25</td><td>1:27</td><td>S</td><td>99%</td><td>37:06.839</td><td>10</td><td>2</td><td>1</td></tr>
        <tr class="result-row-2"><td>DSQ</td><td>3</td><td><div>Private Driver</div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>—</td><td>25</td><td>1:27</td><td>S</td><td>99%</td><td>Descalificado</td><td>0</td><td>0</td><td>0</td></tr>
        </tbody></table>
        """;

    public static async Task Run(Action<bool, string> assert, Action<Action, string> reject)
    {
        var parsed = ChampionshipsService.Parse(Catalog);
        assert(parsed.Length == 2 && parsed[0].Id == "series-one" && parsed[0].Status == "active" && parsed[1].Status == "upcoming",
            "championship selector includes active and registration-open series while excluding archives, finished, draft and external cards");
        assert(parsed[0].Name == "Series One" && parsed[0].Image == "https://www.makrobeasts.com/uploads/one.webp"
            && parsed[1].Image == "https://i.imgur.com/two.png", "championship selector uses official names, safe images and canonical URLs");
        assert(parsed[0].Car == "Formula 3" && parsed[0].Registered == 23 && parsed[0].Capacity == 32 && parsed[0].License == "Nacional B"
            && parsed[0].Format == "Ranked · Open" && parsed[0].Rounds == 3 && parsed[0].DateLabel == "Sábado, 24 de octubre - 16:00h",
            "championship cards expose the official cars, capacity, license, format, rounds and next localized date");
        assert(parsed[1].Car == null && parsed[1].Registered == null && parsed[1].Capacity == null && parsed[1].License == null && parsed[1].Rounds == null,
            "championship cards preserve absent metadata instead of inventing entry requirements");
        var unsafeImage = ChampionshipsService.Parse(Catalog.Replace("/uploads/one.webp", "https://evil.test/logo.png"));
        assert(unsafeImage[0].Image == null, "championship selector rejects third-party untrusted artwork");
        assert(ChampionshipsService.Parse("<h2>Campeonatos activos</h2><p>No hay campeonatos activos</p><h2>Salón de la Fama</h2>").Length == 0,
            "championship selector accepts an explicit empty active season");
        reject(() => ChampionshipsService.Parse("<h1>Sign in</h1>"), "championship selector rejects unsupported successful HTML responses");
        reject(() => ChampionshipsService.Parse("<h2>Campeonatos activos</h2><a href=\"/championships/changed-layout\">Series</a>"),
            "championship selector does not mistake changed published-card markup for an empty season");
        foreach (var source in new[] { "https://www.makrobeasts.com:444/championships/one", "https://www.makrobeasts.com/championships/one/admin", "https://www.makrobeasts.com/championships/one?url=https://evil.test" })
            reject(() => ResultsService.ValidateSourceUrl(source), "championship results reject unsupported ports, paths and queries");
        var info = ChampionshipsService.ParseDetails(Populated, "series-one", RacesService.Origin + "/championships/series-one");
        assert(info.Description == "Series One Public & official competition information." && info.Calendar.Length == 2
            && info.Calendar[0].Id == Round && info.Calendar[0].Track == "Interlagos" && info.Calendar[0].Status == "completed"
            && info.Calendar[1].Id == "round-2" && info.Calendar[1].Track == "Paul Ricard" && info.Calendar[1].Status == "pending"
            && info.Calendar.All(r => r.StartAt == null) && info.Calendar[1].DateLabel == "Sábado, 24 de octubre - 16:00h",
            "championship information is plain text and contains only published calendar cards with honest localized dates");
        assert(info.Participants.Single().Team == "Team One" && info.Participants[0].Car == "Formula 3",
            "championship information preserves entrant cars and uses the competition's own standings for team associations");
        reject(() => ChampionshipsService.ParseDetails(Populated, "series-two", RacesService.Origin + "/championships/series-one"),
            "championship information rejects a mismatched selected source");
        reject(() => ChampionshipsService.ParseDetails("<h1>Login</h1>", "series-one", RacesService.Origin + "/championships/series-one"),
            "championship information does not turn an unsupported successful response into an empty competition");

        var handler = new FixtureHandler();
        using var client = new HttpClient(handler);
        var results = new ResultsService(client);
        var service = new ChampionshipsService(results, client);
        var catalog = await service.Get();
        var first = await service.GetResults("series-one");
        var firstCalls = handler.Calls;
        var second = await service.GetResults("series-two");
        var secondCalls = handler.Calls;
        var firstAgain = await service.GetResults("series-one");
        assert(catalog.Championships.Length == 2 && first.Standings.Single().Driver == "Samuel Fernández" && first.Races.Single().Id == Round,
            "championship endpoints resolve official active IDs and their standings and result previews");
        assert(second.Standings.Length == 0 && second.Races.Length == 0 && second.SourceUrl.EndsWith("/series-two"),
            "new active championships return empty published standings and results without requiring a podium championship UUID");
        assert(handler.Calls == secondCalls && secondCalls == firstCalls + 1 && ReferenceEquals(first, firstAgain),
            "switching championship sources preserves independent caches without eagerly fetching other championships");
        assert(first.Standings[0].TeamNames?.Single() == "Team One", "championship results preserve the competition's published team names");
        var detailsBefore = handler.Calls;
        var details = await service.GetDetails("series-one");
        await service.GetDetails("series-one");
        assert(handler.Calls == detailsBefore + 1 && details.ChampionshipId == "series-one" && details.Calendar.Length == 2,
            "opening championship information fetches only its one public source and caches it without downloading podiums or full results");
        var emptyDetails = await service.GetDetails("series-two");
        assert(emptyDetails.Description == null && emptyDetails.Participants.Length == 0 && emptyDetails.Calendar.Length == 0 && emptyDetails.Warnings.Length == 0,
            "new championships can honestly publish no description, participants or calendar");
        await Reject(() => service.GetDetails("archive"), "CHAMPIONSHIP_NOT_FOUND", "information cannot be requested for an archived championship");
        await Reject(() => service.GetDetails("../series-one"), "INVALID_CHAMPIONSHIP", "information identifiers cannot inject a source URL");
        await Reject(() => service.GetResults("archive"), "CHAMPIONSHIP_NOT_FOUND", "archived championship IDs cannot be requested through active endpoints");
        await Reject(() => service.GetResults("../series-one"), "INVALID_CHAMPIONSHIP", "championship IDs cannot inject a source URL");
        await Reject(() => service.GetResult("series-two", Round), "RACE_RESULT_NOT_FOUND", "a race result from a different championship is rejected");
        await Reject(() => service.GetResult("series-one", WrongRound), "RACE_RESULT_NOT_FOUND", "unpublished event IDs cannot be requested through active championship endpoints");
        var full = await service.GetResult("series-one", Round);
        var fullCalls = handler.Calls;
        await service.GetResult("series-one", Round);
        assert(full.ResultsScope == "full" && full.Sessions.Single().Results.Length == 2 && full.Sessions[0].Results[0].Number == "#16"
            && full.Sessions[0].Results[1].PositionLabel == "DSQ" && handler.Calls == fullCalls,
            "active championship full results are lazy, cached, retain disqualifications and enrich known driver numbers");
        handler.FailDetails = true;
        var staleDetails = await service.GetDetails("series-one", refresh: true);
        assert(staleDetails.UpdatedAt == details.UpdatedAt && staleDetails.Warnings.Length == 1 && staleDetails.Calendar.Length == 2,
            "a failed information refresh retains that championship's previous public information with a stale warning");
        handler.FailCatalog = true;
        var stale = await service.Get(refresh: true);
        assert(stale.UpdatedAt == catalog.UpdatedAt && stale.Warnings.Length == 1 && stale.Championships.Length == 2,
            "active championship catalog retains the last list with an honest stale warning after a failed refresh");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        try { await service.Get(refresh: true, ct: cancellation.Token); throw new Exception("Canceled catalog request accepted"); }
        catch (OperationCanceledException) { assert(true, "championship requests preserve caller cancellation"); }
        try { await service.GetDetails("series-one", ct: cancellation.Token); throw new Exception("Canceled championship information request accepted"); }
        catch (OperationCanceledException) { assert(true, "cached championship information still preserves caller cancellation"); }

        async Task Reject(Func<Task> operation, string code, string name)
        {
            try { await operation(); throw new Exception("FAIL: accepted " + name); }
            catch (AppFault fault) { assert(fault.Code == code, name); }
        }
        if (Environment.GetEnvironmentVariable("EC3_LIVE_CHAMPIONSHIPS_TEST") == "1")
        {
            var live = new ChampionshipsService(new ResultsService());
            var active = await live.Get(true);
            assert(active.Championships.Length > 0 && active.Championships.All(c => c.Status is "active" or "upcoming"), "live active championship selector reads official current-season cards");
            foreach (var championship in active.Championships)
            {
                var data = await live.GetResults(championship.Id);
                assert(data.SourceUrl == championship.Url, "live championship selection returns results for " + championship.Name);
                var liveDetails = await live.GetDetails(championship.Id);
                assert(liveDetails.ChampionshipId == championship.Id && liveDetails.SourceUrl == championship.Url && liveDetails.Calendar.Length > 0,
                    "live championship information returns published calendar and entrants for " + championship.Name
                    + $" ({liveDetails.Participants.Length} participants, {liveDetails.Calendar.Length} rounds; card: {championship.Registered}/{championship.Capacity} entries, {championship.Rounds} rounds, license {championship.License})");
            }
        }
    }

    sealed class FixtureHandler : HttpMessageHandler
    {
        public int Calls;
        public bool FailCatalog;
        public bool FailDetails;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            Calls++;
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/championships" && FailCatalog) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            if (path == "/championships/series-one" && FailDetails) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            var body = path switch
            {
                "/championships" => Catalog,
                "/championships/series-one" => Populated,
                "/championships/series-two" => Empty,
                "/championships/series-one/events/" + Round + "/results" => Full,
                "/api/championships/809a391d-6943-4403-ab2c-5fd70fb121f0/events/" + Round + "/podium" => """{"sessions":[{"name":"Carrera 1","classes":{"all":[{"name":"Samuel Fernández","car":"F3","time":"37:06.839","raceNumber":16}]}}]}""",
                _ => throw new InvalidOperationException("Unexpected source: " + path),
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
        }
    }
}
