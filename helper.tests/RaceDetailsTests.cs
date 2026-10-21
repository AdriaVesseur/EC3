using System.Net;
using Eurocup3;

static class RaceDetailsTests
{
    const string Round = "1d3ac2ae-bff6-408c-8729-f54f6e8e001f";
    const string NextRound = "54232026-f850-4d8e-884a-e18f82563df3";
    const string OtherRound = "1e95ee2c-41cd-4215-a0f1-a6f180c6654a";
    const string Event = "352dd21b-ae50-4746-b01d-ac58c76bb3c3";
    const string Source = "https://www.makrobeasts.com/championships/formula-3-2026";
    const string Entrants = """
        <div id="tab-pane-summary"><a href="/pilot/summary-only">Not an entrant</a></div>
        <div id="tab-pane-entrants">
          <h4>Class A</h4><div>
            <div><!-- Race Number (Dorsal) --><span>#16</span>
              <div><a href="/pilot/samuel">Samuel Fernández</a></div>
              <div><i class="fa-solid fa-car text-xs"></i><p>Tatuus F3 T-318 (2024)</p></div>
            </div>
            <div><!-- Race Number (Dorsal) --><span>#8</span>
              <div><a href="/pilot/sergi">Sergi Morera</a></div>
              <div><i class="fa-solid fa-car text-xs"></i><p>F3</p></div>
              <a href="/teams/one">Beasts &amp; Friends</a>
            </div>
          </div>
        </div>
        <footer><a href="/pilot/footer-only">Not an entrant</a></footer>
        """;
    const string Standings = """
        <div id="standings-pane-pilots"><div><table><tbody>
        <tr><td>1</td><td>#16</td><td><a>Samuel Fernández</a></td><td>Class</td><td>F3</td><td><a href="/teams/two">Elite Racing Team</a></td><td>64</td></tr>
        </tbody></table></div><div><table><tbody>
        <tr><td>1</td><td>#8</td><td>Sergi Morera</td><td>Class</td><td>F3</td><td>Beasts &amp; Friends</td><td>51</td></tr>
        </tbody></table></div></div>
        <div id="standings-pane-teams"><table><tr><td>1</td><td>A Team</td><td>100</td><td>64</td></tr></table></div>
        """;
    const string EventEntrants = """
        <div id="tab-pane-entrants"><div><article>
          <h3>Mecanicat Racers</h3><div><span class="absolute inset-x-0 bottom-0 truncate">BMW M4 GT3</span></div>
          <div><span class="max-w-[180px] truncate text-xs font-semibold text-slate-300">Francisco Donoso</span></div>
          <div><span class="max-w-[180px] truncate text-xs font-semibold text-slate-300">Alex Yagüe</span></div>
        </article></div></div><div id="tab-pane-results">Todavía no hay resultados</div>
        """;
    // Reduced real public row markup: primary .result-row-N rows are separated by very large hidden lap-detail rows.
    const string FullResults = """
        <button id="btn-session-0"><i class="fa-solid fa-stopwatch"></i>Clasificación</button>
        <button id="btn-session-2"><i class="fa-solid fa-flag-checkered"></i>Carrera 1</button>
        <table><tbody>
          <tr class="result-row-0"><td>1</td><td><div><a href="/pilot/samuel">Samuel Fernández</a></div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>Elite Racing Team</td><td>S</td><td>Sectors</td><td>1:27.119</td></tr>
        </tbody></table>
        <table><tbody>
          <tr class="hover:bg-white/10 result-row-2" data-category-id="class-one"><td>1</td><td>2</td><td><div><a href="/pilot/samuel">Samuel Fernández</a></div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>Elite Racing Team</td><td>25</td><td>1:27</td><td>S</td><td>99%</td><td><span>37:06.839</span></td><td>10</td><td>2</td><td>1</td></tr>
          <tr id="details-2-0"><td><table><tr><td>Hidden lap detail</td></tr></table></td></tr>
          <tr class="result-row-2"><td>2</td><td>1</td><td><div><a href="/pilot/sergi">Sergi Morera</a></div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>—</td><td>25</td><td>1:27</td><td>S</td><td>99%</td><td><div><span>37:07.671</span><span>+0.832</span></div><div><span>+0.4s</span></div></td><td>10</td><td>2</td><td>1</td></tr>
          <tr class="result-row-2"><td>DSQ</td><td>3</td><td><div>Private Driver</div><div class="text-muted font-mono uppercase">F3</div></td><td>License</td><td>—</td><td>25</td><td>1:27</td><td>S</td><td>99%</td><td><span>Descalificado</span></td><td>0</td><td>0</td><td>0</td></tr>
        </tbody></table>
        """;

