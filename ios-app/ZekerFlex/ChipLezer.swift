import CoreNFC
import NFCPassportReader
import UIKit
import WebKit

/// De chip van een paspoort of ID-kaart lezen, net als ChipActivity in de Android-app:
///   1. de ID-scan (components/app/IdScan.tsx) stuurt { code } via window.webkit.messageHandlers.zfChip;
///   2. met die eenmalige code de sleutel ophalen (POST /api/chip/sleutel): documentnummer,
///      geboortedatum en vervaldatum (yymmdd) en de gemaskeerde naam van het account;
///   3. eerst vragen "Ben jij dit?" (tegen een doorgestuurde code), dan de chip lezen (BAC/PACE);
///   4. alleen DG1 en het SOD terug naar de server (POST /api/chip/klaar), die de passieve
///      authenticatie doet (lib/kyc/chip). Nooit de pasfoto (DG2), nooit iets bewaren of loggen.
@MainActor
final class ChipLezer: NSObject, WKScriptMessageHandler {
    private weak var vc: WebViewController?
    private var bezig = false
    private let lezer = PassportReader()

    init(vc: WebViewController) {
        self.vc = vc
    }

    private struct Sleutel: Decodable {
        let documentnummer: String
        let geboortedatum: String
        let vervaldatum: String
        let naam: String?
    }

    private struct Uitslag: Decodable {
        let echt: Bool?
    }

    private enum ChipFout: Error {
        case code, net, sleutel, lezen
        var tekst: String {
            switch self {
            case .code: return ZekerFlex.tekst("chip_fout_code")
            case .net: return ZekerFlex.tekst("chip_fout_net")
            case .sleutel: return ZekerFlex.tekst("chip_fout_sleutel")
            case .lezen: return ZekerFlex.tekst("chip_fout_lezen")
            }
        }
    }

