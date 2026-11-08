import { z } from 'zod';

/**
 * Obligation Tracking Module
 * Automated deadline reminders, renewal alerts, SLA monitoring
 */

export const ObligationSchema = z.object({
  contractId: z.string(),
  omschrijving: z.string().min(1),
  soort: z.enum(['BETALING', 'LEVERING', 'DIENST', 'RAPPORTAGE', 'VERNIEUWING']),
  vervaldatum: z.coerce.date(),
  prioriteit: z.enum(['LAAG', 'NORMAAL', 'HOOG', 'KRITIEK']).default('NORMAAL'),
  aanbieding: z.string().optional(), // SLA details
  opmerking: z.string().optional(),
});

export type Obligation = z.infer<typeof ObligationSchema>;

export interface ObligationStatus extends Obligation {
  id: string;
  status: 'AUSSTEHEND' | 'IN_UITVOERING' | 'VOLTOOID' | 'VERVALLEN' | 'OVERTREDEN';
  voltooidDatum?: Date;
  dagenvervallen?: number;
  herinneringenVerzonden: number;
}

export interface RenewalAlert {
  contractId: string;
  einddatum: Date;
  dagenstotVerval: number;
  type: 'ALERT_30' | 'ALERT_14' | 'ALERT_7' | 'ALERT_1';
  bericht: string;
}

export class ObligationTracker {
  /**
   * Create new obligation for contract
   */
  static createObligation(data: Obligation): ObligationStatus {
    const id = this.generateId();
    const nu = new Date();

    let status: ObligationStatus['status'] = 'AUSSTEHEND';
    if (data.vervaldatum < nu) {
      status = 'VERVALLEN';
    }

    return {
      id,
      ...data,
      status,
      herinneringenVerzonden: 0,
    };
  }

  /**
   * Get obligations due within X days
   */
  static getUpcomingObligations(
    obligations: ObligationStatus[],
    dayWindow: number = 30
  ): ObligationStatus[] {
    const nu = new Date();
    const window = new Date(nu.getTime() + dayWindow * 24 * 60 * 60 * 1000);

    return obligations.filter(o => {
      const vervalt = new Date(o.vervaldatum);
      return vervalt >= nu && vervalt <= window && o.status === 'AUSSTEHEND';
    }).sort((a, b) => a.vervaldatum.getTime() - b.vervaldatum.getTime());
  }

  /**
   * Get overdue obligations
   */
  static getOverdueObligations(obligations: ObligationStatus[]): ObligationStatus[] {
    const nu = new Date();
    return obligations.filter(o => {
      if (o.status === 'VOLTOOID' || o.status === 'IN_UITVOERING') return false;
      const vervalt = new Date(o.vervaldatum);
      const daysOverdue = Math.floor((nu.getTime() - vervalt.getTime()) / (1000 * 60 * 60 * 24));
      return daysOverdue > 0;
    });
  }

  /**
   * Check SLA compliance for obligation
   */
  static checkSLACompliance(obligation: ObligationStatus): {
    compliant: boolean;
    percentageAchieved: number;
    waarschuwing?: string;
  } {
    if (!obligation.aanbieding) {
      return { compliant: true, percentageAchieved: 100 };
    }

    // Parse SLA (simplified)
    // Assume format like "99% uptime" or "24h response time"
    const slaParts = obligation.aanbieding.match(/(\d+)%\s*uptime|(\d+)h?\s*response/i);

    if (!slaParts) {
      return { compliant: true, percentageAchieved: 100 };
    }

    // In production, would check actual metrics against SLA
    const targetPercentage = slaParts[1] ? parseInt(slaParts[1]) : 99;
    const currentPercentage = 100; // Placeholder - would fetch real metric

    const compliant = currentPercentage >= targetPercentage;

    return {
      compliant,
      percentageAchieved: currentPercentage,
      waarschuwing: compliant ? undefined : `SLA niet behaald: ${currentPercentage}% vs ${targetPercentage}% doelstelling`,
    };
  }

  /**
   * Update obligation status
   */
  static updateObligationStatus(
    obligation: ObligationStatus,
    nieuwStatus: ObligationStatus['status'],
    opmerking?: string
  ): ObligationStatus {
    const updated = { ...obligation, status: nieuwStatus, opmerking };

    if (nieuwStatus === 'VOLTOOID') {
      updated.voltooidDatum = new Date();
    }

    return updated;
  }

  /**
   * Generate renewal alerts
   */
  static generateRenewalAlerts(contractEindatum: Date): RenewalAlert | null {
    const nu = new Date();
    const dagesTotVerval = Math.floor((contractEindatum.getTime() - nu.getTime()) / (1000 * 60 * 60 * 24));

    if (dagesTotVerval <= 0) {
      return null; // Already expired
    }

    if (dagesTotVerval === 30) {
      return {
        contractId: '', // Would be populated by caller
        einddatum: contractEindatum,
        dagenstotVerval: 30,
        type: 'ALERT_30',
        bericht: 'Contract verloopt over 30 dagen - plan vernieuwing nu',
      };
    }

    if (dagesTotVerval === 14) {
      return {
        contractId: '',
        einddatum: contractEindatum,
        dagenstotVerval: 14,
        type: 'ALERT_14',
        bericht: 'Contract verloopt over 14 dagen - dringende actie vereist',
      };
    }

    if (dagesTotVerval === 7) {
      return {
        contractId: '',
        einddatum: contractEindatum,
        dagenstotVerval: 7,
        type: 'ALERT_7',
        bericht: 'Contract verloopt volgende week - heronderhandeling nodig',
      };
    }

    if (dagesTotVerval === 1) {
      return {
        contractId: '',
        einddatum: contractEindatum,
        dagenstotVerval: 1,
        type: 'ALERT_1',
        bericht: 'Contract verloopt MORGEN - onmiddellijke actie vereist',
      };
    }

    return null;
  }

  /**
   * Create reminder notification
   */
  static createReminderNotification(obligation: ObligationStatus): {
    titel: string;
    beschrijving: string;
    prioriteit: string;
    vervaldatum: Date;
  } {
    const nu = new Date();
    const daysUntilDue = Math.floor((obligation.vervaldatum.getTime() - nu.getTime()) / (1000 * 60 * 60 * 24));

    return {
      titel: `Herinnering: ${obligation.omschrijving}`,
      beschrijving:
        daysUntilDue > 0
          ? `Vervaldatum: ${this.formatDate(obligation.vervaldatum)} (${daysUntilDue} dag${daysUntilDue === 1 ? '' : 'en'})`
          : `VERVALLEN: ${Math.abs(daysUntilDue)} dag${Math.abs(daysUntilDue) === 1 ? '' : 'en'} geleden`,
      prioriteit: obligation.prioriteit,
      vervaldatum: obligation.vervaldatum,
    };
  }

  /**
   * Batch update obligations based on time passage
   */
  static updateObligationStates(obligations: ObligationStatus[]): ObligationStatus[] {
    const nu = new Date();

    return obligations.map(o => {
      const vervalt = new Date(o.vervaldatum);
      const daysOverdue = Math.floor((nu.getTime() - vervalt.getTime()) / (1000 * 60 * 60 * 24));

      // Update status if necessary
      if (o.status === 'AUSSTEHEND' && daysOverdue > 0) {
        return { ...o, status: 'VERVALLEN', dagenvervallen: daysOverdue };
      }

      return o;
    });
  }

  /**
   * Format date in Dutch format
   */
  private static formatDate(date: Date): string {
    return new Intl.DateTimeFormat('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return `OBL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
