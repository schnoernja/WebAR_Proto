const DEFAULT_CARD_VISIBILITY = Object.freeze({
  welcome: true,
  placement: true,
  coord: false,
  state: false,
  note: false,
  geo: true,
  offset: true,
  debug: false,
  help: true,
  survey: false,
  settings: false
});

const DEFAULT_CARD_COLLAPSED = Object.freeze({
  welcome: false,
  placement: false,
  coord: true,
  state: true,
  note: true,
  geo: true,
  offset: true,
  debug: true,
  help: false,
  survey: false,
  settings: false
});

const SUPPORTED_LANGUAGES = new Set(["de", "en"]);

const ACTION_MENU_TABS = Object.freeze({
  help: "help",
  survey: "survey",
  settings: "settings"
});

const UI_MODE = Object.freeze({
  DEVELOPER: "developer",
  USER: "user"
});
const UI_MODE_STORAGE_KEY = "epartwin-ui-mode";
const USER_MODE_VISIBLE_CARDS = Object.freeze(["placement"]);
const USER_MODE_ALLOWED_ACTION_TABS = Object.freeze([]);

const MAX_GEO_OFFSET_METERS = 20;
const MIN_GEO_SCALE_FACTOR = 1;
const MAX_GEO_SCALE_FACTOR = 3;

const EXACT_RUNTIME_TRANSLATIONS_EN = Object.freeze({
  "tree.glb konnte nicht geladen werden. Platzhalter aktiv.": "Could not load tree.glb. Placeholder active.",
  "Fallback-3D-Ansicht aktiv. Im freien Modus platzierst du per Reticle, im Geo-Modus per Latitude/Longitude.":
    "Fallback 3D view active. In free mode you place via the reticle, in coordinate mode via latitude/longitude.",
  "Fallback-3D-Ansicht aktiv. Im freien Modus platzierst du per Reticle, im Geo-Local-Modus per Latitude/Longitude.":
    "Fallback 3D view active. In free mode you place via the reticle, in Geo-Local mode via latitude/longitude.",
  "Geo (WebXR) ist vorausgewaehlt. Starte den Modus, um WebXR mit Standort und IMU/Kompass zu nutzen.":
    "Geo (WebXR) is preselected. Start the mode to use WebXR with location and IMU/compass.",
  "Geo-Modus ist ohne Site-QR-Konfiguration nicht verfuegbar.":
    "Geo mode is not available without a site QR configuration.",
  "Starte Geo-Modus...": "Starting geo mode...",
  "Starte immersive AR...": "Starting immersive AR...",
  "Fallback-3D-Ansicht bleibt aktiv.": "Fallback 3D view remains active.",
  "Geo-Modus benoetigt GPS sowie Kompass-/IMU-Zugriff.":
    "Geo mode requires GPS plus compass/IMU access.",
  "Geo-Modus beendet. Fallback-3D-Ansicht aktiv.": "Geo mode ended. Fallback 3D view active.",
  "Fallback-3D-Ansicht aktiv. Geo-Modus kann jederzeit erneut gestartet werden.":
    "Fallback 3D view active. Geo mode can be started again at any time.",
  "Geo-Global-Modus nutzt den Geo-WebXR-Flow. Waehle 'Geo (WebXR)' und starte diesen Modus.":
    "Geo-Global mode uses the Geo WebXR flow. Select 'Geo (WebXR)' and start that mode.",
  "Moduswechsel ist nur moeglich, wenn kein AR- oder Geo-Modus laeuft.":
    "You can only switch modes when neither AR nor Geo mode is running.",
  "Geo (WebXR) ist ohne Site-QR-Konfiguration nicht verfuegbar.":
    "Geo (WebXR) is not available without a site QR configuration.",
  "Geo (WebXR) ausgewaehlt. Beim Start werden WebXR, Standort und IMU/Kompass gemeinsam aktiviert.":
    "Geo (WebXR) selected. On start, WebXR, location, and IMU/compass are activated together.",
  "Keine Site geladen. Geo-Modus benoetigt einen QR-Link mit ?site=...":
    "No site loaded. Geo mode needs a QR link with ?site=...",
  "Geo-Daten sind aktuell nicht verfuegbar.": "Geo data is currently unavailable.",
  "Geo-Modus aktiv. Szene und Marker folgen jetzt stabil deiner ENU-Position.":
    "Geo mode active. Scene and markers now follow your ENU position stably.",
  "Dieser Fallback-Geo-Modus nutzt kein hit-test-basiertes Placement.":
    "This fallback geo mode does not use hit-test-based placement.",
  "Koordinaten-Modus aktiv. Warte auf Geraetestandort und stabile Flaeche.":
    "Coordinate mode active. Waiting for device location and a stable surface.",
  "Bewege das Geraet langsam ueber Boden oder Tisch, bis eine stabile Referenzflaeche erkannt wird.":
    "Move the device slowly over the floor or table until a stable reference surface is detected.",
  "Platzierungsmodus konnte nicht gewechselt werden.": "Could not switch placement mode.",
  "Mode gewechselt. Bestehendes Placement bleibt bis zum Reset unveraendert.":
    "Mode changed. The current placement remains unchanged until reset.",
  "Koordinaten-Modus aktiv. Bei stabiler Flaeche wird das Objekt relativ zur Geo-Position gesetzt.":
    "Coordinate mode active. The object is placed relative to the geo position once a stable surface is available.",
  "Freie Platzierung aktiv. Sobald das Reticle stabil ist, kannst du das Objekt setzen.":
    "Free placement active. Once the reticle is stable you can place the object.",
  "Geo-Koordinaten konnten nicht uebernommen werden.": "Could not apply geo coordinates.",
  "Aktuelles Placement bleibt fixiert. Neue Geo-Koordinaten greifen nach Reset.":
    "The current placement stays fixed. New geo coordinates take effect after reset.",
  "Neue Geo-Koordinaten gespeichert. Bei stabiler Flaeche wird die Position erneut geprueft.":
    "New geo coordinates saved. The position will be checked again once a stable surface is available.",
  "Geo-Koordinaten gespeichert. Sie werden verwendet, sobald du in den Koordinaten-Modus wechselst.":
    "Geo coordinates saved. They are used once you switch to coordinate mode.",
  "Noch keine stabile Flaeche fuer die freie Platzierung.": "No stable surface is available for free placement yet.",
  "Objekt stabil auf der erkannten Flaeche platziert.": "Object placed stably on the detected surface.",
  "Placement-Lock aktiv. Neu platzieren nur per Reset.": "Placement lock active. Repositioning is only possible after reset.",
  "Placement-Lock aktiv. Geo-Platzierung bleibt fixiert, bis du resettest.":
    "Placement lock active. Geo placement remains fixed until you reset.",
  "Objekt liegt hinter dir. Geo-Placement bleibt fixiert, bis du resettest.":
    "The object is behind you. Geo placement remains fixed until you reset.",
  "Geo-Placement fixiert. 'Neu platzieren' berechnet die Zielposition erneut.":
    "Geo placement fixed. 'Reposition' recalculates the target position.",
  "Objekt fixiert. 'Neu platzieren' aktiviert das Reticle erneut.":
    "Object fixed. 'Reposition' activates the reticle again.",
  "Tracking pausiert. Halte das Geraet ruhig, bis WebXR wieder Viewer-Pose liefert.":
    "Tracking paused. Keep the device still until WebXR provides a viewer pose again.",
  "Reticle stabil. Tippen oder 'Objekt setzen' druecken.": "Reticle stable. Tap or press 'Place object'.",
  "Flaeche erkannt. Kurz ruhig halten, damit die Mehrframe-Pruefung stabil wird.":
    "Surface detected. Hold still briefly so the multi-frame check can stabilize.",
  "Keine Flaeche erkannt. Geraet ruhig ueber eine ebene Umgebung bewegen.":
    "No surface detected. Move the device steadily over a flat area.",
  "Keine Geraeteposition verfuegbar. Aktiviere zuerst den Standort.":
    "No device position is available. Enable location access first.",
  "Geo-Referenz wird initialisiert. Halte die Blickrichtung kurz stabil.":
    "The geo reference is being initialized. Keep the viewing direction stable for a moment.",
  "Koordinaten-Modus aktiv. Aktiviere zuerst den Standort ueber 'Standort aktivieren'.":
    "Coordinate mode active. Enable location first via 'Enable location'.",
  "Koordinaten-Modus aktiv. Warte auf Geraetestandort, um die Zielposition zu berechnen.":
    "Coordinate mode active. Waiting for the device location to calculate the target position.",
  "Keine Geraeteposition verfuegbar.": "No device position is available.",
  "Flaeche erkannt. Kurz ruhig halten, damit die Bodenhoehe stabil wird.":
    "Surface detected. Hold still briefly so the ground height can stabilize.",
  "Keine stabile Flaeche. Der Koordinaten-Modus benoetigt eine stabile Bodenflaeche.":
    "No stable surface is available. Coordinate mode requires a stable ground surface.",
  "Objekt liegt hinter dir.": "The object is behind you.",
  "Stabile Flaeche erkannt. Geo-Ziel wird relativ zum Startpunkt auf dem Boden gesetzt.":
    "Stable surface detected. The geo target is placed on the ground relative to the start point.",
  "Placement wurde zurueckgesetzt.": "Placement has been reset.",
  "Suche eine neue stabile Flaeche. Das Geo-Ziel wird danach erneut auf dem Boden platziert.":
    "Find a new stable surface. The geo target will then be placed on the ground again.",
  "Freie Platzierung aktiv. Richte das Reticle neu aus und setze das Objekt erneut.":
    "Free placement active. Reposition the reticle and place the object again.",
  "Objekt auf die Fallback-Buehne zurueckgesetzt.": "Object reset to the fallback stage.",
  "Fallback-3D-Ansicht aktiv.": "Fallback 3D view active.",
  "Browser und WebXR-Support werden geprueft.": "Checking browser and WebXR support.",
  "Im Koordinaten-Modus wird das Objekt nur innerhalb von 100 m angezeigt.":
    "In coordinate mode the object is only shown within 100 m.",
  "Bitte gueltige Latitude- und Longitude-Werte eingeben.": "Please enter valid latitude and longitude values.",
  "Koordinaten konnten nicht uebernommen werden.": "Coordinates could not be applied.",
  "Koordinaten uebernommen. Sie greifen bei der naechsten Platzierung.":
    "Coordinates applied. They take effect on the next placement.",
  "Keine Geraetekoordinaten verfuegbar.": "No device coordinates are available.",
  "Aktuelle Geraetekoordinaten uebernommen.": "Current device coordinates applied.",
  "Modell laedt": "Loading model",
  "Fallback-Modell": "Fallback model",
  "Platzhalter": "Placeholder",
  "Immersive AR benoetigt HTTPS oder localhost.": "Immersive AR requires HTTPS or localhost.",
  "Dieser Browser bietet keine WebXR-Schnittstelle.": "This browser does not provide a WebXR interface.",
  "WebXR immersive-ar ist verfuegbar.": "WebXR immersive-ar is available.",
  "Immersive AR wird auf diesem Geraet oder Browser nicht angeboten.":
    "Immersive AR is not available on this device or browser.",
  "AR-Session laeuft bereits.": "AR session is already running.",
  "AR-Session aktiv.": "AR session is active.",
  "AR-Session aktiv. Browser zeigt kein DOM-Overlay an.":
    "AR session is active. The browser does not provide a DOM overlay.",
  "AR beendet. Fallback-3D-Ansicht aktiv.": "AR ended. Fallback 3D view active.",
  "Kompassbezug ist nur moeglich, wenn kein AR- oder Geo-Modus laeuft.":
    "Compass reference can only be changed while no AR or Geo mode is running.",
  "Geo-Local mit Kompassbezug aktiviert.": "Geo-Local compass reference enabled.",
  "X/Z-Offsets werden beim naechsten Geo-Local-Start als Ost/Nord-Meter interpretiert.":
    "On the next Geo-Local start, X/Z offsets will be interpreted as east/north meters.",
  "Geo-Local mit Kompassbezug deaktiviert.": "Geo-Local compass reference disabled.",
  "X/Z-Offsets folgen beim naechsten Geo-Local-Start wieder der lokalen Blickrichtung.":
    "On the next Geo-Local start, X/Z offsets will again follow the local viewing direction.",
  "Kompass-Freigabe verweigert.": "Compass permission denied.",
  "Fuer echten Nord/Ost-Bezug im Geo-Local-Modus muss der Browser Zugriff auf Orientierungssensoren erlauben.":
    "For true east/north placement in Geo-Local mode, the browser must allow orientation sensor access.",
  "Geo-Local mit Kompassbezug aktiv. Halte am QR-Startpunkt kurz still, damit Ursprung und Nordrichtung erfasst werden.":
    "Geo-Local with compass reference is active. Hold still briefly at the QR start point so origin and north can be captured.",
  "Geo-Local aktiv. Mit Kompassbezug werden X/Z-Offsets beim Start als Ost/Nord-Meter interpretiert.":
    "Geo-Local is active. With compass reference, X/Z offsets are interpreted as east/north meters on start.",
  "AR (WebXR) ausgewaehlt. Geo-Local nutzt QR-Offsets mit optionalem Kompassbezug fuer echte Ost/Nord-Platzierung.":
    "AR (WebXR) selected. Geo-Local uses QR offsets with optional compass reference for true east/north placement.",
  "Nordreferenz wird initialisiert. Halte das Geraet kurz ruhig.":
    "North reference is being initialized. Hold the device still briefly.",
  "Geo-Local aktiv. Warte auf Kompass-Heading fuer echten Nord/Ost-Bezug.":
    "Geo-Local is active. Waiting for compass heading for true east/north placement.",
  "Stabile Flaeche erkannt. Offsets werden relativ zum QR-Ursprung als Ost/Nord-Meter gesetzt.":
    "Stable surface detected. Offsets are placed relative to the QR origin as east/north meters.",
  "Suche am QR-Startpunkt eine neue stabile Flaeche; Ursprung und Nordrichtung werden neu gesetzt.":
    "Find a new stable surface at the QR start point; origin and north direction will be captured again."
});

const REGEX_RUNTIME_TRANSLATIONS_EN = Object.freeze([
  {
    pattern: /^WebXR-Pruefung fehlgeschlagen: (.+)$/,
    replace: (_, detail) => `WebXR check failed: ${detail}`
  },
  {
    pattern: /^AR-Start fehlgeschlagen: (.+)$/,
    replace: (_, detail) => `Failed to start AR: ${detail}`
  },
  {
    pattern: /^Hit-Test konnte nicht initialisiert werden: (.+)$/,
    replace: (_, detail) => `Could not initialize hit test: ${detail}`
  },
  {
    pattern: /^Geo-Ziel uebernommen: (.+)\.$/,
    replace: (_, detail) => `Geo target saved: ${detail}.`
  },
  {
    pattern: /^Objekt im Koordinaten-Modus platziert\. Distanz zum Startpunkt: (.+) m\.$/,
    replace: (_, distance) => `Object placed in coordinate mode. Distance from the start point: ${distance} m.`
  },
  {
    pattern: /^Ziel zu weit entfernt: (.+) m\. Sichtbarkeit endet bei 100 m\.$/,
    replace: (_, distance) => `Target is too far away: ${distance} m. Visibility ends at 100 m.`
  },
  {
    pattern: /^AR-Session konnte nicht gestartet werden: (.+)$/,
    replace: (_, detail) => `Could not start the AR session: ${detail}`
  },
  {
    pattern: /^XR-Session konnte nicht an den Renderer gebunden werden: (.+)$/,
    replace: (_, detail) => `Could not bind the XR session to the renderer: ${detail}`
  }
]);

