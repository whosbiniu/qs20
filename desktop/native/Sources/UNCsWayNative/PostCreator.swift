import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct PostLayer: Codable, Identifiable {
  var id = UUID(), name = "Obraz", data: Data, x = 0.5, y = 0.5, width = 0.65, height = 0.65,
    opacity = 1.0
}
struct PostProject: Codable {
  var version = 1, mode = "Aura", ticker = "NQ1!", timeframe = "H1", name = "biniu.B3",
    handle = "@biniub3"
  var ticks = "663", rr = "8.3", date = Date(), format = "3:4", white = true, showProfile = true,
    showResult = true, showDate = true, showBadge = true
  var photo: Data?, avatar: Data?, layers: [PostLayer] = [], zoom = 1.0, dim = 0.0, margin = 0.035
  var width: Double { mode == "Wykresy" && format == "Poziomy" ? 4096 : 2160 }
  var height: Double {
    switch format {
    case "1:1": return 2160
    case "4:5": return 2700
    case "9:16": return 3840
    case "Poziomy": return 2840
    default: return 2880
    }
  }
}
@MainActor final class PostStore: ObservableObject {
  @Published var project = Disk.load("post-project.json", as: PostProject.self) ?? PostProject()
  @Published var selected: UUID?
  @Published var status = "Wybierz zdjęcie albo dodaj wykres."
  func saveLocal() { Disk.save(project, "post-project.json") }
  func image(target: String) {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.image]
    panel.allowsMultipleSelection = target == "layer"
    guard panel.runModal() == .OK else { return }
    for url in panel.urls {
      guard let data = try? Data(contentsOf: url), NSImage(data: data) != nil else {
        status = "Nie można odczytać obrazu."
        continue
      }
      if target == "avatar" {
        project.avatar = data
      } else if target == "photo" {
        project.photo = data
      } else {
        let layer = PostLayer(name: url.lastPathComponent, data: data)
        project.layers.append(layer)
        selected = layer.id
      }
    }
    saveLocal()
  }
  func open() {
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.json, UTType(filenameExtension: "postcreator") ?? .data]
    guard panel.runModal() == .OK, let url = panel.url else { return }
    do {
      project = try PostProject.read(Data(contentsOf: url))
      selected = nil
      saveLocal()
      status = "Wczytano projekt."
    } catch { status = "Nie można wczytać projektu: \(error.localizedDescription)" }
  }
  func save() {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = "PostCreator.native.json"
    if panel.runModal() == .OK, let url = panel.url {
      do {
        try JSONEncoder().encode(project).write(to: url, options: .atomic)
        status = "Zapisano projekt."
      } catch { status = error.localizedDescription }
    }
  }
  func export(copy: Bool = false) {
    let renderer = ImageRenderer(
      content: PostArtwork(project: project).frame(width: project.width, height: project.height))
    renderer.scale = 1
    guard let image = renderer.nsImage, let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
    else {
      status = "Nie udało się wyrenderować grafiki."
      return
    }
    if copy {
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setData(png, forType: .png)
      status = "Skopiowano PNG."
      return
    }
    let panel = NSSavePanel()
    panel.allowedContentTypes = [.png]
    panel.nameFieldStringValue = "UNCsWay-\(project.ticker).png"
    if panel.runModal() == .OK, let url = panel.url {
      do {
        try png.write(to: url, options: .atomic)
        status = "Wyeksportowano \(Int(project.width)) × \(Int(project.height)) PNG."
      } catch { status = error.localizedDescription }
    }
  }
}
struct PostArtwork: View {
  var project: PostProject
  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      let s = w / 416
      let color: Color = project.white ? .white : .black
      ZStack(alignment: .topLeading) {
        (project.mode == "Aura" ? Color(red: 0.12, green: 0.13, blue: 0.17) : Color.white)
        if let data = project.photo, let image = NSImage(data: data) {
          Image(nsImage: image).resizable().scaledToFill().frame(width: w, height: h).scaleEffect(
            project.zoom
          ).clipped()
        }
        if project.mode == "Aura" {
          Color.black.opacity(project.dim)
          if project.showProfile {
            VStack(alignment: .leading, spacing: 8 * s) {
              if let data = project.avatar, let image = NSImage(data: data) {
                Image(nsImage: image).resizable().scaledToFill().frame(
                  width: 60 * s, height: 60 * s
                ).clipShape(Circle())
              }
              Text(project.name).font(.system(size: 14 * s, weight: .bold))
              Text(project.handle).font(.system(size: 12 * s))
            }.foregroundStyle(color).padding(.leading, 14 * s).padding(.top, 28 * s)
          }
          VStack {
            Spacer()
            HStack(alignment: .center) {
              if project.showResult {
                VStack(alignment: .leading, spacing: 6 * s) {
                  Text(signed(project.rr) + "R")
                  Text(signed(project.ticks) + " Ticks")
                }.font(.system(size: 21 * s, weight: .bold))
              }
              Spacer()
              VStack(spacing: 6 * s) {
                Text(project.ticker).font(.system(size: 24 * s, weight: .bold))
                if project.showDate {
                  Text(project.date.formatted(.dateTime.day().month().year())).font(
                    .system(size: 15 * s))
                }
              }
              if project.showBadge {
                Spacer()
                Text(String(project.ticker.prefix(2))).font(.system(size: 20 * s, weight: .bold))
                  .frame(width: 53 * s, height: 53 * s).background(
                    color.opacity(0.15), in: Circle())
              }
            }.foregroundStyle(color).padding(.horizontal, 10 * s).padding(
              .bottom, h * project.margin)
          }
        } else {
          ForEach(project.layers) { layer in
            if let image = NSImage(data: layer.data) {
              Image(nsImage: image).resizable().scaledToFit().frame(
                width: w * layer.width, height: h * layer.height
              ).opacity(layer.opacity).position(x: w * layer.x, y: h * layer.y)
            }
          }
          if project.showProfile {
            VStack(spacing: 5 * s) {
              if let data = project.avatar, let image = NSImage(data: data) {
                Image(nsImage: image).resizable().scaledToFill().frame(
                  width: 26 * s, height: 26 * s
                ).clipShape(Circle())
              }
              Text(project.name).font(.system(size: 8 * s, weight: .bold))
              Text(project.handle).font(.system(size: 6 * s)).foregroundStyle(.gray)
            }.foregroundStyle(.black).frame(width: w).padding(.top, 9 * s)
          }
          if project.showBadge {
            VStack(alignment: .leading, spacing: 5 * s) {
              Text(project.ticker).font(.system(size: 16 * s, weight: .bold))
              Text(project.timeframe).font(.system(size: 12 * s)).foregroundStyle(.blue)
            }.foregroundStyle(.black).position(x: w * 0.14, y: h * 0.48)
          }
        }
      }.frame(width: w, height: h).clipped()
    }
  }
  func signed(_ s: String) -> String {
    s.hasPrefix("+") || s.hasPrefix("-") || s.isEmpty ? s : "+" + s
  }
}
struct PostCreatorScreen: View {
  @StateObject var store = PostStore()
  @ViewState<CGPoint?> var dragOrigin: CGPoint?
  var body: some View {
    HSplitView {
      ScrollView {
        Form {
          Picker("Tryb", selection: $store.project.mode) {
            Text("Aura").tag("Aura")
            Text("Wykresy").tag("Wykresy")
          }.pickerStyle(.segmented)
          TextField("Ticker", text: $store.project.ticker)
          TextField("Interwał", text: $store.project.timeframe)
          Picker("Format", selection: $store.project.format) {
            ForEach(["3:4", "4:5", "9:16", "1:1", "Poziomy"], id: \.self) { Text($0) }
          }
          Section("Profil") {
            TextField("Nazwa", text: $store.project.name)
            TextField("Handle", text: $store.project.handle)
            Button("Wybierz avatar") { store.image(target: "avatar") }
            Toggle("Pokaż profil", isOn: $store.project.showProfile)
            Toggle("Pokaż etykietę", isOn: $store.project.showBadge)
          }
          if store.project.mode == "Aura" { auraControls } else { layerControls }
        }.formStyle(.grouped)
      }.frame(minWidth: 270, idealWidth: 300, maxWidth: 350)
      VStack(spacing: 10) {
        HStack {
          Button("Otwórz projekt") { store.open() }
          Button("Zapisz projekt") { store.save() }
          Spacer()
          Button("Kopiuj PNG") { store.export(copy: true) }
          Button("Eksportuj PNG") { store.export() }.buttonStyle(.borderedProminent)
        }.padding(.horizontal)
        GeometryReader { geo in
          let available = CGSize(
            width: max(1, geo.size.width - 30), height: max(1, geo.size.height - 30))
          let ratio = store.project.width / store.project.height
          let width = min(available.width, available.height * ratio)
          let height = width / ratio
          ZStack {
            PostArtwork(project: store.project).frame(width: width, height: height)
            if store.project.mode == "Wykresy" {
              ForEach(store.project.layers) { layer in
                Rectangle().fill(.clear).contentShape(Rectangle()).overlay {
                  if store.selected == layer.id { Rectangle().stroke(.blue, lineWidth: 2) }
                }.frame(width: width * layer.width, height: height * layer.height).position(
                  x: width * layer.x, y: height * layer.y
                ).onTapGesture { store.selected = layer.id }.gesture(
                  DragGesture().onChanged { g in
                    guard let i = store.project.layers.firstIndex(where: { $0.id == layer.id })
                    else { return }
                    store.selected = layer.id
                    if dragOrigin == nil {
                      dragOrigin = CGPoint(
                        x: store.project.layers[i].x, y: store.project.layers[i].y)
                    }
                    store.project.layers[i].x = max(
                      0, min(1, dragOrigin!.x + g.translation.width / width))
                    store.project.layers[i].y = max(
                      0, min(1, dragOrigin!.y + g.translation.height / height))
                  }.onEnded { _ in
                    dragOrigin = nil
                    store.saveLocal()
                  })
              }
            }
          }.frame(width: width, height: height).shadow(radius: 10).position(
            x: geo.size.width / 2, y: geo.size.height / 2)
        }
        Text(store.status).font(.caption).foregroundStyle(.secondary).padding(.bottom, 8)
      }.padding(.top).frame(minWidth: 450)
    }.onDisappear { store.saveLocal() }.onReceive(
      store.$project.debounce(for: .milliseconds(600), scheduler: RunLoop.main)
    ) { _ in
      store.saveLocal()
    }
  }
  var auraControls: some View {
    Section("Aura") {
      TextField("Ticki", text: $store.project.ticks)
      TextField("Wynik w R", text: $store.project.rr)
      DatePicker("Data", selection: $store.project.date, displayedComponents: .date)
      Picker("Kolor napisów", selection: $store.project.white) {
        Text("Biały").tag(true)
        Text("Czarny").tag(false)
      }
      Button("Dodaj zdjęcie") { store.image(target: "photo") }
      Slider(value: $store.project.zoom, in: 1...4) { Text("Powiększenie") }
      Slider(value: $store.project.dim, in: 0...1) { Text("Przyciemnienie") }
      Slider(value: $store.project.margin, in: 0...0.25) { Text("Odstęp od dołu") }
      Toggle("Wynik", isOn: $store.project.showResult)
      Toggle("Data", isOn: $store.project.showDate)
    }
  }
  var layerControls: some View {
    Section("Warstwy") {
      Button("Dodaj wykres / obraz") { store.image(target: "layer") }
      Button("Podkład") { store.image(target: "photo") }
      ForEach(store.project.layers) { layer in
        Button {
          store.selected = layer.id
        } label: {
          HStack {
            Image(systemName: store.selected == layer.id ? "checkmark.circle.fill" : "photo")
            Text(layer.name).lineLimit(1)
          }
        }
      }
      if let index = store.project.layers.firstIndex(where: { $0.id == store.selected }) {
        Slider(value: $store.project.layers[index].width, in: 0.05...1) { Text("Szerokość") }
        Slider(value: $store.project.layers[index].height, in: 0.05...1) { Text("Wysokość") }
        Slider(value: $store.project.layers[index].opacity, in: 0...1) { Text("Krycie") }
        HStack {
          Button("Wyżej") {
            if index + 1 < store.project.layers.count {
              store.project.layers.swapAt(index, index + 1)
            }
          }
          Button("Niżej") { if index > 0 { store.project.layers.swapAt(index, index - 1) } }
          Button("Usuń") {
            store.project.layers.remove(at: index)
            store.selected = nil
          }
        }
      }
    }
  }
}
