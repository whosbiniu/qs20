import Cocoa
import WebKit

final class CalendarBridge: NSObject, WKScriptMessageHandlerWithReply {
    var cached: [String: Any]?
    var expires = Date.distantPast
    let resources = Bundle.main.resourceURL!

    func fallback() -> [String: Any] {
        var data = cached ?? ((try? Data(contentsOf: resources.appendingPathComponent("snapshot.json")))
            .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) ?? [:]
        data["stale"] = true
        return data
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true else {
            replyHandler(nil, "Unsupported origin"); return
        }
        if let cached, expires > Date() { replyHandler(cached, nil); return }
        if CommandLine.arguments.contains("--offline") { replyHandler(fallback(), nil); return }
        var request = URLRequest(url: URL(string: "https://nfs.faireconomy.media/ff_calendar_thisweek.json")!)
        request.timeoutInterval = 10
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                guard error == nil, let response = response as? HTTPURLResponse,
                      response.statusCode == 200, let data,
                      let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                    self.expires = Date().addingTimeInterval(60)
                    replyHandler(self.fallback(), nil); return
                }
                let parser = ISO8601DateFormatter()
                let dated = rows.filter { $0["title"] is String && parser.date(from: $0["date"] as? String ?? "") != nil }
                    .sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }
                func value(_ row: [String: Any], _ key: String) -> String {
                    guard let v = row[key], !(v is NSNull) else { return "" }
                    return String(describing: v)
                }
                let events = dated.filter { value($0, "country") == "USD" }.map { row in
                    Dictionary(uniqueKeysWithValues: ["title", "date", "impact", "forecast", "previous"].map { ($0, value(row, $0)) })
                }
                let holidays = dated.filter {
                    value($0, "impact") == "Holiday" && !value($0, "title").lowercased().contains("daylight saving")
                }.map { row in
                    Dictionary(uniqueKeysWithValues: ["title", "date", "country", "impact"].map { ($0, value(row, $0)) })
                }
                let payload: [String: Any] = ["events": events, "holidays": holidays, "updatedAt": parser.string(from: Date())]
                self.cached = payload
                self.expires = Date().addingTimeInterval(900)
                replyHandler(payload, nil)
            }
        }.resume()
    }
}