const DE_TRANSLATIONS = Object.freeze({
  languageCode: "de",
  menu: {
    eyebrow: "",
    title: "Menü",
    tabs: {
      placement: "Platzierung",
      developer: "Entwickler",
      help: "Hilfe",
      survey: "Umfrage",
      settings: "Einstellungen"
    },
    placementCopy: "Sichtbarkeit der Hauptkacheln im Overlay steuern.",
    userPlacementCopy: "",
    userResetPlacement: "Objekt neu platzieren",
    userSurveyAction: "An Umfrage teilnehmen",
    userStopAr: "AR beenden",
    developerCopy: "Entwickleransicht und Debug-Kacheln separat einblenden.",
    helpCopy: "Die Hilfskachel lässt sich jederzeit erneut einblenden.",
    surveyCopy: "Die eingebettete Nutzerumfrage wird in einer eigenen Kachel geöffnet.",
    settingsCopy: "Die Einstellungenkachel enthält die Sprachumschaltung für die UI.",
    uiModeLabel: "Ansicht",
    uiModes: {
      user: "Benutzer",
      developer: "Entwickler"
    },
    openHelp: "Hilfskachel öffnen",
    openSurvey: "Umfrage ein-/ausblenden",
    openSettings: "Einstellungen öffnen",
    developerOptions: {
      geoHeadingReference: "Geo-Local mit Kompassbezug",
      geoHeadingReferenceDescription:
        "Interpretiert X/Z-Offsets in Geo-Local als Ost/Nord-Meter statt relativ zur Blickrichtung."
    },
    visibility: {
      placement: "Objektplatzierung",
      coord: "Modus und Geo-Ziel",
      state: "Status",
      note: "Ablauf",
      geo: "Geolocation",
      offset: "Geo Offset",
      debug: "Geo Debug anzeigen"
    }
  },
  placement: {
    eyebrow: "EPARtwin WebAR",
    title: "Objektplatzierung",
    intro: "Wähle zwischen freier WebXR-Platzierung mit stabilisiertem Reticle und Geo-Platzierung im selben WebXR-Flow mit Standort, IMU und Kompass.",
    userIntro: "Tippe auf 'AR starten' und erlaube Kamera/AR sowie bei Bedarf den Standort.",
    userGuideTitle: "Objektplatzierung",
    userGuideSearch:
      "Bitte richte das Geraet auf den Boden und bewege es langsam, bis eine Flaeche erkannt wird.",
    userGuideDetected: "Flaeche erkannt. Bitte halte das Geraet kurz ruhig, bis das Objekt platziert wird.",
    modeLabel: "Hauptmodus",
    modeOptions: {
      xr: "AR (WebXR)",
      geoSensor: "Geo (WebXR)"
    },
    buttons: {
      startXR: "AR starten",
      startGeo: "Geo-Modus starten",
      activateLocation: "Standort aktivieren",
      place: "Objekt setzen",
      reset: "Neu platzieren",
      stopXR: "AR beenden",
      stopGeo: "Geo stoppen"
    }
  },
  welcome: {
    title: "Willkommen",
    headline: "Herzlich Willkommen bei der EPARtwin WebAR Experience!",
    subheading: "Anforderungen",
    items: [
      "Ein mobiles Gerät mit WebXR-Unterstützung",
      "Kamerafreigabe für den AR- und Geo-Modus (WebXR)",
      "Standortfreigabe für Geo-Placement",
      "Eine erkennbare Boden- oder Tischfläche für stabiles Placement"
    ]
  },
  help: {
    title: "Hilfe",
    steps: [
      "1. Starte AR oder Geo über die Aktionskachel oben.",
      "2. Bewege das Gerät langsam, bis eine stabile Fläche erkannt wird.",
      "3. Im freien Modus setzt du das Objekt direkt auf die stabile Fläche.",
      "4. Im Koordinatenmodus wird das Ziel aus Latitude und Longitude in den WebXR-Raum übertragen und auf der stabilen Bodenfläche verankert."
    ],
    userSteps: [
      "1. Zum Starten der WebAR-Anwendung mit dem Rücken zum QR-Code stehen.",
      "2. In der Kachel 'Objektplatzierung' den angezeigten Start-Button verwenden.",
      "3. Zugriff auf AR/Kamera und, falls abgefragt, Standort zulassen.",
      "4. Handy auf den Boden richten, bis oben rechts 'Objekt platziert: Ja' angezeigt wird.",
      "5. Dann umgucken."
    ]
  },
  survey: {
    title: "Umfrage",
    placeholderTitle: "Nutzerumfrage",
    placeholderText: "Bitte teilen Sie uns Ihre Erfahrungen mit der WebAR-Anwendung mit.",
    recommendationTitle: "Technische Empfehlung",
    recommendationText:
      "Geeignet sind eingebettete Formulare, die anonym genutzt und später exportiert oder per E-Mail ausgewertet werden können.",
    tools: [
      {
        name: "Google Forms",
        description: "schnell verfügbar, einfach teilbar und Antworten im Google-Workspace auswertbar"
      },
      {
        name: "Typeform",
        description: "starke mobile UX, gutes Embedding und geführte Frageabläufe"
      },
      {
        name: "Tally.so",
        description: "leichtgewichtig, iframe-fähig und gut für anonyme Formulare mit Export"
      },
      {
        name: "Microsoft Forms",
        description: "sinnvoll bei bestehender Microsoft-Umgebung und Auswertung im M365-Kontext"
      }
    ],
    requirementsTitle: "Wichtige Anforderungen",
    requirements: [
      "Per iframe in die bestehende UI einbettbar",
      "Optional anonym nutzbar",
      "Export oder Versand der Ergebnisse per E-Mail bzw. Dashboard möglich"
    ]
  },
  settings: {
    title: "Einstellungen",
    languageTitle: "Sprache",
    languageDescription: "Die UI kann zwischen Deutsch und Englisch umgeschaltet werden.",
    languages: {
      de: "Deutsch",
      en: "English"
    }
  },
  coord: {
    title: "Modus und Geo-Ziel",
    modeLabel: "Mode",
    latitudeLabel: "Latitude",
    longitudeLabel: "Longitude",
    options: {
      free: "Freie Platzierung",
      geoLocal: "Geo-Local",
      geoGlobal: "Geo-Global"
    },
    apply: "Koordinaten übernehmen",
    feedbackDefault: "Im Koordinaten-Modus wird das Objekt nur im gültigen Umkreis angezeigt."
  },
  state: {
    title: "Status",
    labels: {
      support: "WebXR",
      session: "Modus aktiv",
      tracking: "Tracking",
      surface: "Fläche",
      stability: "Stabilität",
      placement: "Objekt"
    },
    values: {
      checking: "Prüfung",
      available: "Verfügbar",
      unavailable: "Nicht verfügbar",
      yes: "Ja",
      no: "Nein",
      waiting: "Wartet",
      running: "Läuft",
      search: "Suche",
      detected: "Erkannt",
      stable: "Stabil",
      notPlaced: "Nicht platziert",
      placed: "Platziert"
    }
  },
  note: {
    title: "Ablauf"
  },
  geo: {
    title: "Geolocation",
    buttons: {
      location: "Standort aktivieren",
      calibrate: "Ausrichtung kalibrieren"
    },
    labels: {
      status: "Status",
      latitude: "Lat",
      longitude: "Lon",
      accuracy: "Accuracy",
      heading: "Heading"
    },
    badges: {
      checking: "Prüfung",
      ready: "Bereit",
      waiting: "Wartet",
      granted: "Granted",
      denied: "Denied",
      https: "HTTPS",
      unsupported: "Kein GPS"
    },
    statusTexts: {
      notRequested: "Not requested",
      waiting: "Waiting for permission",
      denied: "Denied",
      granted: "Granted"
    },
    messages: {
      notRequested: "Standort noch nicht angefordert.",
      httpsRequired: "Geolocation benötigt HTTPS oder localhost.",
      unsupported: "Geolocation ist in diesem Browser nicht verfügbar.",
      waiting: "Warte auf Standortfreigabe.",
      denied: "Standort verweigert - bitte im Browser aktivieren.",
      positionUnavailable: "Standort aktuell nicht verfügbar.",
      timeout: "Standortabfrage Timeout.",
      genericError: "Geolocation konnte nicht gelesen werden.",
      available: "Gerätestandort verfügbar.",
      permissionGranted: "Standortfreigabe vorhanden. Position wird aktualisiert."
    },
    help: {
      notRequested: "Tippe auf 'Standort aktivieren', damit der Browser die Freigabe anfragt.",
      httpsRequired: "Öffne die Seite über https:// oder localhost, damit der Browser Standortzugriff erlaubt.",
      denied: "Bitte aktiviere Standort in: Browser Einstellungen -> Standort -> Erlauben.",
      waiting: "Bestätige die Standortabfrage im Browser, damit Latitude und Longitude geladen werden.",
      positionUnavailable: "Prüfe GPS, Netzverbindung und freie Sicht zum Himmel.",
      timeout: "Versuche es erneut oder bewege dich an einen Ort mit besserem Empfang.",
      none: ""
    }
  },
  offset: {
    title: "Geo Test-Anpassung",
    description: "Offset, Skalierung und Rotation für Geo-Placement live testen. Werte werden zu den JSON-Vorgaben addiert bzw. überlagert.",
    siteCalibrationToggle: "JSON-Offset aktivieren",
    adoptAsSiteCalibration: "Test-Offset als JSON-Kalibrierung uebernehmen",
    toggle: "Offset aktivieren",
    eastLabel: "X (Ost/West)",
    northLabel: "Y (Nord/Süd)",
    scaleToggle: "Skalierung aktivieren",
    scaleLabel: "Skalierung",
    rotationToggle: "Rotation aktivieren",
    rotationLabel: "Rotation",
    reset: "Tests reset",
    unit: "m",
    scaleUnit: "x",
    rotationUnit: "deg"
  },
  debug: {
    title: "Geo Debug",
    tag: "Placement",
    labels: {
      originLatitude: "Origin Lat",
      originLongitude: "Origin Lon",
      targetLatitude: "Target Lat",
      targetLongitude: "Target Lon",
      deltaLatitude: "Delta Lat",
      deltaLongitude: "Delta Lon",
      xMeters: "X (m)",
      zMeters: "Z (m)",
      distanceMeters: "Distance (m)",
      objectPlaced: "Object Placed",
      distanceTooFar: "Distance > 100m",
      hasStableSurface: "Has Stable Surface",
      objectBehindCamera: "Object Behind Camera"
    }
  },
  mini: {
    session: {
      active: "Modus: Aktiv",
      checking: "Modus: Prüfung",
      ready: "Modus: Bereit",
      inactive: "Modus: Inaktiv"
    },
    surface: {
      stable: "Fläche: Stabil",
      checking: "Fläche: Prüfung",
      search: "Fläche: Suche"
    },
    placement: {
      placed: "Objekt: Platziert",
      waiting: "Objekt: Wartet",
      yes: "Objekt platziert: Ja",
      no: "Objekt platziert: Nein"
    }
  },
  aria: {
    menuOpen: "Menü öffnen",
    menuClose: "Menü schließen",
    closeButtons: {
      welcome: "Begrüßung schließen",
      help: "Hilfskachel schließen",
      survey: "Umfrage schließen",
      settings: "Einstellungen schließen"
    },
    toggleButtons: {
      welcome: "Begrüßung auf- oder zuklappen",
      placement: "Objektplatzierung auf- oder zuklappen",
      help: "Hilfskachel auf- oder zuklappen",
      survey: "Umfrage auf- oder zuklappen",
      settings: "Einstellungen auf- oder zuklappen",
      coord: "Modus und Geo-Ziel auf- oder zuklappen",
      state: "Status auf- oder zuklappen",
      note: "Ablauf auf- oder zuklappen",
      geo: "Geolocation auf- oder zuklappen",
      offset: "Geo Offset auf- oder zuklappen",
      debug: "Geo Debug auf- oder zuklappen"
    },
    languageGroup: "Sprachauswahl"
  }
});
const EN_TRANSLATIONS = Object.freeze({
  languageCode: "en",
  menu: {
    eyebrow: "",
    title: "Menu",
    tabs: {
      placement: "Placement",
      developer: "Developer",
      help: "Help",
      survey: "Survey",
      settings: "Settings"
    },
    placementCopy: "Control the visibility of the main cards in the overlay.",
    userPlacementCopy: "",
    userResetPlacement: "Reposition object",
    userSurveyAction: "Take survey",
    userStopAr: "Stop AR",
    developerCopy: "Show or hide developer views and debug cards separately.",
    helpCopy: "The help card can be opened again at any time.",
    surveyCopy: "The embedded user survey opens in its own card.",
    settingsCopy: "The settings card contains the language switch for the UI.",
    uiModeLabel: "View",
    uiModes: {
      user: "User",
      developer: "Developer"
    },
    openHelp: "Open help card",
    openSurvey: "Show or hide survey",
    openSettings: "Open settings",
    developerOptions: {
      geoHeadingReference: "Geo-Local with compass reference",
      geoHeadingReferenceDescription:
        "Interprets X/Z offsets in Geo-Local as east/north meters instead of relative to the viewing direction."
    },
    visibility: {
      placement: "Object placement",
      coord: "Mode and geo target",
      state: "Status",
      note: "Flow",
      geo: "Geolocation",
      offset: "Geo offset",
      debug: "Show geo debug"
    }
  },
  placement: {
    eyebrow: "EPARtwin WebAR",
    title: "Object Placement",
    intro: "Choose between free WebXR placement with the stabilized reticle and geo placement in the same WebXR flow with location, IMU, and compass.",
    userIntro: "Tap 'Start AR' and allow camera/AR and, if requested, location access.",
    userGuideTitle: "Object placement",
    userGuideSearch: "Please point the device at the floor and move it slowly until a surface is detected.",
    userGuideDetected: "Surface detected. Please hold the device still briefly until the object is placed.",
    modeLabel: "Main mode",
    modeOptions: {
      xr: "AR (WebXR)",
      geoSensor: "Geo (WebXR)"
    },
    buttons: {
      startXR: "Start AR",
      startGeo: "Start Geo Mode",
      activateLocation: "Enable location",
      place: "Place object",
      reset: "Reposition",
      stopXR: "Stop AR",
      stopGeo: "Stop Geo"
    }
  },
  welcome: {
    title: "Welcome",
    headline: "Welcome to the EPARtwin WebAR Experience!",
    subheading: "Requirements",
    items: [
      "A mobile device with WebXR support",
      "Camera permission for AR and Geo mode (WebXR)",
      "Location permission for geo placement",
      "A visible floor or table surface for stable placement"
    ]
  },
  help: {
    title: "Help",
    steps: [
      "1. Start AR or Geo from the action card above.",
      "2. Move the device slowly until a stable surface is detected.",
      "3. In free mode you place the object directly on the stable surface.",
      "4. In coordinate mode the target latitude and longitude are mapped into WebXR space and anchored on the stable ground surface."
    ],
    userSteps: [
      "1. Start the WebAR experience while standing with your back to the QR code.",
      "2. Use the visible start button in the placement card.",
      "3. Allow access to AR/camera and location if the browser asks for it.",
      "4. Point the phone at the floor until the top-right status shows 'Object placed: Yes'.",
      "5. Then look around."
    ]
  },
  survey: {
    title: "Survey",
    placeholderTitle: "User survey",
    placeholderText: "Please share your experience with the WebAR application.",
    recommendationTitle: "Technical recommendation",
    recommendationText:
      "Suitable choices are embedded forms that can be used anonymously and later exported or reviewed by email or dashboard.",
    tools: [
      {
        name: "Google Forms",
        description: "quickly available, easy to share and simple to evaluate in Google Workspace"
      },
      {
        name: "Typeform",
        description: "strong mobile UX, good embedding and guided question flows"
      },
      {
        name: "Tally.so",
        description: "lightweight, iframe-friendly and useful for anonymous forms with export"
      },
      {
        name: "Microsoft Forms",
        description: "useful in an existing Microsoft environment with M365 reporting"
      }
    ],
    requirementsTitle: "Key requirements",
    requirements: [
      "Embeddable in the current UI via iframe",
      "Optionally usable anonymously",
      "Export or delivery of results via email or dashboard"
    ]
  },
  settings: {
    title: "Settings",
    languageTitle: "Language",
    languageDescription: "The UI can be switched between German and English.",
    languages: {
      de: "Deutsch",
      en: "English"
    }
  },
  coord: {
    title: "Mode and Geo Target",
    modeLabel: "Mode",
    latitudeLabel: "Latitude",
    longitudeLabel: "Longitude",
    options: {
      free: "Free placement",
      geoLocal: "Geo-Local",
      geoGlobal: "Geo-Global"
    },
    apply: "Apply coordinates",
    feedbackDefault: "In coordinate mode the object is only shown within the valid radius."
  },
  state: {
    title: "Status",
    labels: {
      support: "WebXR",
      session: "Mode active",
      tracking: "Tracking",
      surface: "Surface",
      stability: "Stability",
      placement: "Object"
    },
    values: {
      checking: "Checking",
      available: "Available",
      unavailable: "Unavailable",
      yes: "Yes",
      no: "No",
      waiting: "Waiting",
      running: "Running",
      search: "Searching",
      detected: "Detected",
      stable: "Stable",
      notPlaced: "Not placed",
      placed: "Placed"
    }
  },
  note: {
    title: "Flow"
  },
  geo: {
    title: "Geolocation",
    buttons: {
      location: "Enable location",
      calibrate: "Calibrate heading"
    },
    labels: {
      status: "Status",
      latitude: "Lat",
      longitude: "Lon",
      accuracy: "Accuracy",
      heading: "Heading"
    },
    badges: {
      checking: "Checking",
      ready: "Ready",
      waiting: "Waiting",
      granted: "Granted",
      denied: "Denied",
      https: "HTTPS",
      unsupported: "No GPS"
    },
    statusTexts: {
      notRequested: "Not requested",
      waiting: "Waiting for permission",
      denied: "Denied",
      granted: "Granted"
    },
    messages: {
      notRequested: "Location has not been requested yet.",
      httpsRequired: "Geolocation requires HTTPS or localhost.",
      unsupported: "Geolocation is not available in this browser.",
      waiting: "Waiting for location permission.",
      denied: "Location access denied. Enable it in the browser settings.",
      positionUnavailable: "Location is currently unavailable.",
      timeout: "Location request timed out.",
      genericError: "Geolocation could not be read.",
      available: "Device location is available.",
      permissionGranted: "Location permission is available. Position is being updated."
    },
    help: {
      notRequested: "Tap 'Enable location' so the browser can request permission.",
      httpsRequired: "Open the page via https:// or localhost so the browser can allow location access.",
      denied: "Enable location in the browser settings to continue.",
      waiting: "Confirm the location request in the browser so latitude and longitude can be loaded.",
      positionUnavailable: "Check GPS, network connectivity and clear sky visibility.",
      timeout: "Try again or move to a place with better reception.",
      none: ""
    }
  },
  offset: {
    title: "Geo Test Adjustments",
    description: "Live-test offset, scale, and rotation for geo placement. Values are added to or layered over JSON defaults.",
    siteCalibrationToggle: "Enable JSON offset",
    adoptAsSiteCalibration: "Apply test offset as JSON calibration",
    toggle: "Enable offset",
    eastLabel: "X (East/West)",
    northLabel: "Y (North/South)",
    scaleToggle: "Enable scale",
    scaleLabel: "Scale",
    rotationToggle: "Enable rotation",
    rotationLabel: "Rotation",
    reset: "Reset tests",
    unit: "m",
    scaleUnit: "x",
    rotationUnit: "deg"
  },
  debug: {
    title: "Geo Debug",
    tag: "Placement",
    labels: {
      originLatitude: "Origin Lat",
      originLongitude: "Origin Lon",
      targetLatitude: "Target Lat",
      targetLongitude: "Target Lon",
      deltaLatitude: "Delta Lat",
      deltaLongitude: "Delta Lon",
      xMeters: "X (m)",
      zMeters: "Z (m)",
      distanceMeters: "Distance (m)",
      objectPlaced: "Object Placed",
      distanceTooFar: "Distance > 100m",
      hasStableSurface: "Has Stable Surface",
      objectBehindCamera: "Object Behind Camera"
    }
  },
  mini: {
    session: {
      active: "Mode: Active",
      checking: "Mode: Checking",
      ready: "Mode: Ready",
      inactive: "Mode: Inactive"
    },
    surface: {
      stable: "Surface: Stable",
      checking: "Surface: Checking",
      search: "Surface: Search"
    },
    placement: {
      placed: "Object: Placed",
      waiting: "Object: Waiting",
      yes: "Object placed: Yes",
      no: "Object placed: No"
    }
  },
  aria: {
    menuOpen: "Open menu",
    menuClose: "Close menu",
    closeButtons: {
      welcome: "Close welcome card",
      help: "Close help card",
      survey: "Close survey card",
      settings: "Close settings card"
    },
    toggleButtons: {
      welcome: "Toggle welcome card",
      placement: "Toggle object placement card",
      help: "Toggle help card",
      survey: "Toggle survey card",
      settings: "Toggle settings card",
      coord: "Toggle mode and geo target card",
      state: "Toggle status card",
      note: "Toggle flow card",
      geo: "Toggle geolocation card",
      offset: "Toggle geo offset card",
      debug: "Toggle geo debug card"
    },
    languageGroup: "Language selection"
  }
});