    // MARK: - van de pagina

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // alleen van zekerflex.com zelf, uit het hoofdvenster
        let h = message.frameInfo.securityOrigin.host.lowercased()
        guard message.frameInfo.isMainFrame, h == WebViewController.host || h == "www.\(WebViewController.host)" else { return }
        guard let body = message.body as? [String: Any], let code = body["code"] as? String,
              !code.isEmpty, code.count < 200 else { return }
        start(code)
    }

    private func start(_ code: String) {
        guard !bezig else { return }
        guard NFCTagReaderSession.readingAvailable else {
            meld(ZekerFlex.tekst("chip_geen_nfc"))
            return
        }
        bezig = true
        Task { @MainActor in
            defer { self.bezig = false }
            do {
                let s = try await self.haalSleutel(code)
                guard await self.bevestig(naam: s.naam ?? "?") else { return }
                let sleutel = Self.mrzSleutel(nummer: s.documentnummer, geboren: s.geboortedatum, verval: s.vervaldatum)
                let paspoort = try await self.lezer.readPassport(
                    mrzKey: sleutel,
                    tags: [.COM, .DG1, .SOD],
                    customDisplayMessage: { bericht in Self.bericht(bericht) }
                )
                guard let dg1 = paspoort.dataGroupsRead[.DG1]?.data, let sod = paspoort.dataGroupsRead[.SOD]?.data,
                      !dg1.isEmpty, !sod.isEmpty else { throw ChipFout.lezen }
                let echt = try await self.stuurIn(code: code, dg1: Data(dg1), sod: Data(sod))
                self.meld(ZekerFlex.tekst(echt ? "chip_klaar_echt" : "chip_klaar_anders"))
            } catch let fout as ChipFout {
                self.meld(fout.tekst)
            } catch {
                // zelf gestopt: niets melden. Verkeerde sleutel: de MRZ opnieuw scannen.
                let omschrijving = String(describing: error)
                if omschrijving.contains("UserCanceled") || omschrijving.contains("userCanceled") { return }
                if omschrijving.contains("InvalidMRZKey") || omschrijving.contains("PACE") {
                    self.meld(ChipFout.sleutel.tekst)
                } else {
                    self.meld(ChipFout.lezen.tekst)
                }
            }
        }
    }

    // MARK: - de server

    private func post<T: Decodable>(_ pad: String, _ inhoud: [String: String], als: T.Type) async throws -> T {
        guard let url = URL(string: "https://\(WebViewController.host)\(pad)") else { throw ChipFout.net }
        var verzoek = URLRequest(url: url)
        verzoek.httpMethod = "POST"
        verzoek.setValue("application/json", forHTTPHeaderField: "Content-Type")
        verzoek.timeoutInterval = 20
        verzoek.httpBody = try JSONSerialization.data(withJSONObject: inhoud)
        let resultaat: (Data, URLResponse)
        do {
            resultaat = try await URLSession.shared.data(for: verzoek)
        } catch {
            throw ChipFout.net
        }
        let (data, antwoord) = resultaat
        let status = (antwoord as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw ChipFout.code }
        guard (200 ..< 300).contains(status) else { throw status == 0 || status >= 500 ? ChipFout.net : ChipFout.lezen }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ChipFout.net
        }
    }

    private func haalSleutel(_ code: String) async throws -> Sleutel {
        try await post("/api/chip/sleutel", ["code": code], als: Sleutel.self)
    }

    private func stuurIn(code: String, dg1: Data, sod: Data) async throws -> Bool {
        let u = try await post(
            "/api/chip/klaar",
            ["code": code, "dg1": dg1.base64EncodedString(), "sod": sod.base64EncodedString()],
            als: Uitslag.self
        )
        return u.echt ?? false
    }

    // MARK: - wat de gebruiker ziet

    /// "Ben jij dit?" met de gemaskeerde naam van het account, vóór er iets van de chip gelezen wordt.
    @MainActor
    private func bevestig(naam: String) async -> Bool {
        guard let vc else { return false }
        return await withCheckedContinuation { klaar in
            let vraag = String(format: ZekerFlex.tekst("chip_bevestig_vraag"), naam)
            let a = UIAlertController(title: ZekerFlex.tekst("chip_titel"), message: vraag, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: ZekerFlex.tekst("chip_bevestig_nee"), style: .cancel) { _ in klaar.resume(returning: false) })
            a.addAction(UIAlertAction(title: ZekerFlex.tekst("chip_bevestig_ja"), style: .default) { _ in klaar.resume(returning: true) })
            vc.toon(a)
        }
    }

    @MainActor
    private func meld(_ bericht: String) {
        guard let vc else { return }
        let a = UIAlertController(title: ZekerFlex.tekst("chip_titel"), message: bericht, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: ZekerFlex.tekst("ok"), style: .default))
        vc.toon(a)
    }

    /// De tekst in het NFC-venster van iOS, in de taal van de telefoon (nooit de Engelse standaard).
    nonisolated private static func bericht(_ m: NFCViewDisplayMessage) -> String? {
        switch m {
        case .requestPresentPassport:
            return ZekerFlex.tekst("chip_uitleg")
        case .successfulRead:
            return ZekerFlex.tekst("chip_controleren")
        default:
            return ZekerFlex.tekst("chip_lezen")
        }
    }

    // MARK: - de sleutel voor de chip (MRZ-gegevens met hun controlecijfers, ICAO 9303)

    nonisolated static func mrzSleutel(nummer: String, geboren: String, verval: String) -> String {
        var n = nummer.uppercased()
        while n.count < 9 { n += "<" }
        return n + controleCijfer(n) + geboren + controleCijfer(geboren) + verval + controleCijfer(verval)
    }

    nonisolated static func controleCijfer(_ s: String) -> String {
        let gewicht = [7, 3, 1]
        var som = 0
        for (i, teken) in s.enumerated() {
            let waarde: Int
            if let cijfer = teken.wholeNumberValue, teken.isASCII {
                waarde = cijfer
            } else if let ascii = teken.asciiValue, ascii >= 65, ascii <= 90 {
                waarde = Int(ascii) - 55
            } else {
                waarde = 0 // "<"
            }
            som += waarde * gewicht[i % 3]
        }
        return String(som % 10)
    }
}