final class CalendarExportBridge: NSObject, WKScriptMessageHandlerWithReply {
    var lastExport: URL?
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              let origin = message.frameInfo.request.url, origin.isFileURL,
              origin.standardizedFileURL.path.hasPrefix(Bundle.main.resourceURL!.path + "/public/"),
              let payload = message.body as? [String: String],
              let filename = payload["filename"],
              filename.range(of: "^uncsway-(day-)?[0-9]+-[134]\\.ics$", options: .regularExpression) != nil,
              let ics = payload["ics"], ics.utf8.count < 32768,
              ics.hasPrefix("BEGIN:VCALENDAR\r\n"), ics.hasSuffix("END:VCALENDAR\r\n") else {
            replyHandler(nil, "Nieprawidłowe wydarzenie."); return
        }
        do {
            let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                appropriateFor: nil, create: true).appendingPathComponent("UNCsWay/CalendarExports", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent(filename)
            try ics.write(to: file, atomically: true, encoding: .utf8)
            lastExport = file
            // Exercise file generation in smoke tests without adding test events to the user's calendar.
            if CommandLine.arguments.contains("--self-test") { replyHandler(["prepared": true], nil); return }
            guard let calendar = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.iCal") else {
                replyHandler(nil, "Nie znaleziono aplikacji Kalendarz."); return
            }
            NSWorkspace.shared.open([file], withApplicationAt: calendar, configuration: NSWorkspace.OpenConfiguration()) { _, error in
                DispatchQueue.main.async {
                    if let error { replyHandler(nil, error.localizedDescription) }
                    else { replyHandler(["opened": true], nil) }
                }
            }
        } catch { replyHandler(nil, error.localizedDescription) }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let calendar = CalendarBridge()
    let calendarExport = CalendarExportBridge()
    var selfTestStarted = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(calendar, contentWorld: .page, name: "calendar")
        config.userContentController.addScriptMessageHandler(calendarExport, contentWorld: .page, name: "calendarExport")
        config.userContentController.addUserScript(WKUserScript(source: """
        (() => {
          const original = window.fetch.bind(window);
          window.fetch = async (input, options) => {
            const path = typeof input === 'string' ? input : input.url;
            if (path === '/api/events') {
              const payload = await window.webkit.messageHandlers.calendar.postMessage(null);
              return new Response(JSON.stringify(payload), {headers: {'Content-Type': 'application/json'}});
            }
            return original(input, options);
          };
        })();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if CommandLine.arguments.contains("--self-test") {
            // Keep the existing weekday/window fixtures reproducible on weekends.
            config.userContentController.addUserScript(WKUserScript(source: """
            (() => {
              const RealDate=Date, fixed=RealDate.parse('2026-09-25T15:40:00Z');
              window.Date=class extends RealDate {
                constructor(...args){super(...(args.length?args:[fixed]));}
                static now(){return fixed;}
              };
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "UNC’sWay — Quarterly Timeline"
        window.minSize = NSSize(width: 850, height: 600)
        window.contentView = webView
        window.setFrameAutosaveName("QuarterlyTimeline")
        window.center()
        makeMenu()
        let root = Bundle.main.resourceURL!.appendingPathComponent("public")
        webView.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if CommandLine.arguments.contains("--self-test") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) { fputs("Self-test timeout\n", stderr); exit(1) }
        }
    }

    func makeMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "O UNC’sWay", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Ukryj UNC’sWay", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Zakończ UNC’sWay", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); menu.addItem(edit); edit.submenu = NSMenu(title: "Edycja")
        for (title, action, key) in [("Kopiuj", "copy:", "c"), ("Wklej", "paste:", "v"), ("Zaznacz wszystko", "selectAll:", "a")] {
            edit.submenu!.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let view = NSMenuItem(); menu.addItem(view); view.submenu = NSMenu(title: "Widok")
        for (title, action, key) in [("Odśwież", #selector(reload), "r"), ("Powiększ", #selector(zoomIn), "+"), ("Pomniejsz", #selector(zoomOut), "-"), ("Rozmiar domyślny", #selector(resetZoom), "0")] {
            let item = view.submenu!.addItem(withTitle: title, action: action, keyEquivalent: key); item.target = self
        }
        NSApp.mainMenu = menu
    }
    @objc func reload() { webView.reload() }
    @objc func zoomIn() { webView.pageZoom = min(2, webView.pageZoom + 0.1) }
    @objc func zoomOut() { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }
    @objc func resetZoom() { webView.pageZoom = 1 }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url); decisionHandler(.cancel)
        } else if url.isFileURL && url.standardizedFileURL.path.hasPrefix(Bundle.main.resourceURL!.path + "/public/") {
            decisionHandler(.allow)
        } else { decisionHandler(.cancel) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard CommandLine.arguments.contains("--self-test"), !selfTestStarted else { return }
        selfTestStarted = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            webView.evaluateJavaScript("""
            (() => {
            const ruleChecks = probabilityRules.every(rule => [2,3].every(sourceQ => {
              const values = [{name:'MONTHLY',q:1,label:'Q1'},
                {name:'WEEKLY',q:1,label:'Q1'},{name:'DAILY',q:2,label:'Q2'}];
              const source = values.find(v => v.name === rule.source);
              if(source) { source.q=sourceQ; source.label='Q'+sourceQ; }
              else values.push({name:rule.source,q:sourceQ,label:'Q'+sourceQ});
              const expected=rule.target==='90MIN'&&sourceQ===3?[3]:[1,3];
              return [1,2,3,4].every(q => Boolean(probabilityFor(rule.target,q,values)) === expected.includes(q));
            }));
            const q0Values = valuesAtPseudo(Date.UTC(2022,7,29,12));
            const fullWeekCheck = q0Values.find(v=>v.name==='MONTHLY').q===0 &&
              probabilityFor('90MIN',1,q0Values)===null &&
              CycleRules.fullWeekQuarter(2025,1,31)===4;
            const testDay = Date.UTC(2026,8,24);
            const ltf = chainWindows('ltf',testDay,testDay+dayMs);
            const q4Windows = ltf.filter(item=>item.chains[0].q===4);
            const ltfCheck = q4Windows.length===4 && [6,12,18,24].every((hour,i)=>{
              const end=testDay+hour*3600000, start=end-337500, item=q4Windows[i];
              return item.start===start && item.end===end && item.highProbability &&
                valuesAtPseudo(start).slice(6).every(v=>v.q===4) &&
                valuesAtPseudo(end-1).slice(6).every(v=>v.q===4) &&
                valuesAtPseudo(start-1)[8].q===3 && valuesAtPseudo(end)[8].q===1;
            }) && ltf.filter(item=>item.chains[0].q===2).every(item=>!item.highProbability) &&
              chainWindows('ltf',Date.UTC(2022,7,29),Date.UTC(2022,7,30)).every(item=>!item.highProbability) &&
              ltfRange(q4Windows[0])==='05:54:22,5–06:00:00 ET';
            const fixture=q4Windows[0];
            const panelCheck=windowHtml(fixture,'ltf',fixture.start,true).includes('High probability') &&
              windowHtml(fixture,'ltf',fixture.end,true).includes('minęło');
            const nyStart=Date.UTC(2026,8,25,6),nyValues=valuesAtPseudo(nyStart);
            const nyChain=windowTimelines.ltf.find(item=>item.start===nyStart);
            const nyCell=grid.querySelectorAll('.row')[6].children[Math.floor((nyStart-windowStart)/(dayMs/16))];
            const nyAmExclusionCheck=probabilityFor('90MIN',1,nyValues)===null &&
              probabilityFor('90MIN',1,valuesAtPseudo(nyStart+90*60000-1))===null &&
              !!probabilityFor('90MIN',3,valuesAtPseudo(Date.UTC(2026,8,25,9))) &&
              !!probabilityFor('90MIN',1,valuesAtPseudo(Date.UTC(2026,8,25,0))) &&
              !!probabilityFor('90MIN',1,valuesAtPseudo(Date.UTC(2026,8,25,12))) &&
              nyChain && !nyChain.highProbability &&
              !windowHtml(nyChain,'ltf',nyStart,true).includes('High probability') &&
              ltfTip((nyStart-windowStart)/(horizonDays*dayMs))==='' &&
              !nyCell.classList.contains('probability-match') &&
              sessionsForDay('2026-09-25')[2].targets.join(',')==='3';
            const nanoRect=document.querySelector('.row.nano').getBoundingClientRect();
            const dateRect=document.getElementById('datebar').getBoundingClientRect();
            const layoutCheck=nanoRect.bottom<=dateRect.top &&
              !!document.querySelector('.ltf-probability-window[data-quarter="4"]') &&
              !!document.querySelector('.row.micro .q4.probability-match') &&
              !!document.querySelector('.row.nano .q4.probability-match');
            const sessionFixtures=sessionsForDay('2026-09-24');
            const expectedTimes=[['18:00:00','23:54:22,5'],['00:00:00','03:56:15'],['09:56:15'],['12:00:00','17:54:22,5']];
            const sessionCheck=sessionFixtures.every((session,i)=>session.windows.length===expectedTimes[i].length &&
              session.windows.every((item,j)=>preciseTime(item.start)===expectedTimes[i][j] &&
                item.start>=session.start && item.end<=session.end && item.end-item.start===337500 &&
                item.chains[0].q===(i===2?3:j===0?1:([0,3].includes(i)?4:3)))) &&
              sessionFixtures[0].start===Date.UTC(2026,8,23,18) &&
              !sessionFixtures[1].windows.some(item=>item.chains[0].q===4) &&
              ['2026-09-26','2022-08-29'].every(date=>sessionsForDay(date).every(session=>!session.windows.length)) &&
              sessionsForDay('2026-09-25').reduce((n,session)=>n+session.windows.length,0)===7 &&
              tradingDateKey(Date.UTC(2026,8,24,18))==='2026-09-25' &&
              sessionCardHtml(sessionFixtures[1],sessionFixtures[1].windows[0].start).includes('Trwa') &&
              !sessionCardHtml(sessionFixtures[1],sessionFixtures[1].windows[0].end).includes('Trwa');
            const originalDate=sessionDateInput.value;
            sessionDateInput.value=sessionDateInput.min;
            sessionDateInput.dispatchEvent(new Event('change'));
            document.getElementById('session-next').click();
            const navigationCheck=sessionDateInput.value===dateKey(Date.parse(sessionDateInput.min+'T00:00:00Z')+dayMs);
            document.getElementById('session-today').click();
            const sessionDomCheck=navigationCheck && sessionDateInput.value===originalDate &&
              document.querySelectorAll('#session-panel .session-card').length===4 &&
              document.getElementById('session-panel').nextElementSibling.id==='history-panel' &&
              document.getElementById('session-title').textContent==='High Probability Okna w Sesji' &&
              !document.querySelector('#session-panel header p, #session-panel .session-note') &&
              !document.querySelector('#session-panel .session-targets').textContent.includes('Low lub High') &&
              document.querySelectorAll('#session-panel .add-calendar').length===document.querySelectorAll('#session-panel .session-window').length;
            const sessionDomDetails={navigationCheck,date:sessionDateInput.value,originalDate,
              cards:document.querySelectorAll('#session-panel .session-card').length,
              title:document.getElementById('session-title').textContent,
              headerP:!!document.querySelector('#session-panel header p, #session-panel .session-note'),
              target:document.querySelector('#session-panel .session-targets').textContent,
              buttons:document.querySelectorAll('#session-panel .add-calendar').length,windows:document.querySelectorAll('#session-panel .session-window').length};
            const dayCheck=['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25'].every((date,i)=>{
              const day=dayForDate(date),expected=[1,2].includes(i)?3:4;
              return day.windows.length===2 && day.windows[0].chains[0].q===1 &&
                day.windows[1].chains[0].q===expected &&
                preciseTime(day.windows[0].start)==='18:00:00' &&
                preciseTime(day.windows[1].start)===(expected===3?'09:45:00':'17:37:30') &&
                day.windows.every(item=>item.end-item.start===1350000 &&
                  valuesAtPseudo(item.start).slice(5,8).every(value=>value.q===item.chains[0].q) &&
                  valuesAtPseudo(item.end-1).slice(5,8).every(value=>value.q===item.chains[0].q) &&
                  valuesAtPseudo(item.end)[7].q!==item.chains[0].q);
            }) && ['2026-09-26','2026-09-27','2022-08-29'].every(date=>dayForDate(date).windows.length===0);
            document.querySelector('[data-probability-scope="day"]').click();
            const dayDomCheck=sessionDateInput.value===originalDate &&
              document.getElementById('session-title').textContent==='High Probability Low / High Dnia' &&
              document.querySelectorAll('#session-panel .session-card').length===1 &&
              document.querySelector('[data-probability-scope="day"]').getAttribute('aria-pressed')==='true' &&
              document.querySelector('#session-panel .session-chain').textContent.includes('DAILY') &&
              !document.querySelector('#session-panel .session-chain').textContent.includes('NANO') &&
              document.querySelectorAll('.add-calendar[data-scope="day"]').length===2;
            document.querySelector('[data-probability-scope="session"]').click();
            const restoredSessionCheck=document.querySelectorAll('#session-panel .session-card').length===4 && sessionDateInput.value===originalDate;
            const pastCount=(date,scope,now)=>pastWindowsForDay(date,scope,now).reduce((n,card)=>n+card.windows.length,0);
            const londonEnd=Date.UTC(2026,8,24,0,5,37,500);
            const dayFirstEnd=Date.UTC(2026,8,23,18,22,30);
            const historyCheck=pastCount('2026-09-24','session',londonEnd-1)===2 &&
              pastCount('2026-09-24','session',londonEnd)===3 &&
              pastCount('2026-09-24','day',dayFirstEnd-1)===0 &&
              pastCount('2026-09-24','day',dayFirstEnd)===1 &&
              pastCount('2026-09-24','session',Date.UTC(2026,8,25))===7 &&
              pastCount('2026-09-24','day',Date.UTC(2026,8,25))===2 &&
              pastCount('2026-09-25','session',Date.UTC(2026,8,24,12))===0 &&
              pastCount('2022-08-29','day',Date.UTC(2026,8,25))===0 &&
              sessionsForDay('2026-09-24').reduce((n,card)=>n+card.windows.length,0)===7;
            historyDateInput.value=historyDateInput.min;
            historyDateInput.dispatchEvent(new Event('change'));
            const historyDateCheck=historyDateInput.value===historyDateInput.min && sessionDateInput.value===originalDate;
            document.querySelector('[data-history-scope="day"]').click();
            const historyDayCheck=document.querySelectorAll('#history-panel .session-card').length===1 &&
              !document.querySelector('#history-panel .add-calendar') && probabilityScope==='session' &&
              document.querySelector('[data-history-scope="day"]').getAttribute('aria-pressed')==='true';
            document.querySelector('[data-history-scope="session"]').click();
            document.getElementById('history-today').click();
            const historyDomCheck=historyDateCheck && historyDayCheck &&
              document.querySelectorAll('#history-panel .session-card').length===4 &&
              !document.querySelector('#history-panel .add-calendar') &&
              [...document.querySelectorAll('#history-panel .session-status')].every(status=>status.textContent==='Minęło') &&
              document.getElementById('history-next').disabled &&
              document.getElementById('timeline-page').firstElementChild.id==='ssmt-panel' &&
              document.getElementById('timeline-page').lastElementChild.id==='history-panel';
            const monthlyCheckbox=document.querySelector('[aria-controls="ssmt-monthly"]');
            monthlyCheckbox.click();
            const homeCalendarRemoved=!document.querySelector('#timeline-page .economic') && document.getElementById('events-page').hidden;
            document.getElementById('nav-events').click();
            document.getElementById('eventsWeek').click();
            const eventsViewCheck=location.hash==='#events' && document.getElementById('timeline-page').hidden &&
              !document.getElementById('events-page').hidden &&
              document.getElementById('nav-events').getAttribute('aria-current')==='page' &&
              document.getElementById('economic-events').rows.length===28 &&
              document.getElementById('eventsWeek').getAttribute('aria-pressed')==='true';
            document.getElementById('nav-timeline').click();
            const routingCheck=homeCalendarRemoved && eventsViewCheck && location.hash==='#timeline' &&
              !document.getElementById('timeline-page').hidden && document.getElementById('events-page').hidden &&
              document.getElementById('nav-timeline').getAttribute('aria-current')==='page' &&
              monthlyCheckbox.checked && !document.getElementById('ssmt-monthly').hidden &&
              sessionDateInput.value===originalDate;
            monthlyCheckbox.click();
            document.querySelectorAll('.chain-filters button[data-scope="ltf"]').forEach(button=>button.click());
            setHours(6);
            requestAnimationFrame(()=>{
              const focus=windowTimelines.ltf.find(item=>item.highProbability&&item.chains[0].q===4&&item.start>windowStart+dayMs);
              if(focus)timeline.scrollLeft=((focus.start-windowStart)/(horizonDays*dayMs))*grid.scrollWidth-timeline.clientWidth*.75;
              document.getElementById('history-panel').scrollIntoView({block:'end'});
            });
            return JSON.stringify({rows:document.querySelectorAll('#grid .row').length,
              cells:document.querySelectorAll('#grid .cell').length,
              clock:document.getElementById('clock').textContent,
              calendar:document.getElementById('economic-status').textContent,
              ruleChecks,fullWeekCheck,ltfCheck,panelCheck,nyAmExclusionCheck,layoutCheck,sessionCheck,sessionDomCheck,sessionDomDetails,dayCheck,dayDomCheck,restoredSessionCheck,historyCheck,historyDomCheck,routingCheck,
              ok:document.querySelectorAll('#grid .row').length===9 &&
                 ruleChecks && fullWeekCheck && ltfCheck && panelCheck && nyAmExclusionCheck && layoutCheck && sessionCheck && sessionDomCheck && dayCheck && dayDomCheck && restoredSessionCheck && historyCheck && historyDomCheck && routingCheck &&
                 document.getElementById('clock').textContent.length>5 &&
                 document.getElementById('economic-status').textContent.includes('Kopia eksportu')});
            })()
            """) { result, error in
                guard error == nil, let output = result as? String else { print("FAIL", error as Any); exit(1) }
                print(output)
                guard output.contains("\"ok\":true") else { exit(1) }
                webView.callAsyncJavaScript("""
                    const sessionOK=await addSessionCalendar(document.querySelector('#session-panel .add-calendar'));
                    document.querySelector('[data-probability-scope="day"]').click();
                    const dayOK=await addSessionCalendar(document.querySelector('#session-panel .add-calendar'));
                    document.getElementById('nav-timeline').click();
                    return sessionOK && dayOK;
                    """,
                    arguments: [:], in: nil, in: .page) { result in
                    guard case .success(let value) = result, value as? Bool == true,
                          let file = self.calendarExport.lastExport,
                          let contents = try? String(contentsOf: file, encoding: .utf8),
                          contents.contains("BEGIN:VEVENT\r\n"), contents.contains("DTSTART:"),
                          contents.contains("DTEND:"), contents.contains("SUMMARY:High Probability"),
                          contents.contains("DESCRIPTION:DAILY"), file.lastPathComponent.hasPrefix("uncsway-day-") else {
                        print("FAIL native calendar export", result); exit(1)
                    }
                    print("PASS session and day calendar exports: buttons, bridge and ICS file (no calendar entry created)")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { webView.takeSnapshot(with: nil) { image, _ in
                    if let image, let tiff = image.tiffRepresentation,
                       let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                        try? png.write(to: URL(fileURLWithPath: "/tmp/qs-macos-preview.png"))
                    }
                    exit(0)
                } }
                }
            }
        }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
