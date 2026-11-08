import { z } from 'zod';

/**
 * Risk Analytics Module
 * Clause analysis, risk scoring, negotiation insights, market benchmarking
 */

export const ClauseRiskSchema = z.object({
  clauseType: z.enum(['PAYMENT', 'LIABILITY', 'TERMINATION', 'CONFIDENTIALITY', 'DISPUTE', 'IP', 'OTHER']),
  risicoNiveau: z.enum(['LAAG', 'GEMIDDELD', 'HOOG', 'KRITIEK']),
  redenen: z.string().array(),
  aanbevelingen: z.string().array(),
});

export type ClauseRisk = z.infer<typeof ClauseRiskSchema>;

export interface RisicoAnalyse {
  contractId: string;
  overallScore: number; // 0-100
  niveau: 'LAAG' | 'GEMIDDELD' | 'HOOG' | 'KRITIEK';
  clauseAnalyse: Record<string, ClauseRisk>;
  leverancierRisico: {
    financieelGezondheid: number;
    prestatieGeschiedenis: number;
    nalevingsscore: number;
  };
  marktBenchmark?: {
    percentiel: number;
    vergelijking: string;
    industrieNorm: Record<string, any>;
  };
  onderhandelingsPunten: string[];
  geadviseerdeWijzigingen: string[];
  analyseDatum: Date;
}

export class RiskAnalytics {
  /**
   * Perform comprehensive risk analysis on contract
   */
  static analyzeContract(
    contractInhoud: string,
    contractType: 'KOOP' | 'VERKOOP' | 'SERVICE' | 'PARTNERSHIP',
    leverancierScore?: number,
    contractWaarde?: number
  ): RisicoAnalyse {
    const contractId = this.generateId();

    // Step 1: Analyze clauses
    const clauseAnalyse = this.analyzeClauses(contractInhoud, contractType);

    // Step 2: Assess vendor risk
    const leverancierRisico = this.assessVendorRisk(leverancierScore || 3);

    // Step 3: Calculate overall score
    const clauseScores = Object.values(clauseAnalyse).map(c => this.riskLevelToScore(c.risicoNiveau));
    const clauseAverage = clauseScores.length > 0 ? clauseScores.reduce((a, b) => a + b) / clauseScores.length : 50;
    const vendorAverage = (leverancierRisico.financieelGezondheid +
                          leverancierRisico.prestatieGeschiedenis +
                          leverancierRisico.nalevingsscore) / 3;

    const overallScore = Math.round((clauseAverage * 0.6 + vendorAverage * 0.4));

    // Step 4: Identify negotiation points
    const onderhandelingsPunten = this.identifyNegotiationPoints(contractInhoud, clauseAnalyse);

    // Step 5: Generate recommendations
    const geadviseerdeWijzigingen = this.generateRecommendations(clauseAnalyse, contractWaarde);

    // Step 6: Market benchmarking
    const marktBenchmark = this.generateMarketBenchmark(contractType, overallScore);

    return {
      contractId,
      overallScore,
      niveau: this.scoreToLevel(overallScore),
      clauseAnalyse,
      leverancierRisico,
      marktBenchmark,
      onderhandelingsPunten,
      geadviseerdeWijzigingen,
      analyseDatum: new Date(),
    };
  }

  /**
   * Analyze individual clauses
   */
  private static analyzeClauses(
    inhoud: string,
    contractType: string
  ): Record<string, ClauseRisk> {
    const analyse: Record<string, ClauseRisk> = {};

    // Payment clause analysis
    if (inhoud.toLowerCase().includes('betaling') || inhoud.toLowerCase().includes('payment')) {
      analyse['PAYMENT'] = this.analyzePaymentClause(inhoud);
    }

    // Liability clause analysis
    if (inhoud.toLowerCase().includes('aansprakelijkheld') || inhoud.toLowerCase().includes('liability')) {
      analyse['LIABILITY'] = this.analyzeLiabilityClause(inhoud);
    }

    // Termination clause analysis
    if (inhoud.toLowerCase().includes('beëindiging') || inhoud.toLowerCase().includes('termination')) {
      analyse['TERMINATION'] = this.analyzeTerminationClause(inhoud);
    }

    // Confidentiality clause analysis
    if (inhoud.toLowerCase().includes('vertrouwelijk') || inhoud.toLowerCase().includes('confidential')) {
      analyse['CONFIDENTIALITY'] = this.analyzeConfidentialityClause(inhoud);
    }

    // Dispute resolution analysis
    if (inhoud.toLowerCase().includes('geschil') || inhoud.toLowerCase().includes('dispute')) {
      analyse['DISPUTE'] = this.analyzeDisputeClause(inhoud);
    }

    return analyse;
  }

