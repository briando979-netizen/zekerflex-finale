import { z } from 'zod';
import type { ContractTemplateInput, SmartClause, TemplateVariable } from './templates';

/**
 * AI-Powered Contract Generation Module
 * Generates contracts by populating templates with customer/vendor data
 * and applying smart clause logic
 */

export const GenerationContextSchema = z.object({
  templateId: z.string(),
  leverancierId: z.string(),
  leverancierData: z.object({
    naam: z.string(),
    email: z.string().email(),
    adres: z.string().optional(),
    kvkNummer: z.string().optional(),
  }),
  klantData: z.object({
    naam: z.string(),
    email: z.string().email(),
    adres: z.string().optional(),
  }),
  contractDetails: z.object({
    titel: z.string(),
    waarde: z.number().positive(),
    begindatum: z.coerce.date(),
    einddatum: z.coerce.date().optional(),
    beschrijving: z.string().optional(),
  }),
  variabeleWaarden: z.record(z.any()),
  aiModel: z.string().optional(),
});

export type GenerationContext = z.infer<typeof GenerationContextSchema>;

export interface GeneratedContract {
  id: string;
  inhoud: string;
  html: string;
  variabelen: Record<string, string>;
  toegepasteClauses: SmartClause[];
  risicoWaarschuwingen: string[];
  gegenereerddoor: string;
  gegenereerDatum: Date;
}

export class ContractGenerator {
  /**
   * Generate contract by populating template with context data
   */
  static async generate(
    template: ContractTemplateInput,
    context: GenerationContext,
    aiModel?: string
  ): Promise<GeneratedContract> {
    const id = this.generateId();
    const gegenereerddoor = aiModel || 'default-template-engine';

    // Step 1: Prepare variables
    const variabelen = this.prepareVariables(template.variabelen, context);

    // Step 2: Apply smart clauses based on context
    const toegepasteClauses = this.selectAndApplySmartClauses(
      template.slimmeClausules || [],
      context,
      variabelen
    );

    // Step 3: Generate content by substituting variables
    let inhoud = template.inhoud;
    Object.entries(variabelen).forEach(([sleutel, waarde]) => {
      inhoud = inhoud.replace(new RegExp(`\\{\\{${sleutel}\\}\\}`, 'g'), String(waarde));
    });

    // Step 4: Add clauses to content
    toegepasteClauses.forEach(clause => {
      let clauseText = clause.template;
      Object.entries(variabelen).forEach(([sleutel, waarde]) => {
        clauseText = clauseText.replace(new RegExp(`\\{\\{${sleutel}\\}\\}`, 'g'), String(waarde));
      });
      inhoud += `\n\n## ${clause.name}\n${clauseText}`;
    });

    // Step 5: Generate HTML version
    const html = this.convertToHtml(inhoud);

    // Step 6: Identify risk warnings
    const risicoWaarschuwingen = this.identifyRisks(inhoud, context);

    return {
      id,
      inhoud,
      html,
      variabelen,
      toegepasteClauses,
      risicoWaarschuwingen,
      gegenereerddoor,
      gegenereerDatum: new Date(),
    };
  }

  /**
   * Prepare variables by combining template defaults with context
   */
  private static prepareVariables(
    templateVars: Record<string, TemplateVariable>,
    context: GenerationContext
  ): Record<string, string | number | Date> {
    const variabelen: Record<string, string | number | Date> = {};

    // Add standard fields
    variabelen['leverancier_naam'] = context.leverancierData.naam;
    variabelen['leverancier_email'] = context.leverancierData.email;
    variabelen['klant_naam'] = context.klantData.naam;
    variabelen['klant_email'] = context.klantData.email;
    variabelen['contract_titel'] = context.contractDetails.titel;
    variabelen['contract_waarde'] = `€${(context.contractDetails.waarde / 100).toFixed(2)}`;
    variabelen['begindatum'] = this.formatDate(context.contractDetails.begindatum);

    if (context.contractDetails.einddatum) {
      variabelen['einddatum'] = this.formatDate(context.contractDetails.einddatum);
      const duur = Math.round(
        (context.contractDetails.einddatum.getTime() - context.contractDetails.begindatum.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      variabelen['duur_dagen'] = duur;
      variabelen['duur_jaren'] = Math.round(duur / 365);
    }

    // Merge with provided variables
    Object.entries(context.variabeleWaarden).forEach(([sleutel, waarde]) => {
      variabelen[sleutel] = waarde;
    });

    return variabelen;
  }

  /**
   * Select and apply smart clauses based on context
   */
  private static selectAndApplySmartClauses(
    clauses: SmartClause[],
    context: GenerationContext,
    variabelen: Record<string, string | number | Date>
  ): SmartClause[] {
    return clauses
      .filter(clause => {
        // Check if clause conditions are met
        if (!clause.conditions) return true;

        return Object.entries(clause.conditions).every(([key, expectedValue]) => {
          const contextValue = (context as any)[key];
          return contextValue === expectedValue;
        });
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Identify potential risks in generated contract
   */
  private static identifyRisks(inhoud: string, context: GenerationContext): string[] {
    const waarschuwingen: string[] = [];

    // Check contract duration
    if (context.contractDetails.einddatum) {
      const duur = context.contractDetails.einddatum.getTime() - context.contractDetails.begindatum.getTime();
      const jaren = duur / (1000 * 60 * 60 * 24 * 365);

      if (jaren > 5) {
        waarschuwingen.push('Lange contractduur (> 5 jaar): Overweeg clausules voor marktaanpassingen');
      }
    }

    // Check for missing critical sections
    const criticalSections = ['betaling', 'aansprakelijkheid', 'beëindiging', 'geschillen'];
    criticalSections.forEach(section => {
      if (!inhoud.toLowerCase().includes(section)) {
        waarschuwingen.push(`Waarschuwing: Geen duidelijke ${section}-clausule gevonden`);
      }
    });

    // Check contract value
    if (context.contractDetails.waarde > 50000 * 100) { // > €50k
      waarschuwingen.push('Hoge contractwaarde: Aanbeveling voor juridische review');
    }

    return waarschuwingen;
  }

  /**
   * Convert markdown to HTML
   */
  private static convertToHtml(inhoud: string): string {
    let html = inhoud
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^/gm, '<p>')
      .replace(/$/gm, '</p>');

    return `<!DOCTYPE html><html><body>${html}</body></html>`;
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
   * Generate unique contract ID
   */
  private static generateId(): string {
    return `CTR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