const UI_TRANSLATIONS = Object.freeze({
  de: DE_TRANSLATIONS,
  en: EN_TRANSLATIONS
});

function getTranslations(language) {
  return UI_TRANSLATIONS[SUPPORTED_LANGUAGES.has(language) ? language : "de"];
}

function toEditableValue(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "";
}

function toBadgeStatus(status) {
  switch (status) {
    case "granted":
      return "ok";
    case "waiting":
      return "warning";
    case "denied":
      return "error";
    default:
      return "idle";
  }
}

function toGeoSeverity(snapshot) {
  if (!snapshot) {
    return "idle";
  }

  if (snapshot.issue === "https-required" || snapshot.issue === "unsupported") {
    return "error";
  }

  if (snapshot.status === "denied") {
    return "error";
  }

  return toBadgeStatus(snapshot.status);
}

function formatDebugNumber(value, fractionDigits = 2) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function formatDebugBoolean(value) {
  return value ? "true" : "false";
}

const GERMAN_MOJIBAKE_REPLACEMENTS = Object.freeze([
  [/Ã„/g, "Ä"],
  [/Ã–/g, "Ö"],
  [/Ãœ/g, "Ü"],
  [/Ã¤/g, "ä"],
  [/Ã¶/g, "ö"],
  [/Ã¼/g, "ü"],
  [/ÃŸ/g, "ß"]
]);

const GERMAN_DISPLAY_TEXT_REPLACEMENTS = Object.freeze([
  [/Menue/g, "Menü"],
  [/Begruessung/g, "Begrüßung"],
  [/schliessen/g, "schließen"],
  [/laesst/g, "lässt"],
  [/Oeffnen/g, "Öffnen"],
  [/Oeffne/g, "Öffne"],
  [/oeffnen/g, "öffnen"],
  [/oeffne/g, "öffne"],
  [/geoeffnet/g, "geöffnet"],
  [/enthaelt/g, "enthält"],
  [/\bFuer\b/g, "Für"],
  [/\bfuer\b/g, "für"],
  [/Waehle/g, "Wähle"],
  [/waehle/g, "wähle"],
  [/vorausgewaehlt/g, "vorausgewählt"],
  [/ausgewaehlt/g, "ausgewählt"],
  [/gewaehlt/g, "gewählt"],
  [/Pruefung/g, "Prüfung"],
  [/prueft/g, "prüft"],
  [/Pruefe/g, "Prüfe"],
  [/pruefe/g, "prüfe"],
  [/Unterstuetzung/g, "Unterstützung"],
  [/unterstuetzt/g, "unterstützt"],
  [/Unterstuetzt/g, "Unterstützt"],
  [/Geraetestandort/g, "Gerätestandort"],
  [/Geraetekoordinaten/g, "Gerätekoordinaten"],
  [/Geraeteposition/g, "Geräteposition"],
  [/Geraet/g, "Gerät"],
  [/Rueckkamera/g, "Rückkamera"],
  [/Ruecken/g, "Rücken"],
  [/Buehne/g, "Bühne"],
  [/laedt/g, "lädt"],
  [/Mehrframe-Pruefung/g, "Mehrframe-Prüfung"],
  [/Referenzflaeche/g, "Referenzfläche"],
  [/Bodenflaeche/g, "Bodenfläche"],
  [/Flaechen/g, "Flächen"],
  [/Flaeche/g, "Fläche"],
  [/flaeche/g, "fläche"],
  [/Bodenhoehe/g, "Bodenhöhe"],
  [/verfuegbaren/g, "verfügbaren"],
  [/verfuegbare/g, "verfügbare"],
  [/verfuegbar/g, "verfügbar"],
  [/Verfuegbar/g, "Verfügbar"],
  [/Ungueltig/g, "Ungültig"],
  [/ungueltig/g, "ungültig"],
  [/gueltigen/g, "gültigen"],
  [/gueltige/g, "gültige"],
  [/gueltiger/g, "gültiger"],
  [/gueltig/g, "gültig"],
  [/uebernommen/g, "übernommen"],
  [/ueberlagert/g, "überlagert"],
  [/uebertragen/g, "übertragen"],
  [/ueber die/g, "über die"],
  [/ueber den/g, "über den"],
  [/ueber dem/g, "über dem"],
  [/ueber eine/g, "über eine"],
  [/ueber einen/g, "über einen"],
  [/ueber-/g, "über-"],
  [/ueber /g, "über "],
  [/zurueckgesetzt/g, "zurückgesetzt"],
  [/naechsten/g, "nächsten"],
  [/naechste/g, "nächste"],
  [/moeglich/g, "möglich"],
  [/benoetigt/g, "benötigt"],
  [/Bestaetige/g, "Bestätige"],
  [/bestaetige/g, "bestätige"],
  [/Sued/g, "Süd"],
  [/Druecke/g, "Drücke"],
  [/unveraendert/g, "unverändert"],
  [/veraendert/g, "verändert"]
]);

function normalizeGermanDisplayText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return text;
  }

  let normalized = text;

  for (const [pattern, replacement] of GERMAN_MOJIBAKE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of GERMAN_DISPLAY_TEXT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

function translateRuntimeText(text, language) {
  if (!text) {
    return text;
  }

  if (language !== "en") {
    return normalizeGermanDisplayText(text);
  }

  if (Object.prototype.hasOwnProperty.call(EXACT_RUNTIME_TRANSLATIONS_EN, text)) {
    return EXACT_RUNTIME_TRANSLATIONS_EN[text];
  }

  for (const rule of REGEX_RUNTIME_TRANSLATIONS_EN) {
    const match = text.match(rule.pattern);
    if (match) {
      return rule.replace(...match);
    }
  }

  return text;
}

function createGeoSnapshotDefaults() {
  return {
    status: "not-requested",
    issue: null,
    position: null,
    watchActive: false,
    requestPending: false
  };
}

function createSensorSnapshotDefaults() {
  return {
    running: false,
    ready: false,
    issue: null,
    message: "",
    motionPermissionState: "unknown",
    locationActive: false,
    position: null,
    headingDeg: null,
    pitchDeg: null,
    rollDeg: null
  };
}

function formatHeading(value) {
  return Number.isFinite(value) ? `${Math.round(value)} deg` : "-";
}

function clampGeoOffset(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, -MAX_GEO_OFFSET_METERS), MAX_GEO_OFFSET_METERS);
}

function clampGeoScaleFactor(value) {
  if (!Number.isFinite(value)) {
    return MIN_GEO_SCALE_FACTOR;
  }

  return Math.min(Math.max(value, MIN_GEO_SCALE_FACTOR), MAX_GEO_SCALE_FACTOR);
}