  /**
   * Analyze payment clause for risks
   */
  private static analyzePaymentClause(inhoud: string): ClauseRisk {
    const lagerInhoud = inhoud.toLowerCase();
    let level: ClauseRisk['risicoNiveau'] = 'LAAG';
    const redenen: string[] = [];
    const aanbevelingen: string[] = [];

    // Check for payment terms
    if (lagerInhoud.includes('net 90') || lagerInhoud.includes('net 60')) {
      level = 'GEMIDDELD';
      redenen.push('Lange betalingstermijn (60+ dagen) - cashflow risico');
      aanbevelingen.push('Onderhandel naar Net 30 of vroeger');
    }

    if (lagerInhoud.includes('na factuur')) {
      aanbevelingen.push('Voeg terugboeking toe voor laat betaalde facturen');
    }

    if (!lagerInhoud.includes('interesse') && !lagerInhoud.includes('rente')) {
      aanbevelingen.push('Voeg rente op overdue bedragen toe');
    }

    return {
      clauseType: 'PAYMENT',
      risicoNiveau: level,
      redenen: redenen.length > 0 ? redenen : ['Standaard betalingsvoorwaarden'],
      aanbevelingen,
    };
  }

  /**
   * Analyze liability clause
   */
  private static analyzeLiabilityClause(inhoud: string): ClauseRisk {
    let level: ClauseRisk['risicoNiveau'] = 'LAAG';
    const redenen: string[] = [];
    const aanbevelingen: string[] = [];

    const lagerInhoud = inhoud.toLowerCase();

    if (lagerInhoud.includes('onbeperkte aansprakelijkheid')) {
      level = 'KRITIEK';
      redenen.push('Onbeperkte aansprakelijkheid - ernstig risico');
      aanbevelingen.push('Voeg duidelijke aansprakelijkheidslimiet toe (bijv. 12 maanden waarde)');
    }

    if (lagerInhoud.includes('indirecte schade') && !lagerInhoud.includes('uitgesloten')) {
      level = 'HOOG';
      redenen.push('Indirecte schadevergoeding niet duidelijk uitgesloten');
      aanbevelingen.push('Voeg clausule in die indirecte schade uitsluit');
    }

    return {
      clauseType: 'LIABILITY',
      risicoNiveau: level,
      redenen: redenen.length > 0 ? redenen : ['Standaard aansprakelijkheidsclauses'],
      aanbevelingen,
    };
  }

  /**
   * Analyze termination clause
   */
  private static analyzeTerminationClause(inhoud: string): ClauseRisk {
    const lagerInhoud = inhoud.toLowerCase();
    let level: ClauseRisk['risicoNiveau'] = 'LAAG';
    const redenen: string[] = [];
    const aanbevelingen: string[] = [];

    if (!lagerInhoud.includes('opzegging') || !lagerInhoud.includes('termination')) {
      level = 'GEMIDDELD';
      redenen.push('Beëindiging voorwaarden onduidelijk');
      aanbevelingen.push('Voeg duidelijke opzegtermijnen toe');
    }

    if (lagerInhoud.includes('geen opzegding mogelijk')) {
      level = 'HOOG';
      redenen.push('Contract kan niet worden opgezegd - lock-in risico');
      aanbevelingen.push('Voeg escape clausule toe voor ernstige schendingen');
    }

    return {
      clauseType: 'TERMINATION',
      risicoNiveau: level,
      redenen,
      aanbevelingen,
    };
  }

  /**
   * Analyze confidentiality clause
   */
  private static analyzeConfidentialityClause(inhoud: string): ClauseRisk {
    return {
      clauseType: 'CONFIDENTIALITY',
      risicoNiveau: 'LAAG',
      redenen: ['Vertrouwelijkheidsclausule aanwezig'],
      aanbevelingen: ['Bewaar kopieën van alle vertrouwelijke informatie'],
    };
  }

