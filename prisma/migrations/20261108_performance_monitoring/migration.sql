-- Performance Metrics Monitoring Tables

-- Web Vitals tracking
CREATE TABLE "PerformanceMetric" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "naam" TEXT NOT NULL,
  "waarde" DOUBLE PRECISION NOT NULL,
  "eenheid" TEXT NOT NULL,
  "drempel" TEXT NOT NULL CHECK ("drempel" IN ('goed', 'mati', 'slecht')),
  "pad" TEXT,
  "userId" TEXT,
  "tijdstempel" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gemaaktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bijgewerkOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PerformanceMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Slow Query Logging
CREATE TABLE "SlowQuery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sql" TEXT NOT NULL,
  "duur" INTEGER NOT NULL,
  "rijen" INTEGER NOT NULL,
  "voorgekomen" INTEGER NOT NULL DEFAULT 1,
  "eersteKeer" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "laasteKeer" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "indexHulpstukkenvoor" TEXT,
  "omgeving" TEXT NOT NULL DEFAULT 'production',
  "gemaaktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlowQuery_sql_unique" UNIQUE ("sql")
);

-- Error Reports
CREATE TABLE "ErrorReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "bericht" TEXT NOT NULL,
  "categorie" TEXT NOT NULL CHECK ("categorie" IN ('JAVASCRIPT', 'NETWERK', 'DATABASE', 'AUTHENTICATIE', 'VALIDATIE', 'ONBEKEND')),
  "ernst" TEXT NOT NULL CHECK ("ernst" IN ('laag', 'gemiddeld', 'hoog', 'kritiek')),
  "stapel" TEXT,
  "url" TEXT,
  "userId" TEXT,
  "omgeving" TEXT NOT NULL DEFAULT 'production',
  "voorgekomen" INTEGER NOT NULL DEFAULT 1,
  "eersteKeer" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "laasteKeer" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "opgelost" BOOLEAN NOT NULL DEFAULT false,
  "gemaaktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bijgewerkOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ErrorReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Uptime Events
CREATE TABLE "UptimeEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dienst" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('gezond', 'gedegradeerd', 'onbereikbaar')),
  "responseTijd" INTEGER NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "bericht" TEXT,
  "regio" TEXT,
  "tijdstempel" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gemaaktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Incident Tracking
CREATE TABLE "Incident" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dienst" TEXT NOT NULL,
  "begin" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "einde" TIMESTAMP(3),
  "oorzaak" TEXT NOT NULL,
  "ernst" TEXT NOT NULL CHECK ("ernst" IN ('laag', 'gemiddeld', 'hoog', 'kritiek')),
  "aangepasteServices" TEXT,
  "opgelost" BOOLEAN NOT NULL DEFAULT false,
  "gemaaktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bijgewerkOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX "PerformanceMetric_naam_drempel" ON "PerformanceMetric"("naam", "drempel");
CREATE INDEX "PerformanceMetric_tijdstempel" ON "PerformanceMetric"("tijdstempel");
CREATE INDEX "PerformanceMetric_userId" ON "PerformanceMetric"("userId");

CREATE INDEX "SlowQuery_duur" ON "SlowQuery"("duur");
CREATE INDEX "SlowQuery_laasteKeer" ON "SlowQuery"("laasteKeer");

CREATE INDEX "ErrorReport_categorie_ernst" ON "ErrorReport"("categorie", "ernst");
CREATE INDEX "ErrorReport_userId" ON "ErrorReport"("userId");
CREATE INDEX "ErrorReport_laasteKeer" ON "ErrorReport"("laasteKeer");

CREATE INDEX "UptimeEvent_dienst_status" ON "UptimeEvent"("dienst", "status");
CREATE INDEX "UptimeEvent_tijdstempel" ON "UptimeEvent"("tijdstempel");

CREATE INDEX "Incident_dienst_begin" ON "Incident"("dienst", "begin");
CREATE INDEX "Incident_ernst" ON "Incident"("ernst");
