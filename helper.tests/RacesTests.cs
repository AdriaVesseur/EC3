using System.Net;
using Eurocup3;

static class RacesTests
{
    const string Calendar = """
        <script>const calendarEvents = [
          {"eventId":"852feb32-c1f4-4e17-a91a-edeed87ba61a","eventName":"Ronda 1 | Paul Ricard","champSlug":"multiclass-series-2026","champName":"Multiclass Series 2026","dateIso":"2026-10-24T14:00:00.000Z","trackId":"jt_paul_ricard/long_chic","trackName":"Paul Ricard","champImage":"/uploads/multiclass.webp","isCompleted":false},
          {"eventId":"60a59b98-7416-4a10-b221-6c85204ab948","eventName":"Ronda 4 | Bathurst","champSlug":"porsche-2026","champName":"Porsche","dateIso":"2026-11-01T15:00:00.000Z","trackId":"rt_bathurst","trackName":"Bathurst","champImage":"https://i.imgur.com/series.png","isCompleted":false},
          {"eventId":"4a0fd358-29fd-416c-b4aa-16600a56757e","eventName":"Past but pending","champSlug":"porsche-2026","champName":"Porsche","dateIso":"2026-10-18T14:00:00.000Z","champImage":"https://evil.test/series.png","isCompleted":false},
          {"eventId":"2bd317ed-2640-4265-b8bb-e1f67ff858d4","eventName":"Complete","champSlug":"porsche-2026","champName":"Porsche","dateIso":"2026-10-04T14:00:00.000Z","isCompleted":true},
          {"eventId":"2bd317ed-2640-4265-b8bb-e1f67ff858d4","eventName":"Unsafe","champSlug":"//evil.test","isCompleted":false}
        ]; window.neverExecuteThis = 1;</script>
        """;
    const string Championships = """
        <div class="glass-card group/card overflow-hidden">
          <span>26 / 32</span>
          <span>Lic. mín.</span><span>Nacional B</span>
          <h3><a href="/championships/multiclass-series-2026">Multiclass</a></h3>
          <span>Ranked</span><span>Open</span><span>Salida en Lanzado</span>
          <div onmouseover="showAssetPopup(this, 'car', 'gt3', 'Porsche GT3')"></div>
        </div>
        <div class="glass-card group/card overflow-hidden">
          <span>26 / 26</span><a href="/championships/porsche-2026">Porsche</a>
        </div>
        """;
    const string Events = """
        <article>
          <a href="/events/352dd21b-ae50-4746-b01d-ac58c76bb3c3"><img src="/uploads/event.webp"></a>
          <span>Próximo</span><p>Endurance 4H Series</p><h3>4H de Paul Ricard</h3>
          <div><span>Fecha</span></div><span>Sábado, 31 de octubre - 16:00h</span>
          <div><span>Circuito</span></div><span>Paul Ricard - Long Chicane</span>
          <figcaption>Porsche GT3</figcaption><figcaption>BMW GT3</figcaption>
          <span>Inscripción abierta</span>
        </article>
        <article><a href="https://evil.test/events/352dd21b-ae50-4746-b01d-ac58c76bb3c3">Bad</a><h3>Ignore</h3></article>
        """;