    public static async Task Run(Action<bool, string> assert, Action<Action, string> reject)
    {
        var entrants = RaceDetailsService.ParseParticipants(Entrants, "championship");
        assert(entrants.Length == 2 && entrants[0].Driver == "Samuel Fernández" && entrants[0].Number == "#16"
            && entrants[0].Car == "Tatuus F3 T-318 (2024)" && entrants[1].Team == "Beasts & Friends",
            "race details read the complete scoped championship entrant pane, names, numbers and cars");
        var eventEntrants = RaceDetailsService.ParseParticipants(EventEntrants, "event");
        assert(eventEntrants.Length == 2 && eventEntrants[1].Driver == "Alex Yagüe" && eventEntrants.All(p => p.Team == "Mecanicat Racers" && p.Car == "BMW M4 GT3"),
            "race details read independent event team drivers and their assigned car");
        var standings = RaceDetailsService.ParseStandings(Standings);
        assert(standings.Length == 2 && standings[0].Points == "64" && standings[0].TeamNames?.Single() == "Elite Racing Team"
            && standings[1].TeamNames?.Single() == "Beasts & Friends", "race details read all pilot classification tables and official teams without leaking team standings");
        var sessions = RaceDetailsService.ParseFullResults(FullResults);
        assert(sessions.Length == 2 && sessions[1].Name == "Carrera 1" && sessions[1].Results.Length == 3,
            "full race results include every primary result row and exclude nested lap histories");
        assert(sessions[1].Results[0].Time == "37:06.839" && sessions[1].Results[1].Time == "+0.832"
            && sessions[1].Results[2].Driver == "Private Driver" && sessions[1].Results[2].Time == "Descalificado",
            "full race results preserve winner time, following gaps, private drivers and disqualifications without penalty time confusion");
        var dnf = RaceDetailsService.ParseFullResults(FullResults.Replace("DSQ", "DNF").Replace("Descalificado", "No finalizó"));
        assert(sessions[1].Results[2].Position == 0 && sessions[1].Results[2].PositionLabel == "DSQ"
            && dnf[1].Results[2].Position == 0 && dnf[1].Results[2].PositionLabel == "DNF",
            "full race results retain published DSQ and DNF labels without assigning invented finishing ranks");
        assert(sessions[1].Results[0].Team == "Elite Racing Team" && sessions[1].Results[0].Car == "F3",
            "full race results expose the published team and car separately");
        reject(() => RaceDetailsService.ValidateRaceId("https://evil.test"), "race details reject arbitrary source URLs as identifiers");
        reject(() => RaceDetailsService.ValidateRaceId("championship:../../../admin"), "race details reject path traversal identifiers");
        foreach (var unsafeUrl in new[] { "https://evil.test/events/" + Round + "/results", "https://www.makrobeasts.com:444/events/" + Round + "/results", "https://evil@www.makrobeasts.com/events/" + Round + "/results", Source + "/events/" + Round + "/results?url=https://evil.test", Source + "/events/00000000----------------------------/results" })
            reject(() => RaceDetailsService.ValidateResultUrl(unsafeUrl), "race details reject an unsafe result destination");
        assert(RaceDetailsService.ValidateResultUrl(Source + "/events/" + Round + "/results").StartsWith(Source), "race details accept canonical official fullresult URLs");

        var fixture = new FixtureHandler();
        using var http = new HttpClient(fixture);
        var service = new RaceDetailsService(new RacesService(http), http);
        var details = await service.Get("championship:" + Round);
        assert(details.Scope == "championship" && details.Participants.Length == 2 && details.Standings.Length == 2
            && details.Participants[0].Team == "Elite Racing Team", "race details combine the selected competition roster and classification with exact team associations");
        assert(details.Results.Length == 1 && details.Results[0].Id == Round && details.Results[0].ResultsScope == "podium"
            && details.Results[0].Sessions.Single().Results.Length == 3 && fixture.FullCalls == 0,
            "opening details retrieves only small published previews and never downloads full result pages");
        var calls = fixture.Calls;
        var cached = await service.Get("championship:" + Round);
        var shared = await service.Get("championship:" + NextRound);
        assert(fixture.Calls == calls && cached.RaceId == "championship:" + Round && shared.RaceId == "championship:" + NextRound,
            "race details reuse a fresh competition source without confusing the selected round identifier");
        var full = await service.GetResult("championship:" + NextRound, Round);
        var fullCalls = fixture.Calls;
        await service.GetResult("championship:" + Round, Round);
        assert(full.ResultsScope == "full" && full.Sessions[1].Results[0].Number == "#16" && full.Sessions[1].Results.Length == 3
            && fixture.Calls == fullCalls && fixture.FullCalls == 1, "full race results load lazily once, recover entrant numbers and share a bounded per-round cache");
        var independent = await service.Get("event:" + Event);
        assert(independent.Scope == "event" && independent.Participants.Length == 2 && independent.Standings.Length == 0 && independent.Results.Length == 0,
            "independent pending events retain real team entrants and honest unpublished classifications");
        var rejected = false;
        try { await service.GetResult("championship:" + NextRound, OtherRound); }
        catch (AppFault fault) { rejected = fault.Code == "RACE_RESULT_NOT_FOUND"; }
        assert(rejected, "full result endpoint cannot fetch a result belonging to a different competition");
        fixture.OversizedResult = true;
        var oversized = false;
        try { await service.GetResult("championship:" + Round, Round, true); }
        catch (AppFault fault) { oversized = fault.Code == "RACE_RESULT_UNAVAILABLE"; }
        assert(oversized, "full result loader enforces its response size limit before reading the body");
        fixture.OversizedResult = false;
        fixture.FailPreviews = true;
        var partial = await service.Get("championship:" + Round, true);
        assert(partial.Participants.Length == 2 && partial.Standings.Length == 2 && partial.Results.Length == 1
            && partial.Results[0].ResultsScope == "unpublished" && partial.Warnings.Length == 1,
            "failed podium preview preserves public roster, standings and lazy fullresult metadata with an explicit warning");
        fixture.FailPreviews = false;
        fixture.FailSource = true;
        var stale = await service.Get("championship:" + Round, true);
        assert(stale.RaceId == partial.RaceId && stale.UpdatedAt == partial.UpdatedAt && stale.Warnings.Any(w => w.Contains("last available")),
            "failed race refresh preserves only the selected race cache with an explicit stale warning");
        var isolated = false;
        try { await service.Get("championship:" + OtherRound); }
        catch (AppFault fault) { isolated = fault.Code == "RACE_DETAILS_UNAVAILABLE"; }
        assert(isolated, "a failed different competition never displays stale participants from the previous selection");
        fixture.FailSource = false;
        fixture.DetailsHtml = "<main>Maintenance / changed markup</main>";
        var invalid = false;
        using (var freshHttp = new HttpClient(fixture))
        {
            try { await new RaceDetailsService(new RacesService(freshHttp), freshHttp).Get("championship:" + Round); }
            catch (AppFault fault) { invalid = fault.Code == "RACE_DETAILS_UNAVAILABLE"; }
        }
        assert(invalid, "race details reject successful maintenance pages instead of reporting empty participants");
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        try { await service.Get("championship:" + Round, true, cancellation.Token); throw new Exception("Cancellation ignored"); }
        catch (OperationCanceledException) { assert(true, "race details propagate caller cancellation"); }
        if (Environment.GetEnvironmentVariable("EC3_LIVE_RACE_DETAILS_TEST") == "1")
        {
            var liveRaces = new RacesService();
            var catalog = await liveRaces.Get();
            var selected = catalog.Races.First(r => r.Url.Contains("/formula-3-2026") && r.Status == "completed");
            var liveService = new RaceDetailsService(liveRaces);
            var live = await liveService.Get(selected.Id);
            assert(live.Participants.Length > 20 && live.Standings.Length > 20 && live.Results.Length > 0,
                "live race details read real Formula3 entrants, championship standings and published rounds");
            var round = live.Results.Last();
            var liveFull = await liveService.GetResult(selected.Id, round.Id);
            assert(liveFull.ResultsScope == "full" && liveFull.Sessions.Any(s => s.Name.Contains("Carrera") && s.Results.Length > 20),
                "live lazy full results include every published Formula3 race finisher beyond the podium");
            Console.WriteLine($"Live race details: {live.Participants.Length} entrants, {live.Standings.Length} standings, {live.Results.Length} rounds; full sessions {string.Join(", ", liveFull.Sessions.Select(s => s.Name + ": " + s.Results.Length))}.");
            var porscheRace = catalog.Races.First(r => r.Url.Contains("/porsche-sprint-cup-s2-2026"));
            var porsche = await liveService.Get(porscheRace.Id);
            var multiclassRace = catalog.Races.First(r => r.Url.Contains("multiclass", StringComparison.OrdinalIgnoreCase));
            var multiclass = await liveService.Get(multiclassRace.Id);
            var standaloneRace = catalog.Races.First(r => r.Id == "event:" + Event);
            var standalone = await liveService.Get(standaloneRace.Id);
            assert(porsche.Participants.Length >= 20 && porsche.Standings.Length >= 20 && porsche.Results.Length > 0,
                "live Porsche details use the selected championship roster and standings");
            assert(multiclass.Participants.Length >= 20 && multiclass.Standings.Length == 0 && multiclass.Results.Length == 0,
                "live upcoming Multiclass details include the complete roster without inventing standings or results");
            assert(standalone.Participants.Length >= 4 && standalone.Participants.All(p => p.Team != null) && standalone.Results.Length == 0,
                "live standalone endurance details retain published team drivers without inventing results");
            Console.WriteLine($"Live selected competitions: Porsche {porsche.Participants.Length} entrants / {porsche.Standings.Length} standings / {porsche.Results.Length} rounds; Multiclass {multiclass.Participants.Length} entrants; event {standalone.Participants.Length} drivers / {standalone.Participants.Select(p => p.Team).Distinct().Count()} teams.");
        }
    }