  /**
   * Analyze dispute resolution clause
   */
  private static analyzeDisputeClause(inhoud: string): ClauseRisk {
    const lagerInhoud = inhoud.toLowerCase();
    const aanbevelingen: string[] = [];

    if (!lagerInhoud.includes('arbitrage') && !lagerInhoud.includes('mediation')) {
      aanbevelingen.push('Voeg arbitrage-optie toe om juridische kosten te sparen');
    }

    return {
      clauseType: 'DISPUTE',
      risicoNiveau: 'LAAG',
      redenen: ['Geschillenbeslechtingsclauses aanwezig'],
      aanbevelingen,
    };
  }

  /**
   * Assess vendor risk
   */
  private static assessVendorRisk(vendorScore: number): RisicoAnalyse['leverancierRisico'] {
    const maxScore = 100;

    // Score between 0-100 where higher = better (less risky)
    const scoreFactor = Math.min(vendorScore * 20, maxScore); // Normalize 0-5 to 0-100

    return {
      financieelGezondheid: scoreToRiskReverse(scoreFactor, 70),
      prestatieGeschiedenis: scoreToRiskReverse(scoreFactor, 75),
      nalevingsscore: scoreToRiskReverse(scoreFactor, 80),
    };
  }

  /**
   * Identify negotiation points
   */
  private static identifyNegotiationPoints(
    inhoud: string,
    clauseAnalyse: Record<string, ClauseRisk>
  ): string[] {
    const punten: string[] = [];

    // Add high-risk clause items
    Object.entries(clauseAnalyse).forEach(([type, analysis]) => {
      if (analysis.risicoNiveau === 'HOOG' || analysis.risicoNiveau === 'KRITIEK') {
        punten.push(`${type}: ${analysis.aanbevelingen[0] || 'Heronderhandelen'}`);
      }
    });

    return punten;
  }

  /**
   * Generate recommendations
   */
  private static generateRecommendations(
    clauseAnalyse: Record<string, ClauseRisk>,
    contractWaarde?: number
  ): string[] {
    const recommendations: string[] = [];

    Object.values(clauseAnalyse).forEach(clause => {
      recommendations.push(...clause.aanbevelingen);
    });

    if (contractWaarde && contractWaarde > 100000 * 100) { // > €100k
      recommendations.push('Hoge contractwaarde: aanbeveling voor juridische review');
    }

    return Array.from(new Set(recommendations)).slice(0, 10);
  }

  /**
   * Generate market benchmark
   */
  private static generateMarketBenchmark(
    contractType: string,
    score: number
  ): RisicoAnalyse['marktBenchmark'] {
    // Simplified industry benchmarks
    const benchmarks: Record<string, { avg: number; industrieNorm: Record<string, string> }> = {
      'KOOP': { avg: 55, industrieNorm: { gemiddeld: '50-60', waarschuwing: '>70' } },
      'VERKOOP': { avg: 45, industrieNorm: { gemiddeld: '40-50', waarschuwing: '>65' } },
      'SERVICE': { avg: 60, industrieNorm: { gemiddeld: '55-65', waarschuwing: '>75' } },
      'PARTNERSHIP': { avg: 50, industrieNorm: { gemiddeld: '45-55', waarschuwing: '>70' } },
    };

    const benchmark = benchmarks[contractType] || benchmarks['KOOP'];
    const percentiel = Math.round((score / benchmark.avg) * 100);

    return {
      percentiel,
      vergelijking: score < benchmark.avg ? 'Beter dan gemiddelde' : 'Slechter dan gemiddelde',
      industrieNorm: benchmark.industrieNorm,
    };
  }

  /**
   * Convert score to risk level
   */
  private static scoreToLevel(score: number): RisicoAnalyse['niveau'] {
    if (score <= 25) return 'LAAG';
    if (score <= 50) return 'GEMIDDELD';
    if (score <= 75) return 'HOOG';
    return 'KRITIEK';
  }

  /**
   * Convert risk level to numeric score
   */
  private static riskLevelToScore(level: ClauseRisk['risicoNiveau']): number {
    return { 'LAAG': 25, 'GEMIDDELD': 50, 'HOOG': 75, 'KRITIEK': 100 }[level] || 50;
  }

  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return `RIS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Helper function: reverse score (higher value = better)
 */
function scoreToRiskReverse(score: number, defaultIfZero: number): number {
  return score === 0 ? defaultIfZero : score;
}