    public static async Task Run(Action<bool, string> assert, Action<Action, string> reject)
    {
        var metadata = RacesService.ParseChampionships(Championships);
        assert(metadata.Length == 2 && metadata[0].Car == "Porsche GT3" && metadata[0].License == "Nacional B" && metadata[1].RegistrationStatus == "full", "races read official car, license and capacity metadata");
        var entries = RacesService.ParseCalendar(Calendar, metadata, DateTimeOffset.Parse("2026-10-20T10:00:00Z"));
        assert(entries.Length == 4 && entries[0].Car == "Porsche GT3" && entries[0].Registered == 26 && entries[0].Capacity == 32, "races merge all calendar rounds with series details and reject unsafe slugs");
        assert(entries[0].DateLabel.Contains("16:00") && entries[1].DateLabel.Contains("16:00") && entries.All(r => r.DateLabel.EndsWith("Europe/Madrid")), "races use Madrid timezone across summer and winter offsets");
        assert(entries[2].Status == "pending" && entries[3].Status == "completed" && entries[3].RegistrationUrl == null, "races require official completed flag and hide closed registration");
        assert(entries[0].Image?.Contains("jt_paul_ricard/long_chic/preview") == true && entries[0].RegistrationUrl == "https://www.makrobeasts.com/championships/multiclass-series-2026", "races expose verified track image and official entry page");
        assert(entries[0].SeriesImage == "https://www.makrobeasts.com/uploads/multiclass.webp"
            && entries[1].SeriesImage == "https://i.imgur.com/series.png" && entries[2].SeriesImage == null && entries[3].SeriesImage == null,
            "races expose safe series artwork independently from track previews and omit unsafe or missing artwork");
        var missingTrack = RacesService.ParseCalendar(Calendar.Replace("jt_paul_ricard/long_chic", "../private"));
        assert(missingTrack[0].Image == missingTrack[0].SeriesImage && missingTrack[0].SeriesImage == entries[0].SeriesImage
            && missingTrack[2].Image == null, "races fall back to safe series artwork when the track image is unavailable");
        var events = RacesService.ParseEvents(Events);
        assert(events.Length == 1 && events[0].Name == "4H de Paul Ricard" && events[0].Championship == "Endurance 4H Series" && events[0].Track == "Paul Ricard - Long Chicane", "races read independent event cards without external links");
        assert(events[0].StartAt == null && events[0].DateLabel.Contains("31 de octubre") && events[0].Status == "upcoming" && events[0].RegistrationStatus == "open", "races preserve official localized dates instead of inventing a year");
        assert(events[0].SeriesImage == "https://www.makrobeasts.com/uploads/event.webp" && events[0].SeriesImage == events[0].Image,
            "races expose the official independent event artwork as series image");
        var unsafeArtwork = RacesService.ParseEvents(Events.Replace("/uploads/event.webp", "https://evil.test/event.webp"));
        assert(unsafeArtwork[0].SeriesImage == null && unsafeArtwork[0].Image == null,
            "races omit unsafe independent event artwork from both image fields");
        assert(RacesService.OfficialUrl("https://makrobeasts.com/championships/series#calendar") == "https://www.makrobeasts.com/championships/series"
            && RacesService.OfficialUrl("https://www.makrobeasts.com.evil.test/events") == null
            && RacesService.OfficialUrl("https://evil@makrobeasts.com/events") == null
            && RacesService.OfficialUrl("https://makrobeasts.com:444/events") == null
            && RacesService.OfficialUrl("/admin/delete") == null, "races accept only safe official championship and event links");
        reject(() => RacesService.ParseCalendar("<html>Changed page</html>"), "races reject unsupported calendar markup");
        reject(() => RacesService.ParseCalendar("<script>const calendarEvents = [{\"renamedEventId\":\"unknown\"}];</script>"), "races reject nonempty calendar with an incompatible entry schema");
        reject(() => RacesService.ParseEvents("<main><h1>Mantenimiento</h1></main>"), "races reject HTTP-success event maintenance pages instead of reporting no events");
        reject(() => RacesService.ParseChampionships("<main><h1>Sign in</h1></main>"), "races reject HTTP-success incompatible championship pages");
        assert(RacesService.ParseCalendar("<script>const calendarEvents = [];</script>").Length == 0
            && RacesService.ParseEvents("<main><h2>Carreras publicadas</h2><span>0 eventos</span></main>").Length == 0
            && RacesService.ParseChampionships("<main><p>No hay campeonatos publicados.</p></main>").Length == 0,
            "races accept explicit official empty lists without warning");
        reject(() => RacesService.ParseEvents("<main><p>0 eventos</p><div><a href=\"/events/352dd21b-ae50-4746-b01d-ac58c76bb3c3\">Changed card layout</a></div></main>"),
            "races reject a changed published-card layout even beside empty-state text");
        var bounded = RacesService.ParseChampionships(Championships + "<footer><span>Finalizado</span><p>Open series archive</p></footer>");
        assert(bounded[1].RegistrationStatus == "full", "races scope championship status to its card instead of footer text");
        var inCourse = RacesService.ParseEvents(Events.Replace("Próximo", "En curso"));
        var pending = RacesService.ParseEvents(Events.Replace("Próximo", "Pendiente"));
        var completedEvents = RacesService.ParseEvents(Events.Replace("Próximo", "Finalizado"));
        assert(inCourse[0].Status == "upcoming" && pending[0].Status == "pending"
            && completedEvents[0].Status == "completed" && completedEvents[0].RegistrationUrl == null,
            "races respect independent event status without guessing completion from dates");
        var fallbackTitle = RacesService.ParseEvents(Events.Replace("<h3>4H de Paul Ricard</h3>", "").Replace("<a href=\"/events/", "<a aria-label=\"Ver evento: 4H de Paul Ricard\" href=\"/events/"));
        assert(fallbackTitle[0].Name == "4H de Paul Ricard", "races recover event titles from the official accessible link label");
        var handler = new FixtureHandler();
        using var client = new HttpClient(handler);
        var service = new RacesService(client);
        var catalog = await service.Get();
        var calls = handler.Calls;
        await service.Get();
        assert(catalog.Races.Length == 5 && catalog.TimeZone == "Europe/Madrid" && handler.Calls == calls, "races unify series and independent events and cache source requests");
        handler.FailEvents = true;
        var partial = await service.Get(refresh: true);
        assert(partial.Races.Length == 4 && partial.Warnings.Any(w => w.Contains("special events")), "races report partial failure while retaining available championship rounds");
        handler.FailAll = true;
        var stale = await service.Get(refresh: true);
        assert(stale.UpdatedAt == partial.UpdatedAt && stale.Races.Length == 4 && stale.Warnings.Any(w => w.Contains("last available")), "races retain cached calendar with explicit stale warning after outage");
        var changed = new FixtureHandler { EventsPage = "<main>Updated event layout</main>", ChampionshipsPage = "<main>Updated championship layout</main>" };
        using var changedClient = new HttpClient(changed);
        var partialMarkup = await new RacesService(changedClient).Get();
        assert(partialMarkup.Races.Length == 4 && partialMarkup.Warnings.Any(w => w.Contains("independent events"))
            && partialMarkup.Warnings.Any(w => w.Contains("entry requirements")),
            "races surface HTTP-success markup failures as partial-source warnings");
        changed.CalendarPage = "<main>Updated calendar layout</main>";
        try { await new RacesService(changedClient).Get(); throw new Exception("Invalid empty calendar accepted"); }
        catch (AppFault fault) { assert(fault.Code == "RACES_UNAVAILABLE", "races fail clearly when all HTTP-success sources have incompatible markup"); }
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        try { await service.Get(refresh: true, cancellation.Token); throw new Exception("Cancellation ignored"); }
        catch (OperationCanceledException) { assert(true, "races propagate caller cancellation"); }
        if (Environment.GetEnvironmentVariable("EC3_LIVE_RACES_TEST") == "1")
        {
            var live = await new RacesService().Get(refresh: true);
            assert(live.Races.Any(r => r.Kind == "championship") && live.Races.Any(r => r.Kind == "event"), "races load live MKBT calendar rounds and independent events");
            assert(live.Races.All(r => Uri.TryCreate(r.Url, UriKind.Absolute, out var u) && u.Host == "www.makrobeasts.com"), "races live links remain on official MKBT host");
            Console.WriteLine($"Live MKBT calendar: {live.Races.Length} races; {live.Races.Count(r => r.Status == "upcoming")} upcoming; {live.Warnings.Length} warnings.");
        }
    }

    sealed class FixtureHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public bool FailEvents { get; set; }
        public bool FailAll { get; set; }
        public string CalendarPage { get; set; } = Calendar;
        public string ChampionshipsPage { get; set; } = Championships;
        public string EventsPage { get; set; } = Events;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            ct.ThrowIfCancellationRequested();
            var path = request.RequestUri!.AbsolutePath;
            if (FailAll || FailEvents && path == "/events") return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            var text = path == "/championships/calendar" ? CalendarPage : path == "/events" ? EventsPage : ChampionshipsPage;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(text) });
        }
    }
}