    sealed class FixtureHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public int FullCalls { get; private set; }
        public bool FailSource { get; set; }
        public bool FailPreviews { get; set; }
        public bool OversizedResult { get; set; }
        public string DetailsHtml { get; set; } = Entrants + Standings + $"""
            <div id="tab-pane-results"><span>R1</span><h3>Ronda 1 | Hockenheim GP</h3>
            <a href="/championships/formula-3-2026/events/{Round}/results">Results</a>
            <div data-champ="0ae47269-b247-41f5-bad0-361e6fd2d3ae" data-event="{Round}"></div>
            <a href="/championships/other-series/events/{OtherRound}/results">Another competition</a></div>
            """;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            ct.ThrowIfCancellationRequested();
            var path = request.RequestUri!.AbsolutePath;
            if (FailPreviews && path.EndsWith("/podium", StringComparison.Ordinal))
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            string body;
            if (path == "/championships/calendar") body = $$"""
                <script>const calendarEvents = [
                {"eventId":"{{Round}}","eventName":"Ronda 1 | Hockenheim GP","champSlug":"formula-3-2026","champName":"Formula 3","dateIso":"2026-05-02T14:00:00Z","trackName":"Hockenheim GP","isCompleted":true},
                {"eventId":"{{NextRound}}","eventName":"Ronda 2","champSlug":"formula-3-2026","champName":"Formula 3","dateIso":"2026-11-02T14:00:00Z","trackName":"Imola","isCompleted":false},
                {"eventId":"{{OtherRound}}","eventName":"Other","champSlug":"other-series","champName":"Other series","dateIso":"2026-05-02T14:00:00Z","trackName":"Imola","isCompleted":true}];</script>
                """;
            else if (path == "/championships") body = "<div class=\"glass-card group/card overflow-hidden\"><span>23 / 26</span><a href=\"/championships/formula-3-2026\">Formula 3</a></div>";
            else if (path == "/events") body = $"<article><a href=\"/events/{Event}\">Event</a><h3>4H de Paul Ricard</h3><span>Próximo</span></article>";
            else if (path == "/events/" + Event) body = EventEntrants;
            else if (path.EndsWith("/podium", StringComparison.Ordinal)) body = """
                {"sessions":[{"name":"Carrera 1","classes":{"all":[{"name":"Samuel Fernández","time":"37:06.839","raceNumber":16},{"name":"Sergi Morera","time":"+0.832","raceNumber":8},{"name":"Private Driver","time":"+1.2"}]}}]}
                """;
            else if (path.EndsWith("/results", StringComparison.Ordinal)) { FullCalls++; body = FullResults; }
            else if (FailSource) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            else body = DetailsHtml;
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) };
            if (OversizedResult && path.EndsWith("/results", StringComparison.Ordinal)) response.Content.Headers.ContentLength = 33 * 1024 * 1024;
            return Task.FromResult(response);
        }
    }
}