function normalizeRotationDeg(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export class UIController {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.uiContainer = this.document.getElementById("ui-container");
    this.hudRoot = this.document.getElementById("hud");
    this.hudBody = this.document.getElementById("hud-body");

    this.menuButton = this.document.getElementById("menu-button");
    this.menuOverlay = this.document.getElementById("menu-overlay");
    this.menuCloseButton = this.document.getElementById("menu-close-button");
    this.uiModeUserButton = this.document.getElementById("ui-mode-user-button");
    this.uiModeDeveloperButton = this.document.getElementById("ui-mode-developer-button");
    this.openHelpCardButton = this.document.getElementById("open-help-card-button");
    this.openSurveyCardButton = this.document.getElementById("open-survey-card-button");
    this.openSettingsCardButton = this.document.getElementById("open-settings-card-button");
    this.userMenuActions = this.document.getElementById("user-menu-actions");
    this.userMenuResetButton = this.document.getElementById("user-menu-reset-button");
    this.userMenuSurveyButton = this.document.getElementById("user-menu-survey-button");
    this.menuTabButtons = Array.from(this.document.querySelectorAll("[data-menu-tab]"));
    this.menuTabPanels = Array.from(this.document.querySelectorAll("[data-menu-panel]"));
    this.cardVisibilityToggles = Array.from(this.document.querySelectorAll("[data-card-visibility-toggle]"));
    this.geoHeadingReferenceToggle = this.document.getElementById("geo-heading-reference-enabled");

    this.messageEl = this.document.getElementById("status-message");
    this.hintEl = this.document.getElementById("interaction-hint");
    this.assetNameEl = this.document.getElementById("asset-name");
    this.geoTargetFeedbackEl = this.document.getElementById("geo-target-feedback");
    this.modeBadgeEl = this.document.getElementById("mode-badge");

    this.startButton = this.document.getElementById("start-ar-button");
    this.geoActivateLocationButton = this.document.getElementById("geo-activate-location-button");
    this.placeButton = this.document.getElementById("place-button");
    this.resetButton = this.document.getElementById("reset-button");
    this.stopButton = this.document.getElementById("stop-ar-button");
    this.applyGeoTargetButton = this.document.getElementById("apply-geo-target-button");
    this.activateGeoButton = this.document.getElementById("activate-geolocation-button");
    this.calibrateHeadingButton = this.document.getElementById("calibrate-heading-button");
    this.closeWelcomeButton = this.document.getElementById("close-welcome-button");
    this.closeHelpButton = this.document.getElementById("close-help-button");
    this.closeSurveyButton = this.document.getElementById("close-survey-button");
    this.closeSettingsButton = this.document.getElementById("close-settings-button");
    this.userToolbarActions = this.document.getElementById("user-ar-toolbar-actions");
    this.userToolbarStopButton = this.document.getElementById("user-toolbar-stop-button");
    this.userPlacementPopup = this.document.getElementById("user-placement-popup");
    this.userPlacementPopupTitle = this.document.getElementById("user-placement-popup-title");
    this.userPlacementPopupText = this.document.getElementById("user-placement-popup-text");

    this.languageButtons = {
      de: this.document.getElementById("language-de-button"),
      en: this.document.getElementById("language-en-button")
    };

    this.experienceModeSelect = this.document.getElementById("experience-mode-select");
    this.experienceModeField = this.experienceModeSelect ? this.experienceModeSelect.closest("label") : null;
    this.modeSelect = this.document.getElementById("placement-mode-select");
    this.placementModeField = this.modeSelect ? this.modeSelect.closest("label") : null;
    this.geoTargetInputs = {
      latitude: this.document.getElementById("geo-target-latitude"),
      longitude: this.document.getElementById("geo-target-longitude")
    };

    this.geoRefs = {
      statusBadge: this.document.getElementById("geo-status-badge"),
      statusText: this.document.getElementById("geo-status-text"),
      latitude: this.document.getElementById("geo-latitude"),
      longitude: this.document.getElementById("geo-longitude"),
      accuracy: this.document.getElementById("geo-accuracy"),
      heading: this.document.getElementById("geo-heading"),
      message: this.document.getElementById("geo-message"),
      help: this.document.getElementById("geo-help")
    };
    this.geoCopyTriggers = Array.from(this.document.querySelectorAll("[data-copy-device-coords='true']"));
    this.geoOffsetRefs = {
      siteCalibrationEnabled: this.document.getElementById("geo-site-calibration-enabled"),
      enabled: this.document.getElementById("geo-offset-enabled"),
      eastRange: this.document.getElementById("geo-offset-east-range"),
      northRange: this.document.getElementById("geo-offset-north-range"),
      eastValue: this.document.getElementById("geo-offset-east-value"),
      northValue: this.document.getElementById("geo-offset-north-value"),
      scaleEnabled: this.document.getElementById("geo-scale-enabled"),
      scaleRange: this.document.getElementById("geo-scale-range"),
      scaleValue: this.document.getElementById("geo-scale-value"),
      rotationEnabled: this.document.getElementById("geo-rotation-enabled"),
      rotationRange: this.document.getElementById("geo-rotation-range"),
      rotationValue: this.document.getElementById("geo-rotation-value"),
      adoptButton: this.document.getElementById("geo-offset-adopt-button"),
      resetButton: this.document.getElementById("geo-offset-reset-button")
    };

    this.geoDebugRefs = {
      originLatitude: this.document.getElementById("debug-origin-latitude"),
      originLongitude: this.document.getElementById("debug-origin-longitude"),
      targetLatitude: this.document.getElementById("debug-target-latitude"),
      targetLongitude: this.document.getElementById("debug-target-longitude"),
      deltaLatitude: this.document.getElementById("debug-delta-latitude"),
      deltaLongitude: this.document.getElementById("debug-delta-longitude"),
      xMeters: this.document.getElementById("debug-x-meters"),
      zMeters: this.document.getElementById("debug-z-meters"),
      distanceMeters: this.document.getElementById("debug-distance-meters")
    };

    this.placementDebugRefs = {
      objectPlaced: this.document.getElementById("debug-object-placed"),
      distanceTooFar: this.document.getElementById("debug-distance-too-far"),
      hasStableSurface: this.document.getElementById("debug-has-stable-surface"),
      objectBehindCamera: this.document.getElementById("debug-object-behind-camera")
    };

    this.miniRefs = {
      session: this.document.getElementById("mini-session"),
      surface: this.document.getElementById("mini-surface"),
      placement: this.document.getElementById("mini-placement")
    };

    this.stateRefs = {
      support: this.getStateRef("support"),
      session: this.getStateRef("session"),
      tracking: this.getStateRef("tracking"),
      surface: this.getStateRef("surface"),
      stability: this.getStateRef("stability"),
      placement: this.getStateRef("placement")
    };

    this.cardRefs = {
      welcome: this.getCardRefs("welcome"),
      placement: this.getCardRefs("placement"),
      help: this.getCardRefs("help"),
      survey: this.getCardRefs("survey"),
      settings: this.getCardRefs("settings"),
      coord: this.getCardRefs("coord"),
      state: this.getCardRefs("state"),
      note: this.getCardRefs("note"),
      geo: this.getCardRefs("geo"),
      offset: this.getCardRefs("offset"),
      debug: this.getCardRefs("debug")
    };

    this.staticRefs = {
      menuEyebrow: this.document.querySelector(".menu-eyebrow"),
      menuTitle: this.document.querySelector(".menu-header h2"),
      menuTabs: {
        placement: this.document.getElementById("menu-tab-placement"),
        developer: this.document.getElementById("menu-tab-developer"),
        help: this.document.getElementById("menu-tab-help"),
        survey: this.document.getElementById("menu-tab-survey"),
        settings: this.document.getElementById("menu-tab-settings")
      },
      menuTabList: this.document.querySelector(".menu-tabs"),
      menuCopies: {
        placement: this.document.querySelector('[data-menu-panel="placement"] .menu-copy'),
        developer: this.document.querySelector('[data-menu-panel="developer"] .menu-copy'),
        help: this.document.querySelector('[data-menu-panel="help"] .menu-copy'),
        survey: this.document.querySelector('[data-menu-panel="survey"] .menu-copy'),
        settings: this.document.querySelector('[data-menu-panel="settings"] .menu-copy')
      },
      placementMenuOptionList: this.document.querySelector('[data-menu-panel="placement"] .menu-option-list'),
      menuUiModeLabel: this.document.getElementById("menu-ui-mode-label"),
      menuVisibilityLabels: {
        placement: this.getVisibilityToggleLabel("placement"),
        coord: this.getVisibilityToggleLabel("coord"),
        state: this.getVisibilityToggleLabel("state"),
        note: this.getVisibilityToggleLabel("note"),
        geo: this.getVisibilityToggleLabel("geo"),
        offset: this.getVisibilityToggleLabel("offset"),
        debug: this.getVisibilityToggleLabel("debug")
      },
      geoHeadingReferenceToggleLabel: this.document.getElementById("geo-heading-reference-toggle-label"),
      geoHeadingReferenceToggleDescription: this.document.getElementById("geo-heading-reference-toggle-description"),
      placementEyebrow: this.document.querySelector("#card-placement .eyebrow"),
      placementTitle: this.document.querySelector("#card-placement h1"),
      placementIntro: this.document.querySelector("#card-placement .panel-intro"),
      placementModeLabel: this.experienceModeSelect
        ? this.experienceModeSelect.closest("label")?.querySelector(".field-label")
        : null,
      welcomeTitle: this.document.getElementById("welcome-card-title"),
      welcomeHeadline: this.document.getElementById("welcome-card-headline"),
      welcomeSubheading: this.document.getElementById("welcome-card-subheading"),
      welcomeList: this.document.getElementById("welcome-card-list"),
      helpTitle: this.document.querySelector("#card-help .card-title-group h2"),
      helpCopy: this.document.querySelector("#card-help .help-copy"),
      surveyTitle: this.document.getElementById("survey-card-title"),
      surveyPlaceholderTitle: this.document.getElementById("survey-placeholder-title"),
      surveyPlaceholderText: this.document.getElementById("survey-placeholder-text"),
      surveyRecommendationTitle: this.document.getElementById("survey-recommendation-title"),
      surveyRecommendationText: this.document.getElementById("survey-recommendation-text"),
      surveyToolList: this.document.getElementById("survey-tool-list"),
      surveyRequirementsTitle: this.document.getElementById("survey-requirements-title"),
      surveyRequirementsList: this.document.getElementById("survey-requirements-list"),
      settingsTitle: this.document.getElementById("settings-card-title"),
      settingsLanguageTitle: this.document.getElementById("settings-language-title"),
      settingsLanguageDescription: this.document.getElementById("settings-language-description"),
      coordTitle: this.document.querySelector("#card-coord .card-title-group h2"),
      coordModeLabel: this.modeSelect ? this.modeSelect.closest("label")?.querySelector(".field-label") : null,
      coordLatitudeLabel: this.geoTargetInputs.latitude
        ? this.geoTargetInputs.latitude.closest("label")?.querySelector(".field-label")
        : null,
      coordLongitudeLabel: this.geoTargetInputs.longitude
        ? this.geoTargetInputs.longitude.closest("label")?.querySelector(".field-label")
        : null,
      stateTitle: this.document.querySelector("#card-state .card-title-group h2"),
      noteTitle: this.document.querySelector("#card-note .card-title-group h2"),
      geoTitle: this.document.querySelector("#card-geo .card-title-group h2"),
      offsetTitle: this.document.getElementById("offset-card-title"),
      offsetDescription: this.document.getElementById("geo-offset-description"),
      siteCalibrationToggleLabel: this.document.getElementById("geo-site-calibration-toggle-label"),
      offsetToggleLabel: this.document.getElementById("geo-offset-toggle-label"),
      offsetEastLabel: this.document.getElementById("geo-offset-east-label"),
      offsetNorthLabel: this.document.getElementById("geo-offset-north-label"),
      scaleToggleLabel: this.document.getElementById("geo-scale-toggle-label"),
      scaleLabel: this.document.getElementById("geo-scale-label"),
      rotationToggleLabel: this.document.getElementById("geo-rotation-toggle-label"),
      rotationLabel: this.document.getElementById("geo-rotation-label"),
      debugTitle: this.document.querySelector("#card-debug .card-title-group h2"),
      debugTag: this.document.querySelector("#card-debug .panel-tag"),
      geoLabels: {
        status: this.geoRefs.statusText ? this.geoRefs.statusText.closest(".geo-item")?.querySelector(".geo-label") : null,
        latitude: this.geoRefs.latitude ? this.geoRefs.latitude.closest(".geo-item")?.querySelector(".geo-label") : null,
        longitude: this.geoRefs.longitude ? this.geoRefs.longitude.closest(".geo-item")?.querySelector(".geo-label") : null,
        accuracy: this.geoRefs.accuracy ? this.geoRefs.accuracy.closest(".geo-item")?.querySelector(".geo-label") : null,
        heading: this.geoRefs.heading ? this.geoRefs.heading.closest(".geo-item")?.querySelector(".geo-label") : null
      },
      debugLabels: {
        originLatitude: this.getDebugLabel(this.geoDebugRefs.originLatitude),
        originLongitude: this.getDebugLabel(this.geoDebugRefs.originLongitude),
        targetLatitude: this.getDebugLabel(this.geoDebugRefs.targetLatitude),
        targetLongitude: this.getDebugLabel(this.geoDebugRefs.targetLongitude),
        deltaLatitude: this.getDebugLabel(this.geoDebugRefs.deltaLatitude),
        deltaLongitude: this.getDebugLabel(this.geoDebugRefs.deltaLongitude),
        xMeters: this.getDebugLabel(this.geoDebugRefs.xMeters),
        zMeters: this.getDebugLabel(this.geoDebugRefs.zMeters),
        distanceMeters: this.getDebugLabel(this.geoDebugRefs.distanceMeters),
        objectPlaced: this.getDebugLabel(this.placementDebugRefs.objectPlaced),
        distanceTooFar: this.getDebugLabel(this.placementDebugRefs.distanceTooFar),
        hasStableSurface: this.getDebugLabel(this.placementDebugRefs.hasStableSurface),
        objectBehindCamera: this.getDebugLabel(this.placementDebugRefs.objectBehindCamera)
      }
    };

    this.uiState = {
      supportAvailable: null,
      sessionActive: false,
      startActionPending: false,
      trackingActive: false,
      surfaceDetected: false,
      stableSurface: false,
      placed: false,
      experienceMode: "xr",
      placementMode: "free",
      geoStatus: "not-requested",
      geoWatchActive: false,
      geoHeadingReferenceEnabled: false,
      uiMode: this.readPersistedUIMode(),
      menuOpen: false,
      activeMenuTab: "placement",
      cardVisibility: { ...DEFAULT_CARD_VISIBILITY },
      cardCollapsed: { ...DEFAULT_CARD_COLLAPSED },
      language: "de"
    };

    this.rawUiText = {
      message: this.messageEl ? this.messageEl.textContent.trim() : "",
      hint: this.hintEl ? this.hintEl.textContent.trim() : "",
      geoTargetFeedback: this.geoTargetFeedbackEl ? this.geoTargetFeedbackEl.textContent.trim() : "",
      assetLabel: this.assetNameEl ? this.assetNameEl.textContent.trim() : ""
    };

    this.geoTargetDraft = {
      latitude: "",
      longitude: ""
    };
    this.geoOffsetDraft = {
      useSiteCalibration: true,
      enabled: false,
      eastMeters: 0,
      northMeters: 0,
      scaleEnabled: false,
      scaleFactor: 1,
      rotationEnabled: false,
      rotationDeg: 0
    };
    this.latestGeoPosition = null;
    this.lastGeoSnapshot = createGeoSnapshotDefaults();
    this.lastSensorSnapshot = createSensorSnapshotDefaults();
    this.uiInteracting = false;
    this.textInputActive = false;
    this.uiInteractionChangeHandler = null;
    this.textInputActiveChangeHandler = null;
    this.uiInteractionReleaseTimeoutId = null;
    this.textInputReleaseTimeoutId = null;
    this.cleanupCallbacks = [];
    this.developerCardVisibilitySnapshot = null;

    this.configureTextInputs();
    this.applyMenuState();
    this.applyMenuTabState();
    this.applyAllCardStates();
    this.applyStaticTexts();
    this.applyUIModeLayout();
    this.setExperienceMode(this.uiState.experienceMode);
    this.setPlacementMode(this.uiState.placementMode);
    this.renderGeoHeadingReferenceControl();
    this.setGeoOffsetControlState(this.geoOffsetDraft);
    this.renderSystemStates();
    this.renderGeoSnapshot(this.lastGeoSnapshot);
    this.renderSensorSnapshot(this.lastSensorSnapshot);
    this.setGeoDebug({});
    this.setPlacementDebug({});
    this.syncCanvasPointerEvents();
  }

  getText() {
    return getTranslations(this.uiState.language);
  }

  readPersistedUIMode() {
    try {
      const storedMode = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
      if (storedMode === UI_MODE.DEVELOPER || storedMode === UI_MODE.USER) {
        return storedMode;
      }

      window.localStorage.setItem(UI_MODE_STORAGE_KEY, UI_MODE.USER);
      return UI_MODE.USER;
    } catch (_error) {
      return UI_MODE.USER;
    }
  }

  persistUIMode(mode) {
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    } catch (_error) {
      // Ignore storage errors.
    }
  }

  isUserMode() {
    return this.uiState.uiMode === UI_MODE.USER;
  }

  getStateRef(key) {
    return {
      item: this.document.querySelector(`[data-state="${key}"]`),
      value: this.document.getElementById(`state-${key}`)
    };
  }

  getCardRefs(key) {
    return {
      root: this.document.querySelector(`[data-card="${key}"]`),
      content: this.document.querySelector(`[data-card-content="${key}"]`),
      toggleButton: this.document.querySelector(`[data-card-toggle="${key}"]`),
      toggleIcon: this.document.querySelector(`[data-card-toggle-icon="${key}"]`)
    };
  }

  getVisibilityToggleLabel(cardKey) {
    const toggle = this.document.querySelector(`[data-card-visibility-toggle="${cardKey}"]`);
    return toggle ? toggle.closest("label")?.querySelector("span") : null;
  }

  getDebugLabel(valueEl) {
    return valueEl ? valueEl.closest(".debug-item")?.querySelector(".debug-label") : null;
  }

  configureTextInputs() {
    const textInputs = [this.geoTargetInputs.latitude, this.geoTargetInputs.longitude].filter(Boolean);

    for (const input of textInputs) {
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocorrect", "off");
      input.setAttribute("spellcheck", "false");
      input.setAttribute("inputmode", "decimal");
    }
  }

  bindActions({
    onStartAR,
    onPlace,
    onResetPlacement,
    onStopAR,
    onApplyGeoTarget,
    onModeChange,
    onExperienceModeChange,
    onRequestGeolocation,
    onCalibrateHeading,
    onGeoHeadingReferenceToggle,
    onGeoOffsetToggle,
    onGeoOffsetChange,
    onGeoOffsetAdopt,
    onGeoOffsetReset,
    onUIInteractionChange,
    onTextInputActiveChange
  }) {
    this.uiInteractionChangeHandler = typeof onUIInteractionChange === "function" ? onUIInteractionChange : null;
    this.textInputActiveChangeHandler =
      typeof onTextInputActiveChange === "function" ? onTextInputActiveChange : null;

    this.bindButton(this.startButton, () => this.runStartAction(onStartAR));
    this.bindButton(this.geoActivateLocationButton, onRequestGeolocation);
    this.bindButton(this.placeButton, onPlace);
    this.bindButton(this.resetButton, onResetPlacement);
    this.bindButton(this.stopButton, onStopAR);
    this.bindButton(this.applyGeoTargetButton, () => this.handleApplyGeoTarget(onApplyGeoTarget));
    this.bindButton(this.activateGeoButton, onRequestGeolocation);
    this.bindButton(this.calibrateHeadingButton, onCalibrateHeading);
    this.bindButton(this.closeWelcomeButton, () => this.closeCard("welcome"));
    this.bindButton(this.closeHelpButton, () => this.closeCard("help"));
    this.bindButton(this.closeSurveyButton, () => this.closeCard("survey"));
    this.bindButton(this.closeSettingsButton, () => this.closeCard("settings"));
    this.bindButton(this.userMenuResetButton, () => {
      if (typeof onResetPlacement === "function") {
        onResetPlacement();
      }
      this.closeMenu();
    });
    this.bindButton(this.userMenuSurveyButton, () => this.toggleMenuCard("survey"));
    this.bindButton(this.userToolbarStopButton, onStopAR);

    this.bindInput(this.geoTargetInputs.latitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindInput(this.geoTargetInputs.longitude, () => this.updateGeoTargetDraftFromInputs());
    this.bindSelect(this.experienceModeSelect, () => this.handleExperienceModeChange(onExperienceModeChange));
    this.bindSelect(this.modeSelect, () => this.handleModeChange(onModeChange));

    this.bindCardToggleButtons();
    this.bindMenuControls();
    this.bindUIModeControls();
    this.bindLanguageControls();
    this.bindGeoHeadingReferenceControl(onGeoHeadingReferenceToggle);
    this.bindInteractionSurface(this.uiContainer);
    this.bindInteractionSurface(this.hudRoot);
    this.bindDeviceCoordinateCopy();
    this.bindGeoOffsetControls({
      onGeoOffsetToggle,
      onGeoOffsetChange,
      onGeoOffsetAdopt,
      onGeoOffsetReset
    });
    this.bindTextInputActivity();

    this.refreshButtons();
  }

  bindGeoHeadingReferenceControl(handler) {
    if (!this.geoHeadingReferenceToggle) {
      return;
    }

    const handleToggle = () => {
      this.handleGeoHeadingReferenceToggle(handler);
    };

    this.geoHeadingReferenceToggle.addEventListener("change", handleToggle);
    this.cleanupCallbacks.push(() => this.geoHeadingReferenceToggle.removeEventListener("change", handleToggle));
  }

  bindGeoLocationService(service) {
    if (!service || typeof service.subscribe !== "function") {
      this.renderGeoSnapshot({
        status: "unsupported",
        issue: "unsupported",
        position: null,
        watchActive: false,
        requestPending: false
      });
      return;
    }

    const unsubscribe = service.subscribe((snapshot) => {
      this.renderGeoSnapshot(snapshot);
    });

    this.cleanupCallbacks.push(() => {
      unsubscribe();
    });
  }

  bindSensorFusion(service) {
    if (!service || typeof service.subscribe !== "function") {
      this.renderSensorSnapshot(createSensorSnapshotDefaults());
      return;
    }

    const unsubscribe = service.subscribe((snapshot) => {
      this.renderSensorSnapshot(snapshot);
    });

    this.cleanupCallbacks.push(() => {
      unsubscribe();
    });
  }

  bindButton(button, handler) {
    if (!button || typeof handler !== "function") {
      return;
    }

    button.addEventListener("click", handler);
    this.cleanupCallbacks.push(() => button.removeEventListener("click", handler));
  }

  async runStartAction(handler) {
    if (typeof handler !== "function" || this.uiState.startActionPending) {
      return;
    }

    this.setStartActionPending(true);
    try {
      await handler();
    } finally {
      this.setStartActionPending(false);
    }
  }

  bindInput(input, handler) {
    if (!input || typeof handler !== "function") {
      return;
    }

    input.addEventListener("input", handler);
    this.cleanupCallbacks.push(() => input.removeEventListener("input", handler));
  }

  bindSelect(select, handler) {
    if (!select || typeof handler !== "function") {
      return;
    }

    select.addEventListener("change", handler);
    this.cleanupCallbacks.push(() => select.removeEventListener("change", handler));
  }

  bindCardToggleButtons() {
    for (const [cardKey, refs] of Object.entries(this.cardRefs)) {
      if (!refs.toggleButton) {
        continue;
      }

      const handler = () => {
        this.toggleCardCollapsed(cardKey);
      };

      refs.toggleButton.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => refs.toggleButton.removeEventListener("click", handler));
    }
  }

  bindMenuControls() {
    this.bindButton(this.menuButton, () => this.toggleMenu());
    this.bindButton(this.menuCloseButton, () => this.closeMenu());
    this.bindButton(this.openHelpCardButton, () => {
      this.openCard("help");
      this.closeMenu();
    });
    this.bindButton(this.openSurveyCardButton, () => this.toggleMenuCard("survey"));
    this.bindButton(this.openSettingsCardButton, () => {
      this.openCard("settings");
      this.closeMenu();
    });

    for (const tabButton of this.menuTabButtons) {
      const handler = () => {
        const tabKey = tabButton.dataset.menuTab || "placement";
        if (tabKey === ACTION_MENU_TABS.help || tabKey === ACTION_MENU_TABS.survey || tabKey === ACTION_MENU_TABS.settings) {
          if (this.isUserMode() && !USER_MODE_ALLOWED_ACTION_TABS.includes(tabKey)) {
            return;
          }
          if (tabKey === ACTION_MENU_TABS.survey) {
            this.toggleMenuCard(tabKey);
            return;
          }
          this.openCard(tabKey);
          this.closeMenu();
          return;
        }

        this.setActiveMenuTab(tabKey);
      };

      tabButton.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => tabButton.removeEventListener("click", handler));
    }

    for (const toggle of this.cardVisibilityToggles) {
      const handler = () => {
        this.setCardVisibility(toggle.dataset.cardVisibilityToggle, toggle.checked);
      };

      toggle.addEventListener("change", handler);
      this.cleanupCallbacks.push(() => toggle.removeEventListener("change", handler));
    }

    if (this.menuOverlay) {
      const handler = (event) => {
        if (event.target === this.menuOverlay) {
          this.closeMenu();
        }
      };

      this.menuOverlay.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => this.menuOverlay.removeEventListener("click", handler));
    }
  }

  bindLanguageControls() {
    for (const [language, button] of Object.entries(this.languageButtons)) {
      if (!button) {
        continue;
      }

      const handler = () => {
        this.setLanguage(language);
      };

      button.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => button.removeEventListener("click", handler));
    }
  }

  bindTextInputActivity() {
    const inputs = [this.geoTargetInputs.latitude, this.geoTargetInputs.longitude].filter(Boolean);
    for (const input of inputs) {
      const handleFocus = () => {
        this.clearPendingTextInputRelease();
        this.setTextInputActive(true);
      };
      const handleBlur = () => {
        this.scheduleTextInputRelease();
      };

      input.addEventListener("focus", handleFocus);
      input.addEventListener("blur", handleBlur);

      this.cleanupCallbacks.push(() => input.removeEventListener("focus", handleFocus));
      this.cleanupCallbacks.push(() => input.removeEventListener("blur", handleBlur));
    }
  }

  bindInteractionSurface(surface) {
    if (!surface) {
      return;
    }

    const handleTouchStart = (event) => {
      event.stopPropagation();
      this.beginUIInteraction();
    };
    const handleTouchEnd = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handleTouchCancel = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handlePointerDown = (event) => {
      event.stopPropagation();
      this.beginUIInteraction();
    };
    const handlePointerUp = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handlePointerCancel = (event) => {
      event.stopPropagation();
      this.scheduleUIInteractionRelease();
    };
    const handleClick = (event) => {
      event.stopPropagation();
    };

    surface.addEventListener("touchstart", handleTouchStart, { passive: false });
    surface.addEventListener("touchend", handleTouchEnd);
    surface.addEventListener("touchcancel", handleTouchCancel);
    surface.addEventListener("pointerdown", handlePointerDown);
    surface.addEventListener("pointerup", handlePointerUp);
    surface.addEventListener("pointercancel", handlePointerCancel);
    surface.addEventListener("click", handleClick);

    this.cleanupCallbacks.push(() => surface.removeEventListener("touchstart", handleTouchStart));
    this.cleanupCallbacks.push(() => surface.removeEventListener("touchend", handleTouchEnd));
    this.cleanupCallbacks.push(() => surface.removeEventListener("touchcancel", handleTouchCancel));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointerdown", handlePointerDown));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointerup", handlePointerUp));
    this.cleanupCallbacks.push(() => surface.removeEventListener("pointercancel", handlePointerCancel));
    this.cleanupCallbacks.push(() => surface.removeEventListener("click", handleClick));
  }

  beginUIInteraction() {
    this.clearPendingUIInteractionRelease();
    this.setUIInteracting(true);
  }

  scheduleUIInteractionRelease() {
    this.clearPendingUIInteractionRelease();
    this.uiInteractionReleaseTimeoutId = window.setTimeout(() => {
      this.uiInteractionReleaseTimeoutId = null;
      this.setUIInteracting(false);
    }, 50);
  }

  clearPendingUIInteractionRelease() {
    if (this.uiInteractionReleaseTimeoutId !== null) {
      window.clearTimeout(this.uiInteractionReleaseTimeoutId);
      this.uiInteractionReleaseTimeoutId = null;
    }
  }

  scheduleTextInputRelease() {
    this.clearPendingTextInputRelease();
    this.textInputReleaseTimeoutId = window.setTimeout(() => {
      this.textInputReleaseTimeoutId = null;
      this.setTextInputActive(false);
    }, 50);
  }

  clearPendingTextInputRelease() {
    if (this.textInputReleaseTimeoutId !== null) {
      window.clearTimeout(this.textInputReleaseTimeoutId);
      this.textInputReleaseTimeoutId = null;
    }
  }

  setTextInputActive(active) {
    const nextValue = Boolean(active);
    if (this.textInputActive === nextValue) {
      return;
    }

    this.textInputActive = nextValue;
    if (this.textInputActiveChangeHandler) {
      this.textInputActiveChangeHandler(nextValue);
    }
  }

  getCanvasElement() {
    return this.document.getElementById("ar-canvas");
  }

  syncCanvasPointerEvents() {
    const canvas = this.getCanvasElement();
    if (!canvas) {
      return;
    }

    canvas.style.pointerEvents = this.uiInteracting ? "none" : "auto";
  }

  bindDeviceCoordinateCopy() {
    if (this.geoCopyTriggers.length === 0) {
      return;
    }

    const handleCopy = () => {
      this.copyDeviceCoordinatesToTargetInputs();
    };

    for (const trigger of this.geoCopyTriggers) {
      trigger.addEventListener("click", handleCopy);
      this.cleanupCallbacks.push(() => trigger.removeEventListener("click", handleCopy));
    }
  }

  bindUIModeControls() {
    if (this.uiModeUserButton) {
      const toUser = () => {
        this.setUIMode(UI_MODE.USER);
      };
      this.uiModeUserButton.addEventListener("click", toUser);
      this.cleanupCallbacks.push(() => this.uiModeUserButton.removeEventListener("click", toUser));
    }

    if (this.uiModeDeveloperButton) {
      const toDeveloper = () => {
        this.setUIMode(UI_MODE.DEVELOPER);
      };
      this.uiModeDeveloperButton.addEventListener("click", toDeveloper);
      this.cleanupCallbacks.push(() => this.uiModeDeveloperButton.removeEventListener("click", toDeveloper));
    }
  }

  bindGeoOffsetControls({ onGeoOffsetToggle, onGeoOffsetChange, onGeoOffsetAdopt, onGeoOffsetReset } = {}) {
    const changeHandler = typeof onGeoOffsetChange === "function" ? onGeoOffsetChange : onGeoOffsetToggle;

    if (this.geoOffsetRefs.enabled) {
      const handleToggle = () => {
        this.handleGeoOffsetToggle(changeHandler);
      };
      this.geoOffsetRefs.enabled.addEventListener("change", handleToggle);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.enabled.removeEventListener("change", handleToggle));
    }

    if (this.geoOffsetRefs.siteCalibrationEnabled) {
      const handleSiteCalibrationToggle = () => {
        this.handleGeoSiteCalibrationToggle(changeHandler);
      };
      this.geoOffsetRefs.siteCalibrationEnabled.addEventListener("change", handleSiteCalibrationToggle);
      this.cleanupCallbacks.push(() =>
        this.geoOffsetRefs.siteCalibrationEnabled.removeEventListener("change", handleSiteCalibrationToggle)
      );
    }

    if (this.geoOffsetRefs.eastRange) {
      const handleEastInput = () => {
        this.handleGeoOffsetRangeInput(changeHandler);
      };
      this.geoOffsetRefs.eastRange.addEventListener("input", handleEastInput);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.eastRange.removeEventListener("input", handleEastInput));
    }

    if (this.geoOffsetRefs.northRange) {
      const handleNorthInput = () => {
        this.handleGeoOffsetRangeInput(changeHandler);
      };
      this.geoOffsetRefs.northRange.addEventListener("input", handleNorthInput);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.northRange.removeEventListener("input", handleNorthInput));
    }

    if (this.geoOffsetRefs.scaleEnabled) {
      const handleScaleToggle = () => {
        this.handleGeoScaleToggle(changeHandler);
      };
      this.geoOffsetRefs.scaleEnabled.addEventListener("change", handleScaleToggle);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.scaleEnabled.removeEventListener("change", handleScaleToggle));
    }

    if (this.geoOffsetRefs.scaleRange) {
      const handleScaleInput = () => {
        this.handleGeoScaleRangeInput(changeHandler);
      };
      this.geoOffsetRefs.scaleRange.addEventListener("input", handleScaleInput);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.scaleRange.removeEventListener("input", handleScaleInput));
    }

    if (this.geoOffsetRefs.rotationEnabled) {
      const handleRotationToggle = () => {
        this.handleGeoRotationToggle(changeHandler);
      };
      this.geoOffsetRefs.rotationEnabled.addEventListener("change", handleRotationToggle);
      this.cleanupCallbacks.push(() =>
        this.geoOffsetRefs.rotationEnabled.removeEventListener("change", handleRotationToggle)
      );
    }

    if (this.geoOffsetRefs.rotationRange) {
      const handleRotationInput = () => {
        this.handleGeoRotationRangeInput(changeHandler);
      };
      this.geoOffsetRefs.rotationRange.addEventListener("input", handleRotationInput);
      this.cleanupCallbacks.push(() =>
        this.geoOffsetRefs.rotationRange.removeEventListener("input", handleRotationInput)
      );
    }

    if (this.geoOffsetRefs.adoptButton) {
      const handleAdopt = () => {
        this.handleGeoOffsetAdopt(onGeoOffsetAdopt);
      };
      this.geoOffsetRefs.adoptButton.addEventListener("click", handleAdopt);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.adoptButton.removeEventListener("click", handleAdopt));
    }

    if (this.geoOffsetRefs.resetButton) {
      const handleReset = () => {
        this.handleGeoOffsetReset(onGeoOffsetReset);
      };
      this.geoOffsetRefs.resetButton.addEventListener("click", handleReset);
      this.cleanupCallbacks.push(() => this.geoOffsetRefs.resetButton.removeEventListener("click", handleReset));
    }
  }

  updateGeoOffsetDraftFromInputs() {
    const eastMeters = clampGeoOffset(
      this.geoOffsetRefs.eastRange ? Number.parseFloat(this.geoOffsetRefs.eastRange.value) : this.geoOffsetDraft.eastMeters
    );
    const northMeters = clampGeoOffset(
      this.geoOffsetRefs.northRange
        ? Number.parseFloat(this.geoOffsetRefs.northRange.value)
        : this.geoOffsetDraft.northMeters
    );
    const scaleFactor = clampGeoScaleFactor(
      this.geoOffsetRefs.scaleRange
        ? Number.parseFloat(this.geoOffsetRefs.scaleRange.value)
        : this.geoOffsetDraft.scaleFactor
    );
    const rotationDeg = normalizeRotationDeg(
      this.geoOffsetRefs.rotationRange
        ? Number.parseFloat(this.geoOffsetRefs.rotationRange.value)
        : this.geoOffsetDraft.rotationDeg
    );

    this.geoOffsetDraft = {
      ...this.geoOffsetDraft,
      eastMeters,
      northMeters,
      scaleFactor,
      rotationDeg
    };
  }

  handleGeoOffsetToggle(handler) {
    const enabled = this.geoOffsetRefs.enabled ? Boolean(this.geoOffsetRefs.enabled.checked) : false;
    this.geoOffsetDraft = {
      ...this.geoOffsetDraft,
      enabled
    };
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoSiteCalibrationToggle(handler) {
    const useSiteCalibration = this.geoOffsetRefs.siteCalibrationEnabled
      ? Boolean(this.geoOffsetRefs.siteCalibrationEnabled.checked)
      : true;
    this.geoOffsetDraft = {
      ...this.geoOffsetDraft,
      useSiteCalibration
    };
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoScaleToggle(handler) {
    const scaleEnabled = this.geoOffsetRefs.scaleEnabled ? Boolean(this.geoOffsetRefs.scaleEnabled.checked) : false;
    this.geoOffsetDraft = {
      ...this.geoOffsetDraft,
      scaleEnabled
    };
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoRotationToggle(handler) {
    const rotationEnabled = this.geoOffsetRefs.rotationEnabled
      ? Boolean(this.geoOffsetRefs.rotationEnabled.checked)
      : false;
    this.geoOffsetDraft = {
      ...this.geoOffsetDraft,
      rotationEnabled
    };
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoOffsetRangeInput(handler) {
    this.updateGeoOffsetDraftFromInputs();
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoScaleRangeInput(handler) {
    this.updateGeoOffsetDraftFromInputs();
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoRotationRangeInput(handler) {
    this.updateGeoOffsetDraftFromInputs();
    this.renderGeoOffsetControls();

    if (typeof handler === "function") {
      handler(this.getGeoOffsetControlState());
    }
  }

  handleGeoOffsetReset(handler) {
    const resetState =
      typeof handler === "function"
        ? handler() || {
            useSiteCalibration: true,
            enabled: false,
            eastMeters: 0,
            northMeters: 0,
            scaleEnabled: false,
            scaleFactor: 1,
            rotationEnabled: false,
            rotationDeg: 0
          }
        : {
            useSiteCalibration: true,
            enabled: false,
            eastMeters: 0,
            northMeters: 0,
            scaleEnabled: false,
            scaleFactor: 1,
            rotationEnabled: false,
            rotationDeg: 0
          };
    this.setGeoOffsetControlState(resetState);
  }

  handleGeoOffsetAdopt(handler) {
    if (typeof handler !== "function") {
      return;
    }

    const nextState = handler(this.getGeoOffsetControlState());
    if (nextState && typeof nextState === "object") {
      this.setGeoOffsetControlState(nextState);
    }
  }

  setGeoOffsetControlState(state = {}) {
    const nextState = {
      useSiteCalibration:
        typeof state.useSiteCalibration === "boolean"
          ? state.useSiteCalibration
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.useSiteCalibration
            : true,
      enabled:
        typeof state.enabled === "boolean"
          ? state.enabled
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.enabled
            : false,
      eastMeters:
        state.eastMeters != null
          ? clampGeoOffset(Number.parseFloat(state.eastMeters))
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.eastMeters
            : 0,
      northMeters:
        state.northMeters != null
          ? clampGeoOffset(Number.parseFloat(state.northMeters))
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.northMeters
            : 0,
      scaleEnabled:
        typeof state.scaleEnabled === "boolean"
          ? state.scaleEnabled
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.scaleEnabled
            : false,
      scaleFactor:
        state.scaleFactor != null
          ? clampGeoScaleFactor(Number.parseFloat(state.scaleFactor))
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.scaleFactor
            : 1,
      rotationEnabled:
        typeof state.rotationEnabled === "boolean"
          ? state.rotationEnabled
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.rotationEnabled
            : false,
      rotationDeg:
        state.rotationDeg != null
          ? normalizeRotationDeg(Number.parseFloat(state.rotationDeg))
          : this.geoOffsetDraft
            ? this.geoOffsetDraft.rotationDeg
            : 0
    };

    this.geoOffsetDraft = nextState;
    this.renderGeoOffsetControls();
  }

  getGeoOffsetControlState() {
    return {
      useSiteCalibration: this.geoOffsetDraft.useSiteCalibration !== false,
      enabled: Boolean(this.geoOffsetDraft.enabled),
      eastMeters: clampGeoOffset(this.geoOffsetDraft.eastMeters),
      northMeters: clampGeoOffset(this.geoOffsetDraft.northMeters),
      scaleEnabled: Boolean(this.geoOffsetDraft.scaleEnabled),
      scaleFactor: clampGeoScaleFactor(this.geoOffsetDraft.scaleFactor),
      rotationEnabled: Boolean(this.geoOffsetDraft.rotationEnabled),
      rotationDeg: normalizeRotationDeg(this.geoOffsetDraft.rotationDeg)
    };
  }

  formatGeoOffsetValue(value) {
    const unit = this.getText().offset.unit || "m";
    return `${clampGeoOffset(value).toFixed(1)} ${unit}`;
  }

  formatGeoScaleValue(value) {
    const unit = this.getText().offset.scaleUnit || "x";
    return `${unit}${clampGeoScaleFactor(value).toFixed(2)}`;
  }

  formatGeoRotationValue(value) {
    const unit = this.getText().offset.rotationUnit || "deg";
    return `${Math.round(normalizeRotationDeg(value))} ${unit}`;
  }

  renderGeoOffsetControls() {
    const disabled = !this.geoOffsetDraft.enabled;
    const scaleDisabled = !this.geoOffsetDraft.scaleEnabled;
    const rotationDisabled = !this.geoOffsetDraft.rotationEnabled;

    if (this.geoOffsetRefs.siteCalibrationEnabled) {
      this.geoOffsetRefs.siteCalibrationEnabled.checked = this.geoOffsetDraft.useSiteCalibration !== false;
    }

    if (this.geoOffsetRefs.enabled) {
      this.geoOffsetRefs.enabled.checked = this.geoOffsetDraft.enabled;
    }

    if (this.geoOffsetRefs.eastRange) {
      this.geoOffsetRefs.eastRange.value = this.geoOffsetDraft.eastMeters.toFixed(1);
      this.geoOffsetRefs.eastRange.disabled = disabled;
    }

    if (this.geoOffsetRefs.northRange) {
      this.geoOffsetRefs.northRange.value = this.geoOffsetDraft.northMeters.toFixed(1);
      this.geoOffsetRefs.northRange.disabled = disabled;
    }

    if (this.geoOffsetRefs.scaleEnabled) {
      this.geoOffsetRefs.scaleEnabled.checked = this.geoOffsetDraft.scaleEnabled;
    }

    if (this.geoOffsetRefs.scaleRange) {
      this.geoOffsetRefs.scaleRange.value = this.geoOffsetDraft.scaleFactor.toFixed(2);
      this.geoOffsetRefs.scaleRange.disabled = scaleDisabled;
    }

    if (this.geoOffsetRefs.rotationEnabled) {
      this.geoOffsetRefs.rotationEnabled.checked = this.geoOffsetDraft.rotationEnabled;
    }

    if (this.geoOffsetRefs.rotationRange) {
      this.geoOffsetRefs.rotationRange.value = `${Math.round(this.geoOffsetDraft.rotationDeg)}`;
      this.geoOffsetRefs.rotationRange.disabled = rotationDisabled;
    }

    if (this.geoOffsetRefs.eastValue) {
      this.geoOffsetRefs.eastValue.textContent = this.formatGeoOffsetValue(this.geoOffsetDraft.eastMeters);
    }

    if (this.geoOffsetRefs.northValue) {
      this.geoOffsetRefs.northValue.textContent = this.formatGeoOffsetValue(this.geoOffsetDraft.northMeters);
    }

    if (this.geoOffsetRefs.scaleValue) {
      this.geoOffsetRefs.scaleValue.textContent = this.formatGeoScaleValue(this.geoOffsetDraft.scaleFactor);
    }

    if (this.geoOffsetRefs.rotationValue) {
      this.geoOffsetRefs.rotationValue.textContent = this.formatGeoRotationValue(this.geoOffsetDraft.rotationDeg);
    }
  }

  setMenuOpen(open) {
    this.uiState.menuOpen = Boolean(open);
    this.applyMenuState();
  }

  toggleMenu() {
    this.setMenuOpen(!this.uiState.menuOpen);
  }

  closeMenu() {
    this.setMenuOpen(false);
  }

  applyMenuState() {
    if (this.menuOverlay) {
      this.menuOverlay.hidden = !this.uiState.menuOpen;
    }

    if (this.menuButton) {
      this.menuButton.setAttribute("aria-expanded", String(this.uiState.menuOpen));
      this.menuButton.setAttribute(
        "aria-label",
        this.toDisplayText(this.uiState.menuOpen ? this.getText().aria.menuClose : this.getText().aria.menuOpen)
      );
    }

    if (this.menuCloseButton) {
      this.menuCloseButton.setAttribute("aria-label", this.toDisplayText(this.getText().aria.menuClose));
    }
  }

  setActiveMenuTab(tabKey) {
    this.uiState.activeMenuTab = tabKey;
    this.applyMenuTabState();
  }

  applyMenuTabState() {
    for (const tabButton of this.menuTabButtons) {
      const isActive = tabButton.dataset.menuTab === this.uiState.activeMenuTab;
      tabButton.dataset.active = isActive ? "true" : "false";
      tabButton.setAttribute("aria-selected", String(isActive));
    }

    for (const tabPanel of this.menuTabPanels) {
      tabPanel.hidden = tabPanel.dataset.menuPanel !== this.uiState.activeMenuTab;
    }
  }

  applyAllCardStates() {
    for (const cardKey of Object.keys(this.cardRefs)) {
      this.applyCardVisibility(cardKey);
      this.applyCardCollapse(cardKey);
      this.syncCardVisibilityToggle(cardKey);
    }
  }

  setUIMode(mode) {
    const nextMode = mode === UI_MODE.USER ? UI_MODE.USER : UI_MODE.DEVELOPER;
    if (nextMode === this.uiState.uiMode) {
      this.updateUIModeButtons();
      this.applyUIModeLayout();
      return;
    }

    if (nextMode === UI_MODE.USER) {
      this.developerCardVisibilitySnapshot = { ...this.uiState.cardVisibility };
    }

    this.uiState.uiMode = nextMode;
    this.persistUIMode(nextMode);
    this.applyUIModeLayout();
  }

  updateUIModeButtons() {
    const isUser = this.isUserMode();

    if (this.uiModeUserButton) {
      this.uiModeUserButton.dataset.active = isUser ? "true" : "false";
      this.uiModeUserButton.setAttribute("aria-pressed", String(isUser));
    }

    if (this.uiModeDeveloperButton) {
      const isDeveloper = !isUser;
      this.uiModeDeveloperButton.dataset.active = isDeveloper ? "true" : "false";
      this.uiModeDeveloperButton.setAttribute("aria-pressed", String(isDeveloper));
    }
  }

  applyUIModeLayout() {
    const isUser = this.isUserMode();
    if (this.document.body) {
      this.document.body.setAttribute("data-ui-mode", isUser ? "user" : "developer");
    }

    if (isUser) {
      for (const cardKey of Object.keys(this.cardRefs)) {
        this.uiState.cardVisibility[cardKey] = USER_MODE_VISIBLE_CARDS.includes(cardKey);
      }
      for (const key of USER_MODE_VISIBLE_CARDS) {
        this.uiState.cardCollapsed[key] = false;
      }

      if (this.experienceModeField) {
        this.experienceModeField.hidden = true;
      }

      if (this.modeSelect) {
        this.modeSelect.hidden = true;
      }

      if (this.placementModeField) {
        this.placementModeField.hidden = true;
      }

      if (this.placeButton) {
        this.placeButton.hidden = true;
      }
      if (this.resetButton) {
        this.resetButton.hidden = true;
      }
      if (this.stopButton) {
        this.stopButton.hidden = true;
      }
      for (const toggle of this.cardVisibilityToggles) {
        toggle.disabled = true;
        toggle.checked = false;
        const toggleOption = toggle.closest(".menu-option");
        if (toggleOption) {
          toggleOption.hidden = true;
        }
      }

      if (this.staticRefs.menuTabs.developer) {
        this.staticRefs.menuTabs.developer.hidden = true;
      }
      if (this.staticRefs.menuTabs.help) {
        this.staticRefs.menuTabs.help.hidden = true;
      }
      if (this.staticRefs.menuTabs.survey) {
        this.staticRefs.menuTabs.survey.hidden = true;
      }
      if (this.staticRefs.menuTabs.settings) {
        this.staticRefs.menuTabs.settings.hidden = true;
      }
      if (this.staticRefs.menuTabList) {
        this.staticRefs.menuTabList.hidden = true;
      }
      if (this.menuCloseButton) {
        this.menuCloseButton.hidden = true;
      }

      if (this.uiState.activeMenuTab !== "placement") {
        this.setActiveMenuTab("placement");
      }
    } else {
      const fallbackVisibility = { ...DEFAULT_CARD_VISIBILITY };
      const nextVisibility = this.developerCardVisibilitySnapshot || fallbackVisibility;
      for (const cardKey of Object.keys(this.cardRefs)) {
        this.uiState.cardVisibility[cardKey] = Boolean(nextVisibility[cardKey]);
      }

      if (this.experienceModeField) {
        this.experienceModeField.hidden = false;
      }

      if (this.modeSelect) {
        this.modeSelect.hidden = false;
      }

      if (this.placementModeField) {
        this.placementModeField.hidden = false;
      }

      if (this.placeButton) {
        this.placeButton.hidden = false;
      }
      if (this.resetButton) {
        this.resetButton.hidden = false;
      }
      if (this.stopButton) {
        this.stopButton.hidden = false;
      }

      for (const toggle of this.cardVisibilityToggles) {
        toggle.disabled = false;
        const toggleOption = toggle.closest(".menu-option");
        if (toggleOption) {
          toggleOption.hidden = false;
        }
      }

      if (this.staticRefs.menuTabs.developer) {
        this.staticRefs.menuTabs.developer.hidden = false;
      }
      if (this.staticRefs.menuTabs.help) {
        this.staticRefs.menuTabs.help.hidden = false;
      }
      if (this.staticRefs.menuTabs.survey) {
        this.staticRefs.menuTabs.survey.hidden = false;
      }
      if (this.staticRefs.menuTabs.settings) {
        this.staticRefs.menuTabs.settings.hidden = false;
      }
      if (this.staticRefs.menuTabList) {
        this.staticRefs.menuTabList.hidden = false;
      }
      if (this.menuCloseButton) {
        this.menuCloseButton.hidden = false;
      }
    }

    this.updateUIModeButtons();
    this.applyAllCardStates();
    this.updateMiniSummaryLayout();
    this.updateUserModeActions();
    this.renderModeSpecificCopy();
    this.renderExperienceModeUI();
    this.renderHelpCopy();
    this.refreshButtons();
  }

  setCardVisibility(cardKey, visible) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardVisibility, cardKey)) {
      return;
    }

    this.uiState.cardVisibility[cardKey] = Boolean(visible);
    this.applyCardVisibility(cardKey);
    this.syncCardVisibilityToggle(cardKey);
  }

  applyCardVisibility(cardKey) {
    const refs = this.cardRefs[cardKey];
    if (!refs || !refs.root) {
      return;
    }

    refs.root.hidden = !this.uiState.cardVisibility[cardKey];
  }

  syncCardVisibilityToggle(cardKey) {
    for (const toggle of this.cardVisibilityToggles) {
      if (toggle.dataset.cardVisibilityToggle === cardKey) {
        toggle.checked = Boolean(this.uiState.cardVisibility[cardKey]);
      }
    }
  }

  toggleCardCollapsed(cardKey) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardCollapsed, cardKey)) {
      return;
    }

    this.setCardCollapsed(cardKey, !this.uiState.cardCollapsed[cardKey]);
  }

  setCardCollapsed(cardKey, collapsed) {
    if (!Object.prototype.hasOwnProperty.call(this.uiState.cardCollapsed, cardKey)) {
      return;
    }

    this.uiState.cardCollapsed[cardKey] = Boolean(collapsed);
    this.applyCardCollapse(cardKey);
  }

  applyCardCollapse(cardKey) {
    const refs = this.cardRefs[cardKey];
    if (!refs) {
      return;
    }

    const collapsed = Boolean(this.uiState.cardCollapsed[cardKey]);
    if (refs.root) {
      refs.root.classList.toggle("is-collapsed", collapsed);
    }

    if (refs.content) {
      refs.content.hidden = collapsed;
    }

    if (refs.toggleButton) {
      refs.toggleButton.setAttribute("aria-expanded", String(!collapsed));
      refs.toggleButton.setAttribute("aria-label", this.toDisplayText(this.getText().aria.toggleButtons[cardKey] || ""));
    }

    if (refs.toggleIcon) {
      refs.toggleIcon.textContent = collapsed ? "+" : "-";
    }
  }

  openCard(cardKey) {
    if (cardKey === ACTION_MENU_TABS.survey) {
      this.ensureSurveyEmbedLoaded();
    }
    this.setCardVisibility(cardKey, true);
    this.setCardCollapsed(cardKey, false);
  }

  closeCard(cardKey) {
    this.setCardVisibility(cardKey, false);
  }

  setStartActionPending(pending) {
    this.uiState.startActionPending = Boolean(pending);
    if (this.startButton) {
      this.startButton.dataset.loading = pending ? "true" : "false";
      this.startButton.setAttribute("aria-busy", String(Boolean(pending)));
    }
    this.refreshButtons();
  }

  toggleMenuCard(cardKey) {
    if (this.uiState.cardVisibility[cardKey]) {
      this.closeCard(cardKey);
    } else {
      this.openCard(cardKey);
    }
    this.closeMenu();
  }

  ensureSurveyEmbedLoaded() {
    const tallySrc = "https://tally.so/widgets/embed.js";
    const view = this.document.defaultView;
    if (!view) {
      return;
    }

    const loadEmbeds = () => {
      if (view.Tally && typeof view.Tally.loadEmbeds === "function") {
        view.Tally.loadEmbeds();
        return;
      }

      this.document.querySelectorAll("iframe[data-tally-src]:not([src])").forEach((iframe) => {
        const nextSrc = iframe.dataset.tallySrc;
        if (nextSrc) {
          iframe.src = nextSrc;
        }
      });
    };

    if (view.Tally && typeof view.Tally.loadEmbeds === "function") {
      loadEmbeds();
      return;
    }

    if (this.document.querySelector(`script[src="${tallySrc}"]`)) {
      loadEmbeds();
      return;
    }

    const script = this.document.createElement("script");
    script.src = tallySrc;
    script.onload = loadEmbeds;
    script.onerror = loadEmbeds;
    this.document.body?.appendChild(script);
  }

  setLanguage(language) {
    const nextLanguage = SUPPORTED_LANGUAGES.has(language) ? language : "de";
    if (this.uiState.language === nextLanguage) {
      this.updateLanguageButtons();
      return;
    }

    this.uiState.language = nextLanguage;
    this.applyStaticTexts();
    this.applyMenuState();
    this.applyMenuTabState();
    this.applyAllCardStates();
    this.refreshButtons();
  }

  applyStaticTexts() {
    const text = this.getText();
    this.document.documentElement.lang = text.languageCode;

    this.setElementText(this.staticRefs.menuEyebrow, text.menu.eyebrow);
    this.setElementText(this.staticRefs.menuTitle, text.menu.title);
    this.setElementText(this.staticRefs.menuTabs.placement, text.menu.tabs.placement);
    this.setElementText(this.staticRefs.menuTabs.developer, text.menu.tabs.developer);
    this.setElementText(this.staticRefs.menuTabs.help, text.menu.tabs.help);
    this.setElementText(this.staticRefs.menuTabs.survey, text.menu.tabs.survey);
    this.setElementText(this.staticRefs.menuTabs.settings, text.menu.tabs.settings);
    this.renderModeSpecificCopy(text);
    this.setElementText(this.staticRefs.menuCopies.developer, text.menu.developerCopy);
    this.setElementText(this.staticRefs.menuCopies.help, text.menu.helpCopy);
    this.setElementText(this.staticRefs.menuCopies.survey, text.menu.surveyCopy);
    this.setElementText(this.staticRefs.menuCopies.settings, text.menu.settingsCopy);
    this.setElementText(this.staticRefs.menuUiModeLabel, text.menu.uiModeLabel);
    this.setElementText(this.uiModeUserButton, text.menu.uiModes.user);
    this.setElementText(this.uiModeDeveloperButton, text.menu.uiModes.developer);
    this.setElementText(this.openHelpCardButton, text.menu.openHelp);
    this.setElementText(this.openSurveyCardButton, text.menu.openSurvey);
    this.setElementText(this.openSettingsCardButton, text.menu.openSettings);
    this.setElementText(this.userMenuResetButton, text.menu.userResetPlacement);
    this.setElementText(this.userMenuSurveyButton, text.menu.userSurveyAction);
    this.setElementText(this.userToolbarStopButton, text.menu.userStopAr);
    this.setElementText(this.staticRefs.geoHeadingReferenceToggleLabel, text.menu.developerOptions.geoHeadingReference);
    this.setElementText(
      this.staticRefs.geoHeadingReferenceToggleDescription,
      text.menu.developerOptions.geoHeadingReferenceDescription
    );
    this.setElementText(this.staticRefs.menuVisibilityLabels.placement, text.menu.visibility.placement);
    this.setElementText(this.staticRefs.menuVisibilityLabels.coord, text.menu.visibility.coord);
    this.setElementText(this.staticRefs.menuVisibilityLabels.state, text.menu.visibility.state);
    this.setElementText(this.staticRefs.menuVisibilityLabels.note, text.menu.visibility.note);
    this.setElementText(this.staticRefs.menuVisibilityLabels.geo, text.menu.visibility.geo);
    this.setElementText(this.staticRefs.menuVisibilityLabels.offset, text.menu.visibility.offset);
    this.setElementText(this.staticRefs.menuVisibilityLabels.debug, text.menu.visibility.debug);

    this.setElementText(this.staticRefs.placementEyebrow, text.placement.eyebrow);
    this.setElementText(this.staticRefs.placementTitle, text.placement.title);
    this.setElementText(this.staticRefs.placementModeLabel, text.placement.modeLabel);
    this.setElementText(this.userPlacementPopupTitle, text.placement.userGuideTitle);
    this.setElementText(this.geoActivateLocationButton, text.placement.buttons.activateLocation);
    this.setElementText(this.placeButton, text.placement.buttons.place);
    this.setElementText(this.resetButton, text.placement.buttons.reset);

    this.setElementText(this.staticRefs.welcomeTitle, text.welcome.title);
    this.setElementText(this.staticRefs.welcomeHeadline, text.welcome.headline);
    this.setElementText(this.staticRefs.welcomeSubheading, text.welcome.subheading);
    this.setListItems(this.staticRefs.welcomeList, text.welcome.items);

    this.setElementText(this.staticRefs.helpTitle, text.help.title);
    this.renderHelpCopy();

    this.setElementText(this.staticRefs.surveyTitle, text.survey.title);
    this.setElementText(this.staticRefs.surveyPlaceholderTitle, text.survey.placeholderTitle);
    this.setElementText(this.staticRefs.surveyPlaceholderText, text.survey.placeholderText);
    this.setElementText(this.staticRefs.surveyRecommendationTitle, text.survey.recommendationTitle);
    this.setElementText(this.staticRefs.surveyRecommendationText, text.survey.recommendationText);
    this.setToolList(this.staticRefs.surveyToolList, text.survey.tools);
    this.setElementText(this.staticRefs.surveyRequirementsTitle, text.survey.requirementsTitle);
    this.setListItems(this.staticRefs.surveyRequirementsList, text.survey.requirements);

    this.setElementText(this.staticRefs.settingsTitle, text.settings.title);
    this.setElementText(this.staticRefs.settingsLanguageTitle, text.settings.languageTitle);
    this.setElementText(this.staticRefs.settingsLanguageDescription, text.settings.languageDescription);
    this.setElementText(this.languageButtons.de, text.settings.languages.de);
    this.setElementText(this.languageButtons.en, text.settings.languages.en);

    this.setElementText(this.staticRefs.coordTitle, text.coord.title);
    this.setElementText(this.staticRefs.coordModeLabel, text.coord.modeLabel);
    this.setElementText(this.staticRefs.coordLatitudeLabel, text.coord.latitudeLabel);
    this.setElementText(this.staticRefs.coordLongitudeLabel, text.coord.longitudeLabel);
    this.setElementText(this.applyGeoTargetButton, text.coord.apply);

    this.setElementText(this.staticRefs.stateTitle, text.state.title);
    this.setElementText(this.getStateLabel("support"), text.state.labels.support);
    this.setElementText(this.getStateLabel("session"), text.state.labels.session);
    this.setElementText(this.getStateLabel("tracking"), text.state.labels.tracking);
    this.setElementText(this.getStateLabel("surface"), text.state.labels.surface);
    this.setElementText(this.getStateLabel("stability"), text.state.labels.stability);
    this.setElementText(this.getStateLabel("placement"), text.state.labels.placement);

    this.setElementText(this.staticRefs.noteTitle, text.note.title);
    this.setElementText(this.staticRefs.geoTitle, text.geo.title);
    this.setElementText(this.staticRefs.offsetTitle, text.offset.title);
    this.setElementText(this.staticRefs.offsetDescription, text.offset.description);
    this.setElementText(this.staticRefs.siteCalibrationToggleLabel, text.offset.siteCalibrationToggle);
    this.setElementText(this.staticRefs.offsetToggleLabel, text.offset.toggle);
    this.setElementText(this.staticRefs.offsetEastLabel, text.offset.eastLabel);
    this.setElementText(this.staticRefs.offsetNorthLabel, text.offset.northLabel);
    this.setElementText(this.staticRefs.scaleToggleLabel, text.offset.scaleToggle);
    this.setElementText(this.staticRefs.scaleLabel, text.offset.scaleLabel);
    this.setElementText(this.staticRefs.rotationToggleLabel, text.offset.rotationToggle);
    this.setElementText(this.staticRefs.rotationLabel, text.offset.rotationLabel);
    this.setElementText(this.geoOffsetRefs.adoptButton, text.offset.adoptAsSiteCalibration);
    this.setElementText(this.geoOffsetRefs.resetButton, text.offset.reset);
    this.setElementText(this.activateGeoButton, text.geo.buttons.location);
    this.setElementText(this.calibrateHeadingButton, text.geo.buttons.calibrate);
    this.setElementText(this.staticRefs.geoLabels.status, text.geo.labels.status);
    this.setElementText(this.staticRefs.geoLabels.latitude, text.geo.labels.latitude);
    this.setElementText(this.staticRefs.geoLabels.longitude, text.geo.labels.longitude);
    this.setElementText(this.staticRefs.geoLabels.accuracy, text.geo.labels.accuracy);
    this.setElementText(this.staticRefs.geoLabels.heading, text.geo.labels.heading);

    this.setElementText(this.staticRefs.debugTitle, text.debug.title);
    this.setElementText(this.staticRefs.debugTag, text.debug.tag);
    this.setElementText(this.staticRefs.debugLabels.originLatitude, text.debug.labels.originLatitude);
    this.setElementText(this.staticRefs.debugLabels.originLongitude, text.debug.labels.originLongitude);
    this.setElementText(this.staticRefs.debugLabels.targetLatitude, text.debug.labels.targetLatitude);
    this.setElementText(this.staticRefs.debugLabels.targetLongitude, text.debug.labels.targetLongitude);
    this.setElementText(this.staticRefs.debugLabels.deltaLatitude, text.debug.labels.deltaLatitude);
    this.setElementText(this.staticRefs.debugLabels.deltaLongitude, text.debug.labels.deltaLongitude);
    this.setElementText(this.staticRefs.debugLabels.xMeters, text.debug.labels.xMeters);
    this.setElementText(this.staticRefs.debugLabels.zMeters, text.debug.labels.zMeters);
    this.setElementText(this.staticRefs.debugLabels.distanceMeters, text.debug.labels.distanceMeters);
    this.setElementText(this.staticRefs.debugLabels.objectPlaced, text.debug.labels.objectPlaced);
    this.setElementText(this.staticRefs.debugLabels.distanceTooFar, text.debug.labels.distanceTooFar);
    this.setElementText(this.staticRefs.debugLabels.hasStableSurface, text.debug.labels.hasStableSurface);
    this.setElementText(this.staticRefs.debugLabels.objectBehindCamera, text.debug.labels.objectBehindCamera);

    if (this.experienceModeSelect) {
      const [xrOption, geoSensorOption] = this.experienceModeSelect.options;
      if (xrOption) {
        xrOption.textContent = this.toDisplayText(text.placement.modeOptions.xr);
      }
      if (geoSensorOption) {
        geoSensorOption.textContent = this.toDisplayText(text.placement.modeOptions.geoSensor);
      }
    }

    if (this.modeSelect) {
      const [freeOption, geoLocalOption, geoGlobalOption] = this.modeSelect.options;
      if (freeOption) {
        freeOption.textContent = this.toDisplayText(text.coord.options.free);
      }
      if (geoLocalOption) {
        geoLocalOption.textContent = this.toDisplayText(text.coord.options.geoLocal);
      }
      if (geoGlobalOption) {
        geoGlobalOption.textContent = this.toDisplayText(text.coord.options.geoGlobal);
      }
    }

    const settingsGroup = this.document.querySelector(".language-switch");
    if (settingsGroup) {
      settingsGroup.setAttribute("aria-label", this.toDisplayText(text.aria.languageGroup));
    }

    if (this.closeWelcomeButton) {
      this.closeWelcomeButton.setAttribute("aria-label", this.toDisplayText(text.aria.closeButtons.welcome));
    }
    if (this.closeHelpButton) {
      this.closeHelpButton.setAttribute("aria-label", this.toDisplayText(text.aria.closeButtons.help));
    }
    if (this.closeSurveyButton) {
      this.closeSurveyButton.setAttribute("aria-label", this.toDisplayText(text.aria.closeButtons.survey));
    }
    if (this.closeSettingsButton) {
      this.closeSettingsButton.setAttribute("aria-label", this.toDisplayText(text.aria.closeButtons.settings));
    }

    this.updateLanguageButtons();
    this.renderExperienceModeUI();
    this.renderPlacementModeUI();
    this.renderSystemStates();
    this.renderMessageText();
    this.renderHintText();
    this.updateUserPlacementPopup(text);
    this.renderGeoTargetFeedback();
    this.renderAssetLabel();
    this.renderGeoOffsetControls();
    this.renderGeoSnapshot(this.lastGeoSnapshot);
    this.renderSensorSnapshot(this.lastSensorSnapshot);
  }

  renderHelpCopy() {
    const text = this.getText();
    const helpSteps = this.isUserMode() ? text.help.userSteps : text.help.steps;
    this.setParagraphList(this.staticRefs.helpCopy, helpSteps);
  }

  renderModeSpecificCopy(text = this.getText()) {
    if (this.staticRefs.menuCopies.placement) {
      this.staticRefs.menuCopies.placement.textContent = this.toDisplayText(
        this.isUserMode() ? text.menu.userPlacementCopy : text.menu.placementCopy
      );
    }

    if (this.staticRefs.placementIntro) {
      this.staticRefs.placementIntro.textContent = this.toDisplayText(
        this.isUserMode() ? text.placement.userIntro : text.placement.intro
      );
    }

    this.updateUserPlacementPopup(text);
  }

  updateLanguageButtons() {
    for (const [language, button] of Object.entries(this.languageButtons)) {
      if (!button) {
        continue;
      }

      const isActive = this.uiState.language === language;
      button.dataset.active = isActive ? "true" : "false";
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  getStateLabel(key) {
    const ref = this.stateRefs[key];
    return ref && ref.item ? ref.item.querySelector(".state-label") : null;
  }

  toDisplayText(text) {
    return this.uiState.language === "de" ? normalizeGermanDisplayText(text) : text;
  }

  setElementText(element, text) {
    if (element) {
      element.textContent = this.toDisplayText(text);
    }
  }

  setListItems(listElement, items) {
    if (!listElement) {
      return;
    }

    const nextItems = Array.isArray(items) ? items : [];
    listElement.replaceChildren(
      ...nextItems.map((item) => {
        const li = this.document.createElement("li");
        li.textContent = this.toDisplayText(item);
        return li;
      })
    );
  }

  setParagraphList(container, items) {
    if (!container) {
      return;
    }

    const nextItems = Array.isArray(items) ? items : [];
    container.replaceChildren(
      ...nextItems.map((item) => {
        const paragraph = this.document.createElement("p");
        paragraph.textContent = this.toDisplayText(item);
        return paragraph;
      })
    );
  }

  setToolList(listElement, items) {
    if (!listElement) {
      return;
    }

    const nextItems = Array.isArray(items) ? items : [];
    listElement.replaceChildren(
      ...nextItems.map((item) => {
        const li = this.document.createElement("li");
        const strong = this.document.createElement("strong");
        strong.textContent = this.toDisplayText(`${item.name}: `);
        li.append(strong, this.toDisplayText(item.description));
        return li;
      })
    );
  }

  renderExperienceModeUI() {
    const text = this.getText();
    const experienceMode = this.uiState.experienceMode === "geo-sensor" ? "geo-sensor" : "xr";
    const isGeoSensorMode = experienceMode === "geo-sensor";

    if (this.experienceModeSelect) {
      this.experienceModeSelect.value = experienceMode;
    }

    if (this.startButton) {
      this.startButton.textContent = this.toDisplayText(
        isGeoSensorMode ? text.placement.buttons.startGeo : text.placement.buttons.startXR
      );
    }

    if (this.geoActivateLocationButton) {
      this.geoActivateLocationButton.hidden = !isGeoSensorMode;
      this.geoActivateLocationButton.textContent = this.toDisplayText(text.placement.buttons.activateLocation);
    }

    if (this.stopButton) {
      this.stopButton.textContent = this.toDisplayText(
        isGeoSensorMode ? text.placement.buttons.stopGeo : text.placement.buttons.stopXR
      );
    }
  }

  renderPlacementModeUI() {
    const text = this.getText();
    const mode =
      this.uiState.placementMode === "geo-local"
        ? "geo-local"
        : this.uiState.placementMode === "geo-global"
          ? "geo-global"
          : "free";

    if (this.modeSelect) {
      this.modeSelect.value = mode;
    }

    if (this.modeBadgeEl) {
      const badgeText =
        mode === "geo-local"
          ? text.coord.options.geoLocal
          : mode === "geo-global"
            ? text.coord.options.geoGlobal
            : text.coord.options.free;
      this.modeBadgeEl.textContent = this.toDisplayText(badgeText);
    }
  }

  setExperienceMode(mode) {
    this.uiState.experienceMode = mode === "geo-sensor" ? "geo-sensor" : "xr";
    this.renderExperienceModeUI();
    this.renderGeoSnapshot(this.lastGeoSnapshot);
    this.refreshButtons();
  }

  setAssetLabel(label) {
    this.rawUiText.assetLabel = label || "";
    this.renderAssetLabel();
  }

  renderAssetLabel() {
    if (this.assetNameEl) {
      this.assetNameEl.textContent = translateRuntimeText(this.rawUiText.assetLabel, this.uiState.language);
    }
  }

  setMessage(message) {
    this.rawUiText.message = message || "";
    this.renderMessageText();
  }

  renderMessageText() {
    if (this.messageEl) {
      this.messageEl.textContent = translateRuntimeText(this.rawUiText.message, this.uiState.language);
    }
  }

  setHint(message) {
    this.rawUiText.hint = message || "";
    this.renderHintText();
  }

  renderHintText() {
    if (this.hintEl) {
      this.hintEl.textContent = translateRuntimeText(this.rawUiText.hint, this.uiState.language);
    }
  }

  setPlacementMode(mode) {
    this.uiState.placementMode =
      mode === "geo-local" ? "geo-local" : mode === "geo-global" ? "geo-global" : "free";
    this.renderPlacementModeUI();
    this.refreshButtons();
  }

  handleGeoHeadingReferenceToggle(handler) {
    const enabled = this.geoHeadingReferenceToggle ? Boolean(this.geoHeadingReferenceToggle.checked) : false;
    const accepted = typeof handler === "function" ? handler(enabled) : true;

    if (accepted === false) {
      this.renderGeoHeadingReferenceControl();
      return;
    }

    this.uiState.geoHeadingReferenceEnabled = enabled;
    this.renderGeoHeadingReferenceControl();
  }

  setGeoHeadingReferenceEnabled(enabled) {
    this.uiState.geoHeadingReferenceEnabled = Boolean(enabled);
    this.renderGeoHeadingReferenceControl();
  }

  renderGeoHeadingReferenceControl() {
    if (!this.geoHeadingReferenceToggle) {
      return;
    }

    this.geoHeadingReferenceToggle.checked = Boolean(this.uiState.geoHeadingReferenceEnabled);
    this.geoHeadingReferenceToggle.disabled = Boolean(this.uiState.sessionActive);
  }

  setGeoTargetInputs(coord) {
    if (!coord) {
      return;
    }

    this.geoTargetDraft = {
      latitude: toEditableValue(coord.latitude),
      longitude: toEditableValue(coord.longitude)
    };

    if (this.geoTargetInputs.latitude) {
      this.geoTargetInputs.latitude.value = this.geoTargetDraft.latitude;
    }

    if (this.geoTargetInputs.longitude) {
      this.geoTargetInputs.longitude.value = this.geoTargetDraft.longitude;
    }
  }

  setGeoTargetFeedback(message) {
    this.rawUiText.geoTargetFeedback = message || "";
    this.renderGeoTargetFeedback();
  }

  renderGeoTargetFeedback() {
    if (!this.geoTargetFeedbackEl) {
      return;
    }

    const fallbackText = this.getText().coord.feedbackDefault;
    const feedbackText = this.rawUiText.geoTargetFeedback || fallbackText;
    this.geoTargetFeedbackEl.textContent = translateRuntimeText(feedbackText, this.uiState.language);
  }

  updateGeoTargetDraftFromInputs() {
    this.geoTargetDraft = {
      latitude: this.geoTargetInputs.latitude ? this.geoTargetInputs.latitude.value : "",
      longitude: this.geoTargetInputs.longitude ? this.geoTargetInputs.longitude.value : ""
    };
  }

  handleApplyGeoTarget(handler) {
    this.updateGeoTargetDraftFromInputs();

    const parsedCoord = {
      latitude: Number.parseFloat(this.geoTargetDraft.latitude),
      longitude: Number.parseFloat(this.geoTargetDraft.longitude)
    };

    if (
      !Number.isFinite(parsedCoord.latitude) ||
      !Number.isFinite(parsedCoord.longitude) ||
      parsedCoord.latitude < -90 ||
      parsedCoord.latitude > 90 ||
      parsedCoord.longitude < -180 ||
      parsedCoord.longitude > 180
    ) {
      this.setGeoTargetFeedback("Bitte gueltige Latitude- und Longitude-Werte eingeben.");
      return;
    }

    const result = typeof handler === "function" ? handler(parsedCoord) : false;
    if (result === false) {
      this.setGeoTargetFeedback("Koordinaten konnten nicht uebernommen werden.");
      return;
    }

    this.setGeoTargetInputs(parsedCoord);
    this.setGeoTargetFeedback("Koordinaten uebernommen. Sie greifen bei der naechsten Platzierung.");
  }

  handleExperienceModeChange(handler) {
    const nextMode = this.experienceModeSelect ? this.experienceModeSelect.value : "xr";
    const accepted = typeof handler === "function" ? handler(nextMode) : false;

    if (accepted === false) {
      this.setExperienceMode(this.uiState.experienceMode);
      return;
    }

    this.setExperienceMode(nextMode);
  }

  handleModeChange(handler) {
    const nextMode = this.modeSelect ? this.modeSelect.value : "free";
    const accepted = typeof handler === "function" ? handler(nextMode) : false;

    if (accepted === false) {
      this.setPlacementMode(this.uiState.placementMode);
      return;
    }

    this.setPlacementMode(nextMode);
  }

  setSupportState(available, detail) {
    this.uiState.supportAvailable = available;
    this.renderSystemStates();
    if (detail) {
      this.setMessage(detail);
    }
    this.refreshButtons();
  }

  setSessionState(active, detail) {
    this.uiState.sessionActive = active;
    this.document.body.classList.toggle("ar-active", active);

    if (detail) {
      this.setMessage(detail);
    }

    if (active) {
      this.closeMenu();
      if (!this.isUserMode()) {
        this.setCardVisibility("placement", true);
        this.setCardCollapsed("placement", false);
        this.setCardVisibility("coord", true);
        this.setCardCollapsed("coord", false);
        this.setCardVisibility("help", false);
      } else {
        this.setCardVisibility("placement", false);
      }
    } else if (this.isUserMode()) {
      this.setCardVisibility("placement", true);
      this.setCardCollapsed("placement", false);
    }

    this.renderSystemStates();
    this.refreshButtons();
    this.updateUserModeActions();
  }

  setTrackingState(active) {
    this.uiState.trackingActive = Boolean(active);
    this.renderSystemStates();
  }

  setSurfaceState(detected, stable) {
    this.uiState.surfaceDetected = Boolean(detected);
    this.uiState.stableSurface = Boolean(detected && stable);
    this.renderSystemStates();
    this.refreshButtons();
    this.updateUserPlacementPopup();
  }

  setPlacementState(placed) {
    this.uiState.placed = Boolean(placed);
    this.renderSystemStates();
    this.refreshButtons();
    this.updateUserPlacementPopup();
  }

  renderSystemStates() {
    const text = this.getText();

    const supportStatus =
      this.uiState.supportAvailable === null ? "idle" : this.uiState.supportAvailable ? "ok" : "error";
    const supportText =
      this.uiState.supportAvailable === null
        ? text.state.values.checking
        : this.uiState.supportAvailable
          ? text.state.values.available
          : text.state.values.unavailable;

    const sessionStatus = this.uiState.sessionActive ? "active" : "idle";
    const sessionText = this.uiState.sessionActive ? text.state.values.yes : text.state.values.no;

    const trackingStatus = this.uiState.trackingActive ? "ok" : "idle";
    const trackingText = this.uiState.trackingActive ? text.state.values.running : text.state.values.waiting;

    const surfaceStatus = this.uiState.surfaceDetected ? "warning" : "idle";
    const surfaceText = this.uiState.surfaceDetected ? text.state.values.detected : text.state.values.search;

    const stabilityStatus = this.uiState.stableSurface ? "ok" : this.uiState.surfaceDetected ? "warning" : "idle";
    const stabilityText = this.uiState.stableSurface
      ? text.state.values.stable
      : this.uiState.surfaceDetected
        ? text.state.values.checking
        : text.state.values.waiting;

    const placementStatus = this.uiState.placed ? "done" : "idle";
    const placementText = this.uiState.placed ? text.state.values.placed : text.state.values.notPlaced;

    this.setState("support", supportText, supportStatus);
    this.setState("session", sessionText, sessionStatus);
    this.setState("tracking", trackingText, trackingStatus);
    this.setState("surface", surfaceText, surfaceStatus);
    this.setState("stability", stabilityText, stabilityStatus);
    this.setState("placement", placementText, placementStatus);

    this.refreshMiniSummary();
  }

  updateMiniSummaryLayout() {
    const isUserMode = this.isUserMode();

    if (this.miniRefs.session) {
      this.miniRefs.session.hidden = isUserMode;
    }

    if (this.miniRefs.surface) {
      this.miniRefs.surface.hidden = isUserMode;
    }
  }

  updateUserModeActions() {
    const isUserMode = this.isUserMode();
    const sessionActive = this.uiState.sessionActive === true;

    if (this.userMenuActions) {
      this.userMenuActions.hidden = !isUserMode;
    }

    if (this.userMenuResetButton) {
      this.userMenuResetButton.hidden = !(isUserMode && sessionActive);
    }

    if (this.userToolbarActions) {
      this.userToolbarActions.hidden = !(isUserMode && sessionActive);
    }

    if (this.staticRefs.placementMenuOptionList) {
      this.staticRefs.placementMenuOptionList.hidden = isUserMode;
    }

    this.updateUserPlacementPopup();
  }

  updateUserPlacementPopup(text = this.getText()) {
    const shouldShow = this.isUserMode() && this.uiState.sessionActive && !this.uiState.placed;
    if (this.userPlacementPopup) {
      this.userPlacementPopup.hidden = !shouldShow;
    }

    if (!shouldShow || !this.userPlacementPopupText) {
      return;
    }

    this.userPlacementPopupText.textContent =
      this.toDisplayText(
        this.uiState.surfaceDetected || this.uiState.stableSurface
          ? text.placement.userGuideDetected
          : text.placement.userGuideSearch
      );
  }

  setState(key, text, status) {
    const ref = this.stateRefs[key];
    if (!ref) {
      return;
    }

    if (ref.value) {
      ref.value.textContent = this.toDisplayText(text);
    }

    if (ref.item) {
      ref.item.dataset.status = status;
    }
  }

  refreshButtons() {
    this.renderGeoHeadingReferenceControl();

    if (this.startButton) {
      this.startButton.disabled =
        this.uiState.experienceMode === "geo-sensor"
          ? this.uiState.sessionActive || this.uiState.startActionPending
          : !this.uiState.supportAvailable || this.uiState.sessionActive || this.uiState.startActionPending;
    }

    if (this.geoActivateLocationButton) {
      this.geoActivateLocationButton.disabled =
        this.uiState.experienceMode !== "geo-sensor" ||
        this.uiState.sessionActive ||
        this.uiState.geoStatus === "waiting" ||
        this.uiState.geoWatchActive;
    }

    if (this.placeButton) {
      const placementModeAllowsPlacement =
        this.uiState.placementMode === "free" ||
        this.uiState.placementMode === "geo-local" ||
        this.uiState.placementMode === "geo-global";
      this.placeButton.disabled =
        !placementModeAllowsPlacement ||
        !this.uiState.sessionActive ||
        !this.uiState.stableSurface ||
        this.uiState.placed;
    }

    if (this.resetButton) {
      this.resetButton.disabled = !this.uiState.sessionActive && !this.uiState.placed;
    }

    if (this.userMenuResetButton) {
      this.userMenuResetButton.disabled = !this.uiState.sessionActive;
    }

    if (this.stopButton) {
      this.stopButton.disabled = !this.uiState.sessionActive;
    }
  }

  refreshMiniSummary() {
    const text = this.getText();
    const isUserMode = this.isUserMode();
    this.updateMiniSummaryLayout();

    const sessionText =
      this.uiState.experienceMode === "geo-sensor"
        ? this.uiState.sessionActive
          ? text.mini.session.active
          : text.mini.session.ready
        : this.uiState.sessionActive
          ? text.mini.session.active
          : this.uiState.supportAvailable === null
            ? text.mini.session.checking
            : this.uiState.supportAvailable
              ? text.mini.session.ready
              : text.mini.session.inactive;
    const sessionStatus =
      this.uiState.experienceMode === "geo-sensor"
        ? this.uiState.sessionActive
          ? "active"
          : "ok"
        : this.uiState.sessionActive
          ? "active"
          : this.uiState.supportAvailable === null
            ? "idle"
            : this.uiState.supportAvailable
              ? "ok"
              : "error";

    const surfaceText = this.uiState.stableSurface
      ? text.mini.surface.stable
      : this.uiState.surfaceDetected
        ? text.mini.surface.checking
        : text.mini.surface.search;
    const surfaceStatus = this.uiState.stableSurface
      ? "ok"
      : this.uiState.surfaceDetected
        ? "warning"
        : "idle";

    const placementText = isUserMode
      ? this.uiState.placed
        ? text.mini.placement.yes
        : text.mini.placement.no
      : this.uiState.placed
        ? text.mini.placement.placed
        : text.mini.placement.waiting;
    const placementStatus = this.uiState.placed ? "done" : "idle";

    this.setMiniState("session", sessionText, sessionStatus);
    this.setMiniState("surface", surfaceText, surfaceStatus);
    this.setMiniState("placement", placementText, placementStatus);
  }

  setMiniState(key, text, status) {
    const element = this.miniRefs[key];
    if (!element) {
      return;
    }

    element.textContent = this.toDisplayText(text);
    element.dataset.status = status;
  }

  renderGeoSnapshot(snapshot) {
    this.lastGeoSnapshot = {
      ...createGeoSnapshotDefaults(),
      ...(snapshot || {})
    };

    this.renderGeoPanel();
  }

  renderSensorSnapshot(snapshot) {
    this.lastSensorSnapshot = {
      ...createSensorSnapshotDefaults(),
      ...(snapshot || {})
    };

    this.renderGeoPanel();
  }

  renderGeoPanel() {
    const text = this.getText();
    const usesSensorData = this.uiState.experienceMode === "geo-sensor" || this.lastSensorSnapshot.running;
    const geoPosition = this.lastGeoSnapshot.position ? this.lastGeoSnapshot.position : null;
    const sensorPosition = this.lastSensorSnapshot.position ? this.lastSensorSnapshot.position : null;
    const mergedPosition = usesSensorData
      ? sensorPosition
        ? {
            latitude: sensorPosition.lat,
            longitude: sensorPosition.lon,
            accuracyMeters: sensorPosition.accuracyMeters
          }
        : null
      : geoPosition;
    const severity = usesSensorData ? this.getSensorSeverity(this.lastSensorSnapshot) : toGeoSeverity(this.lastGeoSnapshot);

    this.uiState.geoStatus = usesSensorData
      ? this.lastSensorSnapshot.ready
        ? "granted"
        : this.lastSensorSnapshot.running
          ? "waiting"
          : "not-requested"
      : this.lastGeoSnapshot.status || "not-requested";
    this.uiState.geoWatchActive = usesSensorData
      ? Boolean(this.lastSensorSnapshot.running)
      : Boolean(this.lastGeoSnapshot.watchActive);
    this.latestGeoPosition = mergedPosition
      ? {
          latitude: mergedPosition.latitude,
          longitude: mergedPosition.longitude
        }
      : null;

    if (this.geoRefs.statusBadge) {
      this.geoRefs.statusBadge.textContent = this.toDisplayText(
        usesSensorData
          ? this.getSensorBadgeLabel(this.lastSensorSnapshot, text)
          : this.getGeoBadgeLabel(this.lastGeoSnapshot, text)
      );
      this.geoRefs.statusBadge.dataset.status = severity;
    }

    if (this.geoRefs.statusText) {
      this.geoRefs.statusText.textContent = this.toDisplayText(
        usesSensorData
          ? this.getSensorStatusText(this.lastSensorSnapshot, text)
          : this.getGeoStatusText(this.lastGeoSnapshot, text)
      );
    }

    if (this.geoRefs.latitude) {
      this.geoRefs.latitude.textContent = mergedPosition ? mergedPosition.latitude.toFixed(6) : "-";
    }

    if (this.geoRefs.longitude) {
      this.geoRefs.longitude.textContent = mergedPosition ? mergedPosition.longitude.toFixed(6) : "-";
    }

    if (this.geoRefs.accuracy) {
      this.geoRefs.accuracy.textContent = mergedPosition ? `+/- ${Math.round(mergedPosition.accuracyMeters)} m` : "-";
    }

    if (this.geoRefs.heading) {
      this.geoRefs.heading.textContent = usesSensorData ? formatHeading(this.lastSensorSnapshot.headingDeg) : "-";
    }

    if (this.geoRefs.message) {
      this.geoRefs.message.textContent = this.toDisplayText(
        usesSensorData
          ? this.getSensorMessage(this.lastSensorSnapshot, text)
          : this.getGeoMessage(this.lastGeoSnapshot, text)
      );
    }

    if (this.geoRefs.help) {
      const helpText = usesSensorData
        ? this.getSensorHelp(this.lastSensorSnapshot, text)
        : this.getGeoHelp(this.lastGeoSnapshot, text);
      this.geoRefs.help.textContent = this.toDisplayText(helpText);
      this.geoRefs.help.hidden = !helpText;
    }

    if (this.activateGeoButton) {
      this.activateGeoButton.disabled = usesSensorData
        ? Boolean(this.lastSensorSnapshot.running)
        : this.uiState.geoStatus === "waiting" ||
          this.uiState.geoWatchActive ||
          (this.lastGeoSnapshot.issue === "https-required" || this.lastGeoSnapshot.issue === "unsupported");
    }

    if (this.calibrateHeadingButton) {
      this.calibrateHeadingButton.disabled =
        !usesSensorData || !this.lastSensorSnapshot.running || !Number.isFinite(this.lastSensorSnapshot.headingDeg);
    }
  }

  getGeoBadgeLabel(snapshot, text) {
    if (!snapshot) {
      return text.geo.badges.checking;
    }

    if (snapshot.issue === "https-required") {
      return text.geo.badges.https;
    }

    if (snapshot.issue === "unsupported") {
      return text.geo.badges.unsupported;
    }

    switch (snapshot.status) {
      case "granted":
        return text.geo.badges.granted;
      case "waiting":
        return text.geo.badges.waiting;
      case "denied":
        return text.geo.badges.denied;
      case "not-requested":
        return text.geo.badges.ready;
      default:
        return text.geo.badges.checking;
    }
  }

  getGeoStatusText(snapshot, text) {
    if (!snapshot) {
      return text.geo.statusTexts.notRequested;
    }

    switch (snapshot.status) {
      case "granted":
        return text.geo.statusTexts.granted;
      case "waiting":
        return text.geo.statusTexts.waiting;
      case "denied":
        return text.geo.statusTexts.denied;
      case "not-requested":
      default:
        return text.geo.statusTexts.notRequested;
    }
  }

  getGeoMessage(snapshot, text) {
    if (!snapshot) {
      return text.geo.messages.notRequested;
    }

    switch (snapshot.issue) {
      case "https-required":
        return text.geo.messages.httpsRequired;
      case "unsupported":
        return text.geo.messages.unsupported;
      case "permission-denied":
        return text.geo.messages.denied;
      case "position-unavailable":
        return text.geo.messages.positionUnavailable;
      case "timeout":
        return text.geo.messages.timeout;
      case "error":
        return text.geo.messages.genericError;
      default:
        break;
    }

    if (snapshot.status === "waiting" || snapshot.requestPending) {
      return text.geo.messages.waiting;
    }

    if (snapshot.status === "granted") {
      return snapshot.position ? text.geo.messages.available : text.geo.messages.permissionGranted;
    }

    if (snapshot.status === "denied") {
      return text.geo.messages.denied;
    }

    return text.geo.messages.notRequested;
  }

  getGeoHelp(snapshot, text) {
    if (!snapshot) {
      return text.geo.help.notRequested;
    }

    switch (snapshot.issue) {
      case "https-required":
        return text.geo.help.httpsRequired;
      case "permission-denied":
        return text.geo.help.denied;
      case "position-unavailable":
        return text.geo.help.positionUnavailable;
      case "timeout":
        return text.geo.help.timeout;
      case "unsupported":
      case "error":
        return text.geo.help.none;
      default:
        break;
    }

    if (snapshot.status === "waiting" || snapshot.requestPending) {
      return text.geo.help.waiting;
    }

    if (snapshot.status === "not-requested") {
      return text.geo.help.notRequested;
    }

    return text.geo.help.none;
  }

  getSensorSeverity(snapshot) {
    if (!snapshot) {
      return "idle";
    }

    if (snapshot.issue) {
      return "error";
    }

    if (snapshot.ready) {
      return "ok";
    }

    if (snapshot.running) {
      return "warning";
    }

    return "idle";
  }

  getSensorBadgeLabel(snapshot, text) {
    if (!snapshot) {
      return text.geo.badges.checking;
    }

    if (snapshot.issue === "https-required") {
      return text.geo.badges.https;
    }

    if (snapshot.issue === "geolocation-unsupported" || snapshot.issue === "orientation-unsupported") {
      return text.geo.badges.unsupported;
    }

    if (snapshot.ready) {
      return text.geo.badges.granted;
    }

    if (snapshot.running) {
      return text.geo.badges.waiting;
    }

    return text.geo.badges.ready;
  }

  getSensorStatusText(snapshot, text) {
    if (!snapshot) {
      return text.geo.statusTexts.notRequested;
    }

    if (snapshot.ready) {
      return text.geo.statusTexts.granted;
    }

    if (snapshot.running) {
      return text.geo.statusTexts.waiting;
    }

    if (snapshot.issue) {
      return text.geo.statusTexts.denied;
    }

    return text.geo.statusTexts.notRequested;
  }

  getSensorMessage(snapshot, text) {
    if (!snapshot) {
      return text.geo.messages.notRequested;
    }

    return snapshot.message || text.geo.messages.notRequested;
  }

  getSensorHelp(snapshot, text) {
    if (!snapshot) {
      return text.geo.help.notRequested;
    }

    switch (snapshot.issue) {
      case "https-required":
        return text.geo.help.httpsRequired;
      case "orientation-denied":
      case "geolocation-denied":
        return text.geo.help.denied;
      case "geolocation-unavailable":
        return text.geo.help.positionUnavailable;
      case "geolocation-timeout":
        return text.geo.help.timeout;
      default:
        return text.geo.help.none;
    }
  }

  setGeoDebug(debug) {
    const debugState = debug || {};

    if (this.geoDebugRefs.originLatitude) {
      this.geoDebugRefs.originLatitude.textContent = formatDebugNumber(debugState.originLatitude, 6);
    }

    if (this.geoDebugRefs.originLongitude) {
      this.geoDebugRefs.originLongitude.textContent = formatDebugNumber(debugState.originLongitude, 6);
    }

    if (this.geoDebugRefs.targetLatitude) {
      this.geoDebugRefs.targetLatitude.textContent = formatDebugNumber(debugState.targetLatitude, 6);
    }

    if (this.geoDebugRefs.targetLongitude) {
      this.geoDebugRefs.targetLongitude.textContent = formatDebugNumber(debugState.targetLongitude, 6);
    }

    if (this.geoDebugRefs.deltaLatitude) {
      this.geoDebugRefs.deltaLatitude.textContent = formatDebugNumber(debugState.deltaLatitude, 6);
    }

    if (this.geoDebugRefs.deltaLongitude) {
      this.geoDebugRefs.deltaLongitude.textContent = formatDebugNumber(debugState.deltaLongitude, 6);
    }

    if (this.geoDebugRefs.xMeters) {
      this.geoDebugRefs.xMeters.textContent = formatDebugNumber(debugState.xMeters, 2);
    }

    if (this.geoDebugRefs.zMeters) {
      this.geoDebugRefs.zMeters.textContent = formatDebugNumber(debugState.zMeters, 2);
    }

    if (this.geoDebugRefs.distanceMeters) {
      this.geoDebugRefs.distanceMeters.textContent = formatDebugNumber(debugState.distanceMeters, 2);
    }
  }

  setPlacementDebug(debug) {
    const debugState = debug || {};

    if (this.placementDebugRefs.objectPlaced) {
      this.placementDebugRefs.objectPlaced.textContent = formatDebugBoolean(Boolean(debugState.objectPlaced));
    }

    if (this.placementDebugRefs.distanceTooFar) {
      this.placementDebugRefs.distanceTooFar.textContent = formatDebugBoolean(Boolean(debugState.distanceOverLimit));
    }

    if (this.placementDebugRefs.hasStableSurface) {
      this.placementDebugRefs.hasStableSurface.textContent = formatDebugBoolean(Boolean(debugState.hasStableSurface));
    }

    if (this.placementDebugRefs.objectBehindCamera) {
      this.placementDebugRefs.objectBehindCamera.textContent = formatDebugBoolean(Boolean(debugState.objectBehindCamera));
    }
  }

  setUIInteracting(interacting) {
    const nextValue = Boolean(interacting);
    if (this.uiInteracting === nextValue) {
      this.syncCanvasPointerEvents();
      return;
    }

    this.uiInteracting = nextValue;
    this.syncCanvasPointerEvents();

    if (this.uiInteractionChangeHandler) {
      this.uiInteractionChangeHandler(nextValue);
    }
  }

  copyDeviceCoordinatesToTargetInputs() {
    if (!this.latestGeoPosition) {
      this.setGeoTargetFeedback("Keine Geraetekoordinaten verfuegbar.");
      return false;
    }

    this.setGeoTargetInputs(this.latestGeoPosition);
    this.setGeoTargetFeedback("Aktuelle Geraetekoordinaten uebernommen.");
    return true;
  }

  dispose() {
    this.clearPendingUIInteractionRelease();
    this.clearPendingTextInputRelease();
    this.setUIInteracting(false);
    this.setTextInputActive(false);

    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.length = 0;
  }
}
